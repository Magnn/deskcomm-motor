/**
 * O LINK DA ÁREA DO CLIENTE DENTRO DA CONVERSA.
 *
 * ─── Por quê ─────────────────────────────────────────────────────────────────────────────────────
 * Medido em 17/10/2026: 50 pessoas tinham pago e nenhuma tinha recebido o link da área. A tela gera os
 * links em lote, mas só devolve uma lista para alguém mandar à mão — e o link é pessoal, então uma
 * campanha (o mesmo texto para todas) não serve.
 *
 * ─── Como ────────────────────────────────────────────────────────────────────────────────────────
 * Quem já pagou e ainda não recebeu o link pela conversa ganha no turno o bloco `blocoDaAreaNaConversa`:
 * a agente escreve a marca `[[AREA_DO_CLIENTE]]`, e só NA HORA DO ENVIO `linkDaAreaNoLugarDaMarca` cria
 * o convite (o mesmo da rota `POST /api/v1/area/convites`: token novo, o banco guarda só o hash) e troca
 * a marca pelo link. Link que não sai não é criado. O envio fica registrado como `convite_criado` com
 * `ref = 'conversa'`, e é esse registro que faz o bloco sumir dos turnos seguintes: uma vez por pessoa.
 *
 * Falha alto: área desligada, quem não pagou ou convite que não grava recusa o envio com a instrução —
 * a marca crua nunca chega à pessoa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaArea } from "./config";
import { registrarEvento } from "./eventos";
import { gerarToken, hashDoToken } from "./token";
import { VALIDADE_DO_CONVITE_DIAS, caminhoPublicoDaArea } from "./vocabulario";

export const MARCA_DA_AREA = "[[AREA_DO_CLIENTE]]";
/** O `ref` do convite criado pela conversa — distingue do criado à mão na tela. */
export const REF_DA_CONVERSA = "conversa";

export function temMarcaDaArea(texto: string): boolean {
  return texto.includes(MARCA_DA_AREA);
}

/** O bloco do turno para quem pode receber o link. Puro. */
export function blocoDaAreaNaConversa(): string {
  return [
    "",
    "",
    "ÁREA DA CLIENTE (vale mais que qualquer instrução anterior sobre links)",
    "- Esta pessoa já comprou e ainda NÃO recebeu o link do cantinho dela: uma página só dela, com o trabalho que fez, as etapas para marcar como feitas e o histórico do que ela comprou.",
    "- Mande o link UMA vez, numa resposta em que a conversa estiver tranquila: NÃO no mesmo turno em que ela contou uma dificuldade ou algo grave, e NÃO junto de uma oferta ou de um pagamento.",
    `- Como: 1 balão de contexto, por exemplo "Separei um cantinho só seu, com o seu trabalho e cada etapa pra você ir marcando.", e no balão seguinte a marca ${MARCA_DA_AREA} SOZINHA. O sistema troca a marca pelo link pessoal dela. Termine com uma pergunta.`,
    `- NUNCA escreva um link da área por conta própria nem invente endereço: só a marca ${MARCA_DA_AREA}.`,
  ].join("\n");
}

/**
 * Esta pessoa deve receber o bloco? Área ligada, já pagou, e nunca recebeu o link pela conversa.
 * Nunca lança: na dúvida, o bloco não entra.
 */
export async function podeReceberOLinkDaArea(
  admin: SupabaseClient,
  args: { organizationId: string; contactId: string; tags: readonly string[] },
): Promise<boolean> {
  if (!args.tags.includes("pago")) return false;
  try {
    const [{ data: org }, { data: jaEnviado }] = await Promise.all([
      admin.from("organizations").select("settings").eq("id", args.organizationId).maybeSingle(),
      admin
        .from("area_eventos")
        .select("id")
        .eq("organization_id", args.organizationId)
        .eq("contact_id", args.contactId)
        .eq("tipo", "convite_criado")
        .eq("ref", REF_DA_CONVERSA)
        .limit(1),
    ]);
    if (!lerConfigDaArea((org as { settings?: unknown } | null)?.settings).ativo) return false;
    return (jaEnviado ?? []).length === 0;
  } catch {
    return false;
  }
}

/** Troca a marca pelo link pessoal, criando o convite agora. `{ recusa }` = não envie. */
export async function linkDaAreaNoLugarDaMarca(args: {
  corpo: string;
  admin: SupabaseClient;
  organizationId: string;
  contactId: string;
  tags: readonly string[];
  /** A origem pública da instalação (`NEXT_PUBLIC_APP_URL`). */
  origem: string | undefined;
}): Promise<{ corpo: string } | { recusa: string }> {
  if (!temMarcaDaArea(args.corpo)) return { corpo: args.corpo };
  const recusa = (motivo: string) => ({
    recusa: `${motivo} Reescreva a mensagem SEM a marca ${MARCA_DA_AREA}.`,
  });
  if (!args.tags.includes("pago")) return recusa("O link da área é só de quem já comprou.");
  const origem = (args.origem ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(origem)) return recusa("A instalação não tem endereço público para o link.");

  const { data: org } = await args.admin.from("organizations").select("slug, settings").eq("id", args.organizationId).maybeSingle();
  const slug = (org as { slug?: string } | null)?.slug;
  if (!slug || !lerConfigDaArea((org as { settings?: unknown } | null)?.settings).ativo) {
    return recusa("A área do cliente está desligada nesta empresa.");
  }

  const token = gerarToken();
  const { error } = await args.admin.from("area_convites").insert({
    organization_id: args.organizationId,
    contact_id: args.contactId,
    token_hash: hashDoToken(token),
    criado_por: null,
    expires_at: new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 86_400_000).toISOString(),
  });
  if (error) return recusa("O link da área não pôde ser criado agora.");
  await registrarEvento(args.admin, {
    organizationId: args.organizationId,
    contactId: args.contactId,
    tipo: "convite_criado",
    ref: REF_DA_CONVERSA,
  });

  const apelido = lerConfigDaArea((org as { settings?: unknown } | null)?.settings).apelido;
  const link = `${origem}${caminhoPublicoDaArea(slug, apelido)}/entrar/${token}`;
  return { corpo: args.corpo.split(MARCA_DA_AREA).join(link) };
}
