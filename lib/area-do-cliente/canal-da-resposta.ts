/**
 * PARA ONDE VAI A RESPOSTA — e o aviso pelo canal quando ela vai para a área.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────────────────────────
 * A resposta vai para onde a pessoa falou por último. A última mensagem dela veio da área
 * (`metadata.origem = 'area'`, ver `chat.ts`)? A resposta fica na área — do agente, da régua de silêncio,
 * do retorno agendado ou de alguém da equipe pelo Desk. Veio do WhatsApp? Sai pelo WhatsApp, como sempre.
 * Assim a conversa muda de lugar quando ELA muda, sem ninguém escolher.
 *
 * ─── O aviso ─────────────────────────────────────────────────────────────────────────────────────
 * Resposta na área que a pessoa não está olhando não é resposta. Quando ela não abre a área há mais de
 * `AUSENTE_DEPOIS_DE_MS`, sai pelo canal UMA mensagem curta com o link pessoal ("te respondi na sua área"),
 * e só uma até ela voltar à área. O aviso respeita a regra de 24 horas: só para quem escreveu nas últimas
 * 24 horas — e, no canal que exige modelo fora da janela, só se ela escreveu PELO CANAL nesse tempo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { capabilitiesOf } from "@/lib/channels/capabilities";
import type { ChannelProvider } from "@/lib/channels/types";

import { lerConfigDaArea } from "./config";
import { MARCA_DO_AVISO, ORIGEM_DA_AREA } from "./chat";
import { registrarEvento } from "./eventos";
import { gerarToken, hashDoToken } from "./token";
import { VALIDADE_DO_CONVITE_DIAS, caminhoPublicoDaArea } from "./vocabulario";

/** Sem abrir a área há mais que isto, ela não está olhando: a resposta ganha o aviso pelo canal. */
export const AUSENTE_DEPOIS_DE_MS = 2 * 60_000;
const DIA_MS = 24 * 3_600_000;

/** A resposta desta conversa fica na área? Puro: recebe a última entrada e os metadados do envio. */
export function vaiParaAArea(
  ultimaEntrada: { metadata: Record<string, unknown> | null } | null,
  metadataDoEnvio: Record<string, unknown> | null | undefined,
): boolean {
  if (metadataDoEnvio?.[MARCA_DO_AVISO] === true) return false;
  if (metadataDoEnvio?.entrega === "canal") return false;
  return ultimaEntrada?.metadata?.origem === ORIGEM_DA_AREA;
}

/** Lê a última entrada da conversa e decide. Na dúvida (erro de leitura), sai pelo canal — como sempre foi. */
export async function respostaVaiParaAArea(
  db: SupabaseClient,
  args: { organizationId: string; conversationId: string; metadata?: Record<string, unknown> | null },
): Promise<boolean> {
  if (args.metadata?.[MARCA_DO_AVISO] === true || args.metadata?.entrega === "canal") return false;
  const { data, error } = await db
    .from("messages")
    .select("metadata")
    .eq("organization_id", args.organizationId)
    .eq("conversation_id", args.conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return false;
  return vaiParaAArea(((data ?? [])[0] as { metadata: Record<string, unknown> | null } | undefined) ?? null, args.metadata);
}

/**
 * O aviso sai agora? Puro. `vistoEm` = a última vez que ela abriu a área; `avisadoEm` = o último aviso
 * nesta conversa; `ultimaEntradaEm` / `ultimaEntradaPeloCanalEm` = as últimas mensagens dela.
 */
export function deveAvisar(
  s: {
    vistoEm: string | null;
    avisadoEm: string | null;
    ultimaEntradaEm: string | null;
    ultimaEntradaPeloCanalEm: string | null;
    canalExigeJanela: boolean;
  },
  agora: Date,
): boolean {
  const t = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const visto = t(s.vistoEm);
  if (visto !== null && agora.getTime() - visto < AUSENTE_DEPOIS_DE_MS) return false;
  const avisado = t(s.avisadoEm);
  // Já avisou e ela não voltou à área desde então: um aviso basta.
  if (avisado !== null && (visto === null || avisado > visto)) return false;
  const entrada = t(s.canalExigeJanela ? s.ultimaEntradaPeloCanalEm : s.ultimaEntradaEm);
  return entrada !== null && agora.getTime() - entrada < DIA_MS;
}

/** O texto do aviso. Curto, sem oferta: só leva a pessoa até a resposta. */
export function textoDoAviso(nomeDaPessoa: string | null, nomeDeQuemResponde: string | null, link: string): string {
  const quem = nomeDeQuemResponde?.trim() || "A gente";
  const nome = nomeDaPessoa?.trim().split(/\s+/)[0];
  return `${nome ? `${nome}, ` : ""}${quem} te respondeu na sua área 🌙 Toca aqui pra ver: ${link}`;
}

/**
 * Monta o aviso desta conversa, ou `null` se não é hora. Cria o link pessoal (convite novo, como o da
 * conversa) só quando o aviso vai sair. Nunca lança: aviso que falha não pode derrubar a resposta.
 */
export async function avisoDaResposta(
  admin: SupabaseClient,
  args: { organizationId: string; conversationId: string; contactId: string; provider: string; origem: string | undefined },
): Promise<string | null> {
  try {
    const origem = (args.origem ?? "").replace(/\/+$/, "");
    if (!/^https:\/\//.test(origem)) return null;
    const [{ data: org }, { data: sessoes }, { data: avisos }, { data: entradas }, { data: contato }] = await Promise.all([
      admin.from("organizations").select("slug, settings").eq("id", args.organizationId).maybeSingle(),
      admin
        .from("area_sessoes")
        .select("last_seen_at")
        .eq("organization_id", args.organizationId)
        .eq("contact_id", args.contactId)
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(1),
      admin
        .from("messages")
        .select("created_at")
        .eq("organization_id", args.organizationId)
        .eq("conversation_id", args.conversationId)
        .eq("direction", "outbound")
        .eq(`metadata->>${MARCA_DO_AVISO}`, "true")
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("messages")
        .select("created_at, metadata")
        .eq("organization_id", args.organizationId)
        .eq("conversation_id", args.conversationId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("contacts").select("name, display_name").eq("id", args.contactId).eq("organization_id", args.organizationId).maybeSingle(),
    ]);
    const settings = (org as { settings?: unknown } | null)?.settings;
    const config = lerConfigDaArea(settings);
    const slug = (org as { slug?: string } | null)?.slug;
    if (!slug || !config.ativo) return null;
    const linhas = (entradas ?? []) as Array<{ created_at: string; metadata: Record<string, unknown> | null }>;
    const sai = deveAvisar(
      {
        vistoEm: ((sessoes ?? [])[0] as { last_seen_at?: string } | undefined)?.last_seen_at ?? null,
        avisadoEm: ((avisos ?? [])[0] as { created_at?: string } | undefined)?.created_at ?? null,
        ultimaEntradaEm: linhas[0]?.created_at ?? null,
        ultimaEntradaPeloCanalEm: linhas.find((l) => l.metadata?.origem !== ORIGEM_DA_AREA)?.created_at ?? null,
        canalExigeJanela: capabilitiesOf(args.provider as ChannelProvider).requiresTemplates,
      },
      new Date(),
    );
    if (!sai) return null;

    const token = gerarToken();
    const { error } = await admin.from("area_convites").insert({
      organization_id: args.organizationId,
      contact_id: args.contactId,
      token_hash: hashDoToken(token),
      criado_por: null,
      expires_at: new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 86_400_000).toISOString(),
    });
    if (error) return null;
    await registrarEvento(admin, { organizationId: args.organizationId, contactId: args.contactId, tipo: "convite_criado", ref: "aviso" });
    const link = `${origem}${caminhoPublicoDaArea(slug, config.apelido)}/entrar/${token}?para=conversa`;
    const pessoa = contato as { name?: string | null; display_name?: string | null } | null;
    return textoDoAviso(pessoa?.name ?? pessoa?.display_name ?? null, config.guia?.nome ?? null, link);
  } catch {
    return null;
  }
}
