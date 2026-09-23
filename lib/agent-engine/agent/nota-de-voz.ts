/**
 * A RESPOSTA VAI EM ÁUDIO — a agente fala quando a pessoa falou.
 *
 * Mesmo desenho da foto do catálogo (`fotos-do-produto.ts`): o áudio é GRAVADO
 * na pasta da conversa em `whatsapp-media/<org>/<conversa>/…` e o envio passa
 * pelo caminho que o handler de mensagens já conhece (`media_storage_path` +
 * `type: 'audio'`, URL assinada curta para o canal, nunca base64). Assim a inbox
 * mostra a nota, a LGPD a apaga junto com a conversa, e opt-out, janela de 24h e
 * ritmo anti-banimento continuam valendo — nada disto contorna a cadeia de envio.
 *
 * ─── O que este módulo NÃO faz ──────────────────────────────────────────────
 * Não decide SE deve falar (isso é do turno: config ligada + a pessoa mandou
 * áudio) e não derruba o turno quando a voz falha. Qualquer falha — chave,
 * cota, provedor fora do ar, formato — devolve `{ ok: false }` e o turno envia
 * o TEXTO. A pessoa nunca fica sem resposta por causa de uma nota de voz.
 *
 * ─── Link não se fala ───────────────────────────────────────────────────────
 * O link de pagamento sai como TEXTO, depois das notas: a voz lendo uma URL
 * letra por letra é ruim, e sem o link a venda não fecha. `separarLinks` tira as
 * URLs da fala e devolve à parte.
 */
import { createHash } from 'node:crypto';

import { createAdminClient } from '@/lib/supabase/admin';
import { resolverChaveDeVoz } from '@/lib/voz/chaves';
import { ErroDeVoz } from '@/lib/voz/erros';
import { dividirEmNotas, sintetizarNota, textoParaFala } from '@/lib/voz/sintetizar';
import type { IdDeProvedorDeVoz, VoiceReplyConfig } from '@/lib/voz/tipos';

import type { Queryable } from '../queue/queue';
import { OK_KINDS, type BubbleOutcome } from './split-message';

const BUCKET_DA_CONVERSA = 'whatsapp-media';

/** Mais que isto e o texto sai como texto: uma sequência de áudios longos cansa. */
export const MAX_NOTAS_POR_RESPOSTA = 3;

export interface NotaPreparada {
  /** caminho em `whatsapp-media`, dentro da pasta da conversa */
  storagePath: string;
  mime: string;
  /** O que a nota diz — vira a legenda da mensagem no inbox (canal nenhum a envia). */
  fala: string;
}

export type NotasPreparadas =
  | { ok: true; notas: NotaPreparada[]; links: string[] }
  | {
      ok: false;
      /** `codigo` do `ErroDeVoz`, ou um dos nossos: o log e o teste leem isto. */
      motivo: string;
    };

interface Log {
  warn(msg: string, fields?: Record<string, unknown>): void;
}

export interface DependenciasDeNota {
  resolverChave: (organizationId: string, provedor: IdDeProvedorDeVoz) => Promise<string | null>;
  sintetizar: typeof sintetizarNota;
  /** Grava o arquivo na pasta da conversa. `true` = está lá. */
  guardar: (caminho: string, dados: Buffer, mime: string) => Promise<boolean>;
  log: Log;
}

export function dependenciasReaisDeNota(log: Log): DependenciasDeNota {
  return {
    resolverChave: resolverChaveDeVoz,
    sintetizar: sintetizarNota,
    guardar: async (caminho, dados, mime) => {
      const { error } = await createAdminClient()
        .storage.from(BUCKET_DA_CONVERSA)
        // `upsert`: o nome é determinístico (`voz-<hash>`), então gravar de novo
        // o MESMO conteúdo (replay de job) é idempotente e não enche a cota.
        .upload(caminho, dados, { contentType: mime, upsert: true });
      if (error) log.warn('nota de voz não gravada no storage', { detalhe: error.message.slice(0, 120) });
      return !error;
    },
    log,
  };
}

const URL_NO_TEXTO = /https?:\/\/[^\s<>"')]+/g;

/** Tira as URLs do texto e as devolve à parte, na ordem em que apareceram. */
export function separarLinks(texto: string): { fala: string; links: string[] } {
  const links = [...(texto.match(URL_NO_TEXTO) ?? [])].map((l) => l.replace(/[.,;:!?]+$/, ''));
  return { fala: texto.replace(URL_NO_TEXTO, ' ').replace(/[ \t]{2,}/g, ' '), links: [...new Set(links)] };
}

/** Nome estável do arquivo: mesmo texto + mesma voz + mesmos ajustes = mesmo arquivo. */
export function nomeDaNota(config: VoiceReplyConfig, fala: string): string {
  const impressao = createHash('sha1')
    .update(
      JSON.stringify([
        config.provider,
        config.voice_id,
        config.model ?? '',
        config.speed ?? '',
        config.stability ?? '',
        config.similarity_boost ?? '',
        config.style_instructions ?? '',
        fala,
      ]),
    )
    .digest('hex')
    .slice(0, 20);
  return `voz-${impressao}.ogg`;
}

export async function prepararNotasDeVoz(
  deps: DependenciasDeNota,
  input: {
    tenantId: string;
    conversationId: string;
    texto: string;
    config: VoiceReplyConfig;
  },
): Promise<NotasPreparadas> {
  const { fala, links } = separarLinks(input.texto);
  const pedacos = dividirEmNotas(textoParaFala(fala), input.config.max_chars_per_note);
  // Só havia link (ou emoji): não há o que falar, e a mensagem sai como texto.
  if (pedacos.length === 0) return { ok: false, motivo: 'sem_fala' };
  if (pedacos.length > MAX_NOTAS_POR_RESPOSTA) return { ok: false, motivo: 'longo_demais' };

  const apiKey = await deps.resolverChave(input.tenantId, input.config.provider);
  if (!apiKey) return { ok: false, motivo: 'sem_chave' };

  try {
    // Em paralelo: o turno já gastou o tempo do modelo, e cada nota é uma ida à rede.
    const notas = await Promise.all(
      pedacos.map(async (pedaco): Promise<NotaPreparada> => {
        const audio = await deps.sintetizar({
          provedor: input.config.provider,
          apiKey,
          config: input.config,
          texto: pedaco,
        });
        const caminho = `${input.tenantId}/${input.conversationId}/${nomeDaNota(input.config, pedaco)}`;
        if (!(await deps.guardar(caminho, audio.buffer, audio.mime))) {
          throw new ErroDeVoz('provedor_fora_do_ar', null, 'storage');
        }
        return { storagePath: caminho, mime: audio.mime, fala: pedaco };
      }),
    );
    return { ok: true, notas, links };
  } catch (err) {
    const motivo = err instanceof ErroDeVoz ? err.codigo : 'erro_inesperado';
    deps.log.warn('resposta em áudio caiu para texto', { motivo });
    return { ok: false, motivo };
  }
}

/**
 * Manda as notas (e depois os links, como texto). Para no primeiro desfecho que
 * não seja de sucesso — como `sendInBubbles` e `enviarComFotos`: uma nota que o
 * canal segurou não é seguida de outra à frente dela.
 */
export async function enviarNotasDeVoz<T extends BubbleOutcome>(
  preparadas: Extract<NotasPreparadas, { ok: true }>,
  opts: {
    enviarNota: (nota: NotaPreparada) => Promise<T>;
    enviarTexto: (texto: string) => Promise<T>;
    sleep: (ms: number) => Promise<void>;
    jitter: () => number;
  },
): Promise<T> {
  let ultimo: T | undefined;
  for (const nota of preparadas.notas) {
    if (ultimo !== undefined) {
      if (!OK_KINDS.has(ultimo.kind)) return ultimo;
      await opts.sleep(opts.jitter());
    }
    ultimo = await opts.enviarNota(nota);
  }
  if (preparadas.links.length > 0 && ultimo !== undefined && OK_KINDS.has(ultimo.kind)) {
    await opts.sleep(opts.jitter());
    ultimo = await opts.enviarTexto(preparadas.links.join('\n'));
  }
  // `preparadas.notas` nunca é vazio (`prepararNotasDeVoz` recusa antes).
  return ultimo as T;
}

/**
 * A mensagem que abriu o turno foi um ÁUDIO da pessoa?
 *
 * O recorte (org + conversa + id + `direction = 'inbound'`) é o que impede um id
 * de outra conversa — ou uma mensagem NOSSA — de virar "a que a pessoa mandou":
 * sem ele, um id vazado ligaria a voz no turno de outro tenant. Falha de leitura
 * vira `false`: na dúvida, texto.
 */
export async function inboundEhAudio(
  db: Queryable,
  input: { tenantId: string; conversationId: string; inboundMessageId: string },
): Promise<boolean> {
  try {
    const { rows } = await db.query<{ type: string }>(
      `select type from messages
        where organization_id = $1
          and conversation_id = $2
          and id = $3
          and direction = 'inbound'
        limit 1`,
      [input.tenantId, input.conversationId, input.inboundMessageId],
    );
    return rows[0]?.type === 'audio';
  } catch {
    return false;
  }
}
