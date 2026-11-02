/**
 * O CHAT DA ÁREA — a conversa com a empresa dentro da área do cliente, como um aplicativo de conversa.
 *
 * ─── Por quê ─────────────────────────────────────────────────────────────────────────────────────
 * Pedido do dono em 02/11/2026: "ir tirando o poder do zap e fazer os atendimentos por ali". Até aqui a
 * área tinha um "Fale com a gente" que gravava num lugar à parte (`area_mensagens`), que só a equipe
 * respondia, e o histórico do WhatsApp só para ler. Medido: 1 mensagem no "Fale com a gente" desde que ele
 * existe, enquanto 27 pessoas entraram na área numa semana.
 *
 * ─── Como ────────────────────────────────────────────────────────────────────────────────────────
 * A conversa é UMA SÓ. O que a pessoa escreve na área vira mensagem de ENTRADA na mesma conversa do Desk
 * (a do número que a atende), marcada `metadata.origem = 'area'`, e passa pelos mesmos efeitos de qualquer
 * entrada (`aplicarEfeitosPosEntrada`): o agente acorda, lê o histórico inteiro e responde. Para onde a
 * resposta vai é decidido no envio (`canal-da-resposta.ts`): escreveu na área, a resposta fica na área.
 *
 * A área lê `messages` do contato, dos dois lados e de todas as origens: quem conversou pelo WhatsApp vê
 * a mesma conversa ali, e continua de onde parou.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { aplicarEfeitosPosEntrada } from "@/lib/channels/pos-entrada";
import { marcarConversaComMensagem } from "@/lib/channels/marcar-conversa";
import type { createAdminClient } from "@/lib/supabase/admin";

/** A marca da mensagem que nasceu na área. É o que decide para onde a resposta vai. */
export const ORIGEM_DA_AREA = "area";
/** A marca do aviso pelo canal ("a Cigana te respondeu na sua área"): não aparece no chat da área. */
export const MARCA_DO_AVISO = "aviso_da_area";
/** O bucket privado das mídias da conversa (o mesmo do canal). */
export const BUCKET_DO_CHAT = "whatsapp-media";
/** Quantas mensagens o chat traz de uma vez. */
export const LIMITE_DO_CHAT = 300;
/** Validade do endereço assinado de uma mídia do chat. */
const VALIDADE_DA_MIDIA_S = 3_600;
/** Teto de um arquivo mandado pela área (áudio gravado ou foto). */
export const TETO_DO_ARQUIVO_BYTES = 16 * 1024 * 1024;

export type TipoNoChat = "texto" | "imagem" | "audio" | "video" | "documento" | "pix";

export interface MensagemDoChat {
  id: string;
  de: "voce" | "empresa";
  tipo: TipoNoChat;
  /** O texto do balão: a mensagem, a legenda, ou (no Pix) a frase antes do código. */
  texto: string;
  /** O código Pix copia e cola, quando a mensagem traz um. */
  pix: string | null;
  /** O endereço assinado da mídia, quando há. */
  midia: string | null;
  /** A transcrição do áudio, quando já existe. */
  transcricao: string | null;
  quando: string;
  /** `lida`: a empresa respondeu depois (das suas) ou você já abriu o chat depois (das dela). */
  status: "enviada" | "entregue" | "lida" | "falhou";
}

export interface LinhaDaMensagem {
  id: string;
  direction: string;
  type: string;
  body: string | null;
  media_storage_path: string | null;
  media_derived_text: string | null;
  status: string | null;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** O código Pix copia e cola dentro de um texto: começa em `000201` e vai até o fim da linha. */
const CODIGO_PIX = /(?:^|\s)(000201\S{20,})/;

const TIPO_NO_CHAT: Record<string, TipoNoChat> = {
  text: "texto",
  image: "imagem",
  audio: "audio",
  video: "video",
  document: "documento",
  sticker: "imagem",
};

/**
 * Regra pura: as linhas de `messages` do contato viram os balões do chat, da mais antiga para a mais nova.
 * Saem o aviso pelo canal (ele existe para trazer a pessoa ATÉ aqui), o que não tem conteúdo nenhum, e
 * linhas de sistema (reação, cartão de contato). `urls` traz o endereço assinado de cada mídia, pela id.
 */
export function mensagensDoChat(linhas: readonly LinhaDaMensagem[], urls: ReadonlyMap<string, string> = new Map()): MensagemDoChat[] {
  const saida: MensagemDoChat[] = [];
  const ordenadas = [...linhas].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  // A última resposta da empresa marca como lidas as mensagens dela que vieram antes.
  const ultimaDaEmpresa = [...ordenadas].reverse().find((l) => l.direction === "outbound")?.created_at ?? null;
  for (const l of ordenadas) {
    if (l.metadata?.[MARCA_DO_AVISO] === true) continue;
    const base = TIPO_NO_CHAT[l.type];
    if (!base) continue;
    const corpo = (l.body ?? "").trim();
    const midia = l.media_storage_path ? (urls.get(l.id) ?? null) : null;
    if (base !== "texto" && !midia && corpo === "" && !(l.media_derived_text ?? "").trim()) continue;
    if (base === "texto" && corpo === "") continue;
    const pix = base === "texto" ? (CODIGO_PIX.exec(corpo)?.[1] ?? null) : null;
    const de = l.direction === "inbound" ? "voce" : "empresa";
    const status: MensagemDoChat["status"] =
      l.status === "failed"
        ? "falhou"
        : de === "voce"
          ? ultimaDaEmpresa !== null && ultimaDaEmpresa > l.created_at
            ? "lida"
            : "entregue"
          : l.read_at
            ? "lida"
            : l.status === "queued"
              ? "enviada"
              : "entregue";
    saida.push({
      id: l.id,
      de,
      tipo: pix ? "pix" : base,
      texto: pix ? corpo.replace(pix, "").trim() : corpo,
      pix,
      midia,
      transcricao: base === "audio" ? ((l.media_derived_text ?? "").trim() || null) : null,
      quando: l.created_at,
      status,
    });
  }
  return saida;
}

/** O chat do contato, com os endereços das mídias assinados. */
export async function lerChat(admin: SupabaseClient, orgId: string, contactId: string): Promise<MensagemDoChat[]> {
  const { data } = await admin
    .from("messages")
    .select("id, direction, type, body, media_storage_path, media_derived_text, status, read_at, metadata, created_at")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(LIMITE_DO_CHAT);
  const linhas = (data ?? []) as LinhaDaMensagem[];
  const comMidia = linhas.filter((l) => l.media_storage_path && TIPO_NO_CHAT[l.type] && TIPO_NO_CHAT[l.type] !== "texto");
  const urls = new Map<string, string>();
  if (comMidia.length > 0) {
    const { data: assinadas } = await admin.storage
      .from(BUCKET_DO_CHAT)
      .createSignedUrls(comMidia.map((l) => l.media_storage_path as string), VALIDADE_DA_MIDIA_S);
    comMidia.forEach((l, i) => {
      const url = assinadas?.[i]?.signedUrl;
      if (url) urls.set(l.id, url);
    });
  }
  return mensagensDoChat(linhas, urls);
}

/**
 * A pessoa abriu o chat: as mensagens da empresa até agora ficam lidas, e a presença dela na área é
 * renovada — é por ela que o aviso pelo canal sabe se ela está olhando (`canal-da-resposta.ts`).
 */
export async function marcarChatVisto(admin: SupabaseClient, orgId: string, contactId: string, sessaoId: string): Promise<void> {
  const agora = new Date().toISOString();
  await Promise.all([
    admin
      .from("messages")
      .update({ read_at: agora })
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .is("read_at", null),
    admin.from("area_sessoes").update({ last_seen_at: agora }).eq("id", sessaoId).eq("organization_id", orgId),
  ]);
}

/**
 * O agente está escrevendo para esta pessoa agora: há um turno dela na fila, vencido ou para os próximos
 * segundos (a janela de agrupamento), ou rodando. É o "digitando…" do chat.
 */
export async function empresaDigitando(admin: SupabaseClient, orgId: string, contactId: string): Promise<boolean> {
  const { data } = await admin
    .from("job_queue")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .in("kind", ["inbound_turn", "followup_turn"])
    .in("status", ["pending", "running"])
    .lte("run_after", new Date(Date.now() + 2 * 60_000).toISOString())
    .limit(1);
  return (data ?? []).length > 0;
}

/**
 * A conversa onde a mensagem da área entra: a do contato que falou por último, num número que ainda está
 * ligado. `null` = o contato nunca conversou (a área só existe para quem já conversou e comprou).
 */
export async function conversaDaArea(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<{ id: string; channelSessionId: string } | null> {
  const { data } = await admin
    .from("conversations")
    .select("id, channel_session_id, last_message_at, channel_sessions:channel_session_id(archived_at)")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("is_group", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(10);
  const linhas = (data ?? []) as unknown as Array<{
    id: string;
    channel_session_id: string;
    channel_sessions: { archived_at: string | null } | null;
  }>;
  const viva = linhas.find((c) => !c.channel_sessions?.archived_at) ?? null;
  return viva ? { id: viva.id, channelSessionId: viva.channel_session_id } : null;
}

export type ConteudoDaArea =
  | { tipo: "texto"; texto: string }
  | { tipo: "arquivo"; bytes: Uint8Array; mime: string; legenda: string | null };

/** O tipo da mensagem pelo MIME do arquivo que veio da área. `null` = não aceito. */
export function tipoDoArquivo(mime: string): "audio" | "image" | null {
  const m = mime.toLowerCase().split(";")[0]!.trim();
  if (m.startsWith("audio/")) return "audio";
  if (m === "image/jpeg" || m === "image/png" || m === "image/webp" || m === "image/heic") return "image";
  return null;
}

const EXTENSAO: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/aac": "aac",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** A prévia da conversa no Desk para o que chegou pela área. */
export function previaDaArea(c: ConteudoDaArea): string {
  if (c.tipo === "texto") return c.texto.slice(0, 120);
  return tipoDoArquivo(c.mime) === "audio" ? "🎤 Áudio (pela área)" : `📷 ${c.legenda ?? "Foto"} (pela área)`.slice(0, 120);
}

/**
 * A pessoa escreveu (ou mandou áudio/foto) pela área: grava como ENTRADA na conversa dela e aplica os
 * efeitos de toda entrada, na mesma ordem dos canais. Mídia sobe para o bucket da conversa e pede a
 * derivação (transcrição/descrição), que o dreno espera antes de acordar o agente.
 */
export async function receberDaArea(
  admin: ReturnType<typeof createAdminClient>,
  args: { orgId: string; contactId: string; nome: string | null; conteudo: ConteudoDaArea },
): Promise<{ ok: true; mensagem: MensagemDoChat } | { ok: false; motivo: "sem_conversa" | "arquivo_recusado" | "falhou" }> {
  const conversa = await conversaDaArea(admin as unknown as SupabaseClient, args.orgId, args.contactId);
  if (!conversa) return { ok: false, motivo: "sem_conversa" };
  const agora = new Date().toISOString();
  const id = crypto.randomUUID();

  let tipo: "text" | "audio" | "image" = "text";
  let corpo: string | null = null;
  let caminho: string | null = null;
  let mime: string | null = null;
  let tamanho: number | null = null;
  if (args.conteudo.tipo === "texto") {
    corpo = args.conteudo.texto;
  } else {
    const t = tipoDoArquivo(args.conteudo.mime);
    if (!t || args.conteudo.bytes.byteLength === 0 || args.conteudo.bytes.byteLength > TETO_DO_ARQUIVO_BYTES) {
      return { ok: false, motivo: "arquivo_recusado" };
    }
    tipo = t;
    mime = args.conteudo.mime.split(";")[0]!.trim().toLowerCase();
    tamanho = args.conteudo.bytes.byteLength;
    corpo = args.conteudo.legenda;
    // O caminho é o da conversa: é o que o envio e a área conferem (`isMediaPathOwnedBy`).
    caminho = `${args.orgId}/${conversa.id}/area-${id}.${EXTENSAO[mime] ?? "bin"}`;
    const { error } = await admin.storage.from(BUCKET_DO_CHAT).upload(caminho, args.conteudo.bytes, { contentType: mime, upsert: false });
    if (error) return { ok: false, motivo: "falhou" };
  }

  const { data, error } = await admin
    .from("messages")
    .insert({
      id,
      organization_id: args.orgId,
      conversation_id: conversa.id,
      channel_session_id: conversa.channelSessionId,
      contact_id: args.contactId,
      type: tipo,
      direction: "inbound",
      status: "delivered",
      body: corpo,
      media_storage_path: caminho,
      media_mime: mime,
      media_size_bytes: tamanho,
      sent_at: agora,
      delivered_at: agora,
      metadata: { origem: ORIGEM_DA_AREA },
    })
    .select("id, direction, type, body, media_storage_path, media_derived_text, status, read_at, metadata, created_at")
    .single();
  if (error || !data) return { ok: false, motivo: "falhou" };

  if (caminho) {
    const { error: erroDoPedido } = await admin.rpc("emit_event" as never, {
      p_event_type: "media.derive_requested",
      p_entity_kind: "message",
      p_entity_id: id,
      p_payload: { message_id: id },
      p_metadata: { source: "area" },
      p_organization_id: args.orgId,
    } as never);
    if (erroDoPedido) console.error("[area.chat] pedido de transcrição falhou", erroDoPedido.message);
  }

  await marcarConversaComMensagem(admin as unknown as SupabaseClient, {
    organizationId: args.orgId,
    conversationId: conversa.id,
    direction: "inbound",
    preview: previaDaArea(args.conteudo),
    at: agora,
    canal: "area",
  });
  await aplicarEfeitosPosEntrada(admin, {
    organizationId: args.orgId,
    contactId: args.contactId,
    conversationId: conversa.id,
    messageId: id,
    channelSessionId: conversa.channelSessionId,
    texto: corpo,
    nomeDoContato: args.nome,
    origem: "area_do_cliente",
  });

  let midia: string | null = null;
  if (caminho) {
    const { data: assinada } = await admin.storage.from(BUCKET_DO_CHAT).createSignedUrl(caminho, VALIDADE_DA_MIDIA_S);
    midia = assinada?.signedUrl ?? null;
  }
  const linha = data as LinhaDaMensagem;
  const [mensagem] = mensagensDoChat([linha], midia ? new Map([[linha.id, midia]]) : new Map());
  return mensagem ? { ok: true, mensagem } : { ok: false, motivo: "falhou" };
}
