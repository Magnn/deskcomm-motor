/**
 * A MANHÃ no servidor — lê a do dia em `area_manhas` (0956) ou escreve uma, uma vez por pessoa por dia.
 *
 * Quem pode: o Plano da Semana em dia ou o Círculo em dia (`temAManha`); quem chama confere. Os dados são os de
 * verdade: a carta do dia dela (`carta-do-dia.ts`), o Sol e a Lua do nascimento (`ceu.ts`), a Lua e o Sol de hoje
 * (`lib/relatorio/astrologia.ts`) e a fase da Lua (`lua.ts`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { env } from "@/lib/env";
import { idiomaDaAreaOuPortugues } from "@/lib/i18n/area-servidor";
import { logger } from "@/lib/logger";
import { mapaDoDia } from "@/lib/relatorio/astrologia";

import { MENSAGEM_DO_DIA, cartaDoDia } from "./carta-do-dia";
import { ceuDoNascimento } from "./ceu";
import { faseDaLua } from "./lua";
import { manhaGravada, type DadosDaManha, type ManhaDela } from "./manha";
import { escreverManha } from "./manha-ia";
import { ehFoco } from "./perfil";

export async function manhaDoDia(
  admin: SupabaseClient,
  org: { id: string; nome: string; titulo: string },
  d: { contactId: string; dia: string; primeiroNome: string; nascimento: string | null; agora?: Date },
): Promise<ManhaDela | null> {
  const { data: guardada } = await admin
    .from("area_manhas")
    .select("texto")
    .eq("organization_id", org.id)
    .eq("contact_id", d.contactId)
    .eq("dia", d.dia)
    .maybeSingle();
  const pronta = manhaGravada((guardada as { texto: unknown } | null)?.texto);
  if (pronta) return pronta;

  const { data: perfil } = await admin
    .from("area_perfis")
    .select("foco")
    .eq("organization_id", org.id)
    .eq("contact_id", d.contactId)
    .maybeSingle();
  const focoBruto = (perfil as { foco: string | null } | null)?.foco;
  const carta = cartaDoDia(d.contactId, d.dia);
  const ceu = ceuDoNascimento(d.nascimento);
  const hoje = mapaDoDia(d.dia);
  const dados: DadosDaManha = {
    primeiroNome: d.primeiroNome,
    foco: ehFoco(focoBruto) ? focoBruto : null,
    carta: { nome: carta.nome, mensagem: MENSAGEM_DO_DIA[carta.id] ?? "", sentidoGeral: carta.sentido.geral },
    nascimento: ceu ? { sol: ceu.sol, lua: ceu.lua, luaCerta: ceu.luaCerta } : null,
    hoje: { dia: d.dia, luaSigno: hoje.Lua.signo, solSigno: hoje.Sol.signo, fase: faseDaLua(d.agora ?? new Date()) },
  };

  let r: Awaited<ReturnType<typeof escreverManha>>;
  try {
    r = await escreverManha(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: d.contactId,
      empresa: org.titulo || org.nome,
      dados,
      idioma: await idiomaDaAreaOuPortugues(),
    });
  } catch (err) {
    logger.error("[area.manha] não escrita", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return null;
  }
  if (!r.ok) {
    logger.warn("[area.manha] resposta inválida", { organization_id: org.id });
    return null;
  }
  // Duas abas ao mesmo tempo: a segunda não sobrescreve a primeira; vale a que ficou gravada.
  const { error } = await admin
    .from("area_manhas")
    .upsert(
      { organization_id: org.id, contact_id: d.contactId, dia: d.dia, texto: r.manha, modelo: r.modelo },
      { onConflict: "organization_id,contact_id,dia", ignoreDuplicates: true },
    );
  if (error) logger.warn("[area.manha] não gravada", { organization_id: org.id, motivo: error.message.slice(0, 200) });
  return r.manha;
}
