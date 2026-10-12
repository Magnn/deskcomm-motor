/**
 * O RELATÓRIO SOB MEDIDA NO ENVIO — a marca `[[RELATORIO: …]]` vira um PDF gerado e guardado na pasta da conversa.
 *
 * Quem decide se a marca vale é `lib/preco/relatorio-pronto.ts` (puro); quem escreve e desenha é `lib/relatorio/*`.
 * Aqui mora só o que tem efeito: a chamada ao modelo e a gravação do arquivo. Qualquer falha devolve `recusa`, com
 * a instrução para o agente — a marca crua nunca chega à pessoa e um relatório pela metade não sai.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { slugDoExtra, type ExtraPago } from '@/lib/preco/extras';
import {
  corpoSemAMarcaDeRelatorio,
  legendaDoRelatorio,
  marcaDeRelatorioNoCorpo,
  pedidoDaMarca,
  relatorioJaEntregue,
} from '@/lib/preco/relatorio-pronto';
import type { Extra } from '@/lib/preco/tipos';
import { gerarRelatorio, type PedidoDeRelatorio, type RelatorioGerado } from '@/lib/relatorio/gerar';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface DocumentoDoTurno {
  storagePath: string;
  mime: string;
  legenda: string;
}

export interface EntradaDoRelatorioNoEnvio {
  corpo: string;
  extras: readonly Extra[];
  pagos: readonly ExtraPago[];
  mensagens: readonly { direction: string; body?: string | null }[];
  assinatura: string;
  organizationId: string;
  conversationId: string;
  jobId: string;
  log: Registro;
  /** Uma chamada ao modelo que escreve o conteúdo. */
  chamar: (mensagens: { role: 'user' | 'assistant'; content: string }[]) => Promise<string>;
  /** Injetáveis só para teste. */
  gerar?: (p: PedidoDeRelatorio, deps: { chamar: EntradaDoRelatorioNoEnvio['chamar'] }) => Promise<RelatorioGerado>;
  guardar?: (caminho: string, dados: Buffer, mime: string) => Promise<boolean>;
}

export type SaidaDoRelatorioNoEnvio = { corpo: string; documento: DocumentoDoTurno | null } | { recusa: string };

async function guardarNoStorage(caminho: string, dados: Buffer, mime: string): Promise<boolean> {
  // `upsert`: no replay do job o arquivo já está lá, e regravar o mesmo é inofensivo.
  const { error } = await createAdminClient().storage.from('whatsapp-media').upload(caminho, dados, { contentType: mime, upsert: true });
  return !error;
}

/** O que a pessoa escreveu por último, para o relatório soar feito para ela (sem o que o agente disse). */
function contextoDaConversa(mensagens: readonly { direction: string; body?: string | null }[]): string {
  return mensagens
    .filter((m) => m.direction === 'inbound' && (m.body ?? '').trim().length > 3)
    .slice(-25)
    .map((m) => `- ${(m.body ?? '').replace(/\s+/g, ' ').slice(0, 400)}`)
    .join('\n')
    .slice(0, 5000);
}

export async function relatorioNoLugarDaMarca(e: EntradaDoRelatorioNoEnvio): Promise<SaidaDoRelatorioNoEnvio> {
  const marca = marcaDeRelatorioNoCorpo(e.corpo, e.extras);
  if (marca === null) return { corpo: e.corpo, documento: null };
  if (marca.extra === null) {
    return { recusa: 'A marca [[RELATORIO: …]] traz um produto que não tem relatório cadastrado. Tire a marca e responda normalmente.' };
  }
  const slug = slugDoExtra(marca.extra.name);
  const pago = e.pagos.some((p) => p.slug === slug && (p.diasAtras ?? 0) < (marca.extra.valid_days ?? 1));
  if (!pago) {
    return { recusa: `"${marca.extra.name}" ainda não foi pago: o relatório só é gerado depois do pagamento. Tire a marca; se ela quer o produto, cobre primeiro.` };
  }
  if (relatorioJaEntregue(e.mensagens, marca.extra)) {
    return { recusa: `O relatório "${marca.extra.name}" já foi enviado nesta conversa. Não gere de novo: tire a marca e responda o que ela perguntou sobre o que leu.` };
  }
  const pedido = pedidoDaMarca(marca, e.assinatura, contextoDaConversa(e.mensagens));
  if ('erro' in pedido) return { recusa: pedido.erro };

  const inicio = Date.now();
  let gerado: RelatorioGerado;
  try {
    gerado = await (e.gerar ?? gerarRelatorio)(pedido.pedido, { chamar: e.chamar });
  } catch (err) {
    gerado = { ok: false, motivo: (err instanceof Error ? err.message : String(err)).slice(0, 160) };
  }
  if (!gerado.ok) {
    e.log.warn('relatório sob medida não foi gerado — envio recusado', { conversation_id: e.conversationId, motivo: gerado.motivo.slice(0, 160) });
    return { recusa: 'O relatório não pôde ser gerado agora. Tire a marca e diga em uma frase que a leitura está sendo finalizada e chega em alguns minutos. NÃO escreva o relatório em texto.' };
  }
  const caminho = `${e.organizationId}/${e.conversationId}/relatorio-${e.jobId}/${gerado.nomeDoArquivo}`;
  const guardou = await (e.guardar ?? guardarNoStorage)(caminho, gerado.pdf, 'application/pdf').catch(() => false);
  if (!guardou) {
    e.log.warn('relatório gerado, mas não foi guardado — envio recusado', { conversation_id: e.conversationId });
    return { recusa: 'O relatório foi gerado, mas o arquivo não pôde ser guardado. Tire a marca e diga em uma frase que a leitura chega em alguns minutos.' };
  }
  e.log.info('relatório sob medida gerado', {
    conversation_id: e.conversationId,
    extra: slug,
    tipo: pedido.pedido.tipo,
    bytes: gerado.pdf.length,
    capitulos: gerado.conteudo.capitulos.length,
    ms: Date.now() - inicio,
  });
  return {
    corpo: corpoSemAMarcaDeRelatorio(e.corpo, marca.bruto),
    documento: { storagePath: caminho, mime: 'application/pdf', legenda: legendaDoRelatorio(marca.extra) },
  };
}
