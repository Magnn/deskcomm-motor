/**
 * Baixa a mídia de um LINK para o fluxo poder enviá-la.
 *
 * É o servidor que acessa um endereço escolhido por quem montou o fluxo (ou
 * guardado num campo do lead) — então é uma porta de SSRF, e cada passo é
 * tratado como tal:
 *
 *   1. `assertSafeOutboundUrl` — esquema, https em produção, literal privado;
 *   2. `assertDestinoResolvidoSeguro` — resolve o nome e julga o IP de verdade;
 *   3. redirecionamento NUNCA é seguido às cegas: `redirect: "manual"`, e cada
 *      `Location` passa pelas duas guardas de novo (no máximo 3 saltos). Um
 *      link público que redireciona para `http://169.254.169.254/` seria o
 *      contorno óbvio;
 *   4. teto de bytes cobrado no cabeçalho E durante a leitura — o cabeçalho é
 *      o que o servidor de lá declara, não o que ele manda;
 *   5. formato e tamanho finais pela MESMA régua do upload da tela
 *      (`validateOutboundMedia`): o que a tela recusaria, o link não contorna.
 *
 * Falha nunca lança: devolve o motivo, e quem chama pula o item (um link fora
 * do ar não pode derrubar a sequência inteira).
 */
import { assertDestinoResolvidoSeguro } from '@/lib/automation/outbound-ip';
import { assertSafeOutboundUrl } from '@/lib/automation/outbound-url';
import { MAX_MEDIA_BYTES } from '@/lib/messaging/media/types';
import { validateOutboundMedia } from '@/lib/messaging/media/upload-validation';

export type TipoDeMidiaPorLink = 'image' | 'video' | 'document';

export type MidiaBaixada =
  | { ok: true; buffer: Buffer; mime: string; nome: string | null }
  | { ok: false; motivo: string };

export interface DepsDeDownload {
  fetch?: typeof fetch;
  /** Trocado em teste: resolver DNS de verdade não é coisa de teste unitário. */
  conferirDestino?: (hostname: string) => Promise<void>;
  timeoutMs?: number;
}

const TETO_POR_TIPO: Record<TipoDeMidiaPorLink, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: MAX_MEDIA_BYTES,
};

/** Tipo pelo fim do caminho — para servidor que responde `application/octet-stream`. */
const MIME_PELA_EXTENSAO: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

const MAX_SALTOS = 3;

function nomeDoCaminho(url: URL): string | null {
  const ultimo = url.pathname.split('/').filter((p) => p !== '').pop();
  if (ultimo === undefined) return null;
  try {
    return decodeURIComponent(ultimo);
  } catch {
    return ultimo;
  }
}

async function lerComTeto(res: Response, teto: number): Promise<Buffer | null> {
  const leitor = res.body?.getReader();
  if (!leitor) {
    const tudo = Buffer.from(await res.arrayBuffer());
    return tudo.length > teto ? null : tudo;
  }
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel().catch(() => undefined);
      return null;
    }
    pedacos.push(value);
  }
  return Buffer.concat(pedacos);
}

export async function baixarMidiaDoLink(
  link: string,
  esperado: TipoDeMidiaPorLink,
  deps: DepsDeDownload = {},
): Promise<MidiaBaixada> {
  const buscar = deps.fetch ?? fetch;
  const conferirDestino = deps.conferirDestino ?? assertDestinoResolvidoSeguro;
  const teto = TETO_POR_TIPO[esperado];

  let atual = link.trim();
  let res: Response | null = null;
  let urlFinal: URL | null = null;

  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    let url: URL;
    try {
      assertSafeOutboundUrl(atual);
      url = new URL(atual);
      await conferirDestino(url.hostname);
    } catch (err) {
      return { ok: false, motivo: err instanceof Error ? err.message : 'unsafe_url' };
    }

    const cancelar = new AbortController();
    const relogio = setTimeout(() => cancelar.abort(), deps.timeoutMs ?? 20_000);
    try {
      res = await buscar(url, { redirect: 'manual', signal: cancelar.signal });
    } catch {
      clearTimeout(relogio);
      return { ok: false, motivo: 'link_inacessivel' };
    }
    clearTimeout(relogio);

    if (res.status >= 300 && res.status < 400) {
      const destino = res.headers.get('location');
      if (destino === null) return { ok: false, motivo: 'redirecionamento_sem_destino' };
      // Relativo ao endereço atual — e volta ao topo do laço, pelas guardas.
      atual = new URL(destino, url).toString();
      res = null;
      continue;
    }
    urlFinal = url;
    break;
  }

  if (res === null || urlFinal === null) return { ok: false, motivo: 'redirecionamentos_demais' };
  if (!res.ok) return { ok: false, motivo: `http_${res.status}` };

  const declarado = Number(res.headers.get('content-length') ?? 0);
  if (declarado > teto) return { ok: false, motivo: 'arquivo_grande_demais' };

  const buffer = await lerComTeto(res, teto);
  if (buffer === null) return { ok: false, motivo: 'arquivo_grande_demais' };

  const nome = nomeDoCaminho(urlFinal);
  let mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (mime === '' || mime === 'application/octet-stream' || mime === 'binary/octet-stream') {
    const extensao = nome?.split('.').pop()?.toLowerCase() ?? '';
    mime = MIME_PELA_EXTENSAO[extensao] ?? mime;
  }

  const veredito = validateOutboundMedia(mime, buffer.length);
  if (!veredito.ok) return { ok: false, motivo: veredito.code };
  if (veredito.kind !== esperado) return { ok: false, motivo: `tipo_inesperado:${veredito.kind}` };

  return { ok: true, buffer, mime, nome };
}
