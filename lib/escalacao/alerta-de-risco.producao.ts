/**
 * As portas de produção de `./alerta-de-risco.ts`: Supabase, e-mail e o mesmo
 * transporte do aviso de caso. O WhatsApp respeita o espaçamento e o teto do
 * número, mas não a janela de horário: quem recebe é a equipe.
 *
 * ⚠️ CLIENT SERVICE-ROLE BYPASSA RLS: toda consulta filtra `organization_id`, e a
 * organização vem da própria passagem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarPacingDoCanal } from "@/lib/agent-engine/pacing/ledger-supabase";
import { marcaDaSaida } from "@/lib/branding/saida";
import { type ContatoNomeavel, nomeDoContato as nomeLegivel } from "@/lib/contacts/rotulo-do-contato";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { logger } from "@/lib/logger";

import type { DepsDoAlerta, DesfechoDoWhatsapp, PassagemEmAberto, TextoDoAlerta } from "./alerta-de-risco";
import { createSupabaseAvisoDb } from "./aviso-ao-suporte";
import { criarTransporteDoAviso } from "./aviso-ao-suporte.handler";

/** Teto por rodada; a sobra entra na seguinte. */
const LIMITE_DA_VARREDURA = 500;

function emHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/https?:\/\/\S+/g, (url) => `<a href="${url}">${url}</a>`)
    .replace(/\n/g, "<br>");
}

async function emailsDeQuemAdministra(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "admin")
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
  const emails = await Promise.all(
    (data ?? []).map(async (linha) => {
      const { data: usuario } = await admin.auth.admin.getUserById(linha.user_id as string);
      return usuario.user?.email ?? null;
    }),
  );
  return emails.filter((email): email is string => email !== null);
}

async function enviarEmail(admin: SupabaseClient, orgId: string, alerta: TextoDoAlerta): Promise<boolean> {
  const destinatarios = await emailsDeQuemAdministra(admin, orgId);
  if (destinatarios.length === 0) return false;
  const marca = await marcaDaSaida(orgId);
  const r = await sendEmail({
    to: destinatarios,
    subject: alerta.assunto,
    html: emHtml(alerta.corpo),
    text: alerta.corpo,
    fromName: marca.nome,
  });
  return r.ok;
}

async function enviarWhatsapp(admin: SupabaseClient, orgId: string, corpo: string): Promise<DesfechoDoWhatsapp> {
  const db = createSupabaseAvisoDb(admin);
  const cfg = await db.carregaConfig(orgId);
  if (!cfg?.ligado || !cfg.channel_session_id) return "sem_configuracao";

  const canal = await db.carregaCanal(orgId, cfg.channel_session_id);
  if (!canal || canal.archived_at || !canal.aceitaMensagemLivre || canal.status !== "WORKING") return "falhou";

  const transporte = await criarTransporteDoAviso(admin);
  if (!(await transporte.configurado(orgId, canal))) return "falhou";

  const pacing = await criarPacingDoCanal(admin);
  const agora = new Date();
  const decisao = await pacing.decide(orgId, canal.id, agora);
  if (!decisao.liberado) return "adiado";

  const destino = cfg.destino_jid ?? (await transporte.resolveDestino(orgId, canal, cfg.telefone_destino));
  if (!destino) return "falhou";
  await transporte.envia(orgId, canal, destino, corpo);
  await pacing.registraEnvio(orgId, canal.id, agora);
  return "enviado";
}

export function criarDepsDoAlerta(admin: SupabaseClient): DepsDoAlerta {
  return {
    async passagensEmAberto(desde) {
      const { data, error } = await admin
        .from("passagens_de_atendimento")
        .select(
          "id, organization_id, contact_id, conversation_id, criado_em, title, notes, content, alertas_de_risco, ultimo_alerta_de_risco_em",
        )
        .is("reconhecido_em", null)
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .limit(LIMITE_DA_VARREDURA);
      if (error) throw new Error(error.message);
      return (data ?? []) as PassagemEmAberto[];
    },

    async nomeDoContato(orgId, contactId) {
      const { data } = await admin
        .from("contacts")
        .select("display_name, name")
        .eq("organization_id", orgId)
        .eq("id", contactId)
        .maybeSingle();
      return nomeLegivel(data as ContatoNomeavel | null);
    },

    async idiomaDaOrganizacao(orgId) {
      const { data } = await admin.from("organizations").select("locale").eq("id", orgId).maybeSingle();
      return normalizarIdioma((data as { locale?: string | null } | null)?.locale ?? null);
    },

    enviarEmail: (orgId, alerta) => enviarEmail(admin, orgId, alerta),
    enviarWhatsapp: (orgId, corpo) => enviarWhatsapp(admin, orgId, corpo),

    async registrarAlerta(p: PassagemEmAberto, ids, tentativa, quando) {
      const { error } = await admin
        .from("passagens_de_atendimento")
        .update({ alertas_de_risco: tentativa, ultimo_alerta_de_risco_em: quando.toISOString() })
        .eq("organization_id", p.organization_id)
        .in("id", ids);
      if (error) throw new Error(error.message);
      await admin
        .from("agent_inbox_items")
        .update({ severity: "critical" })
        .eq("organization_id", p.organization_id)
        .eq("kind", "handoff")
        .eq("ref_kind", "conversation")
        .eq("ref_id", p.conversation_id)
        .eq("status", "open");
    },

    urlPublica: env.NEXT_PUBLIC_APP_URL,
    clock: () => new Date(),
    log: logger,
  };
}
