/**
 * O AVISO DA PÁGINA, lido — puro, sem banco.
 *
 * A Meta manda UM corpo por entrega com N páginas (`entry[]`) e N acontecimentos
 * por página (`messaging[]`). Este módulo só responde "o que o corpo diz": quem
 * escreveu, o quê, se foi a página respondendo (eco), se é desfecho de entrega
 * ou de leitura. Quem grava é `./ingest.ts`.
 *
 * ─── O eco, e por que ele importa ───────────────────────────────────────────
 * Toda mensagem que a PÁGINA manda volta como `is_echo: true` — tanto a nossa
 * quanto a que uma pessoa digitou na caixa de entrada da Meta. As duas têm
 * destino oposto:
 *   - eco do NOSSO app (`app_id` = o nosso): já está gravado; não vira nada.
 *     Tratá-lo como resposta manual pausaria a IA a cada mensagem que ela mesma
 *     mandou — inclusive a legenda, que sai como segunda mensagem e não tem
 *     linha própria para casar.
 *   - eco de OUTRA origem: uma pessoa respondeu por fora. Entra no histórico
 *     como saída e pausa a IA na conversa.
 *
 * ─── O endereço ─────────────────────────────────────────────────────────────
 * A pessoa é o PSID (id dela DENTRO desta página). É também o "id da thread"
 * deste canal: a conversa é sempre página × pessoa, e o envio endereça por ele.
 */
import { socialMessageId } from "../social/catalog";
import type { SocialMessage } from "../social/parser";

export type EventoDoMessenger =
  | { tipo: "mensagem"; pageId: string; mensagem: SocialMessage }
  | { tipo: "entregue"; pageId: string; externalIds: string[] }
  | { tipo: "lida"; pageId: string; psid: string; ate: string };

type Bruto = Record<string, unknown>;
const obj = (v: unknown): Bruto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const quando = (ms: unknown): string | null =>
  typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null;

/** O que a tela e o motor sabem mostrar. `fallback` (link compartilhado) e `template` viram documento. */
function anexosDe(message: Bruto): { type: string; url: string }[] {
  const saida: { type: string; url: string }[] = [];
  for (const a of arr(message.attachments)) {
    const anexo = obj(a);
    const payload = obj(anexo?.payload);
    const url = str(payload?.url);
    if (!anexo || !url || !/^https:\/\//i.test(url)) continue;
    const tipo = str(anexo.type);
    // Figurinha chega como imagem com `sticker_id`; o "curtir" é uma figurinha também.
    const type = payload?.sticker_id !== undefined ? "sticker" : tipo === "file" ? "document" : (tipo ?? "document");
    saida.push({ type, url });
  }
  return saida;
}

/**
 * O clique em anúncio "Clique para o Messenger" traz `referral` com `source: ADS`.
 * Traduzido para a forma que `extrairAtribuicaoMeta` já lê (a do WhatsApp), para a
 * atribuição ter UMA leitura só. Referência que não é de anúncio (link `m.me`,
 * QR da página) não é atribuição paga: fica de fora.
 */
export function referralDoAnuncio(bruto: unknown): Bruto | null {
  const r = obj(bruto);
  if (!r || str(r.source) !== "ADS") return null;
  const contexto = obj(r.ads_context_data);
  const adId = str(r.ad_id);
  const titulo = str(contexto?.ad_title);
  if (!adId && !titulo) return null;
  return {
    source_type: "ad",
    source_id: adId,
    headline: titulo,
    source_url: str(contexto?.photo_url) ?? str(contexto?.video_url),
    ref: str(r.ref),
    origem: "messenger",
  };
}

function mensagemDe(pageId: string, ev: Bruto, nossoAppId: string): EventoDoMessenger | null {
  const sender = str(obj(ev.sender)?.id);
  const recipient = str(obj(ev.recipient)?.id);
  const message = obj(ev.message);
  const postback = obj(ev.postback);
  if (!sender || !recipient) return null;

  // Toque em botão: o que a pessoa VIU no botão é o que ela "disse". O `payload`
  // é código nosso e não serve de texto.
  if (postback) {
    const mid = str(postback.mid) ?? `postback:${sender}:${String(ev.timestamp ?? "")}`;
    const titulo = str(postback.title);
    if (!titulo) return null;
    return {
      tipo: "mensagem",
      pageId,
      mensagem: montar({
        pageId,
        psid: sender,
        mid,
        direcao: "inbound",
        texto: titulo,
        anexos: [],
        sentAt: quando(ev.timestamp),
        referral: referralDoAnuncio(postback.referral ?? ev.referral),
      }),
    };
  }

  if (!message) return null;
  const mid = str(message.mid);
  if (!mid) return null;
  // Mensagem apagada pela pessoa (`is_deleted`) não tem conteúdo a gravar.
  if (message.is_deleted === true) return null;

  const eco = message.is_echo === true;
  if (eco) {
    // Do nosso app: já gravado no envio. Ver o cabeçalho.
    if (String(message.app_id ?? "") === nossoAppId) return null;
    // No eco, quem "escreveu" é a página e a pessoa é o destinatário.
    if (sender !== pageId) return null;
  } else if (recipient !== pageId) {
    return null;
  }

  // Resposta rápida já chega com o rótulo do botão em `text`; o `quick_reply.payload` é código.
  const texto = str(message.text);
  const anexos = anexosDe(message);
  if (!texto && anexos.length === 0) return null;

  return {
    tipo: "mensagem",
    pageId,
    mensagem: montar({
      pageId,
      psid: eco ? recipient : sender,
      mid,
      direcao: eco ? "outbound" : "inbound",
      texto,
      anexos,
      sentAt: quando(ev.timestamp),
      referral: eco ? null : referralDoAnuncio(message.referral ?? ev.referral),
    }),
  };
}

function montar(p: {
  pageId: string;
  psid: string;
  mid: string;
  direcao: "inbound" | "outbound";
  texto: string | null;
  anexos: { type: string; url: string }[];
  sentAt: string | null;
  referral: Bruto | null;
}): SocialMessage {
  return {
    platform: "facebook",
    participantId: p.psid,
    accountId: p.pageId,
    conversationId: p.psid,
    externalId: externalIdDoMessenger(p.pageId, p.mid),
    direction: p.direcao,
    kind: "message",
    text: p.texto,
    sentAt: p.sentAt,
    attachments: p.anexos,
    referral: p.referral,
    identity: { phone: null, bsuid: null, anchor: null, username: null, displayName: null },
  };
}

/** O id com que a mensagem é gravada: a página entra junto, para o `mid` nunca colidir entre páginas. */
export function externalIdDoMessenger(pageId: string, mid: string): string {
  return socialMessageId(pageId, mid);
}

/** Todos os acontecimentos que interessam, de todas as páginas do corpo. */
export function eventosDoAviso(payload: unknown, nossoAppId: string): EventoDoMessenger[] {
  const p = obj(payload);
  if (!p || p.object !== "page") return [];
  const saida: EventoDoMessenger[] = [];
  for (const e of arr(p.entry)) {
    const entry = obj(e);
    const pageId = str(entry?.id);
    if (!entry || !pageId) continue;
    // `standby` = a conversa está com OUTRO app (transferência de controle). Não
    // é nossa vez de responder; ignorar é o que a Meta espera.
    for (const m of arr(entry.messaging)) {
      const ev = obj(m);
      if (!ev) continue;
      const delivery = obj(ev.delivery);
      if (delivery) {
        const mids = arr(delivery.mids).map(str).filter((s): s is string => !!s);
        if (mids.length > 0) saida.push({ tipo: "entregue", pageId, externalIds: mids.map((mid) => externalIdDoMessenger(pageId, mid)) });
        continue;
      }
      const read = obj(ev.read);
      if (read) {
        const psid = str(obj(ev.sender)?.id);
        const ate = quando(read.watermark);
        if (psid && ate) saida.push({ tipo: "lida", pageId, psid, ate });
        continue;
      }
      const msg = mensagemDe(pageId, ev, nossoAppId);
      if (msg) saida.push(msg);
    }
  }
  return saida;
}
