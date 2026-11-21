/**
 * O PIX DA ENTRADA NO VALOR QUE A PESSOA DISSE (`entradaImediata`, em `lib/preco/estado-da-negociacao.ts`).
 *
 * A pessoa diz "só tenho 90 no Pix". O turno autoriza a entrada de R$ 90 e o agente escreve, sozinho num
 * balão, a marca `[[PIX: Entrada]]`; aqui a marca vira a instrução e o código do Pix desse valor exato. Não
 * há link de checkout cadastrado para um valor qualquer, por isso é marca e não link: o sistema cria o Pix e o link
 * de cartão desse valor. O modelo nunca escolhe o valor.
 *
 * A cobrança leva os metadados do produto principal: quando a entrada é paga, o aviso de pagamento marca a
 * compra e inicia a entrega, como numa compra pelo valor cheio. O restante viaja nos metadados para ficar
 * registrado junto do pagamento.
 *
 * Como nas outras marcas, a falha NÃO deixa o corpo passar: marca crua não chega à pessoa.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import { VALIDADE_DO_PIX_S } from '@/lib/pagamentos/pix-na-conversa';
import { ErroDaStripe, criarClienteStripe, type LinkCriado, type PedidoDeLink, type PedidoDePix, type PixCriado } from '@/lib/pagamentos/stripe';
import { MARCA_DA_ENTRADA } from '@/lib/preco/bloco-da-entrada';
import { chaveParaCopiar, tipoDaChave, type ChavePixDaEmpresa } from '@/lib/preco/chave-pix';
import { EXTRA_DO_RESTANTE, MARCA_DO_RESTANTE } from '@/lib/preco/restante';
import { corpoComPixDoExtra } from '@/lib/preco/extras';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDoPixDaEntrada {
  corpo: string;
  entrada: { entradaCents: number; restanteCents: number };
  /** O produto que a pessoa está comprando: é o que o aviso de pagamento usa para achar a entrega. */
  produto: string;
  organizationId: string;
  contactId: string;
  conversationId: string;
  supabase: SupabaseClient;
  log: Registro;
  /** A chave da empresa, quando é a forma principal de receber: o provedor não é consultado. */
  chavePrincipal?: ChavePixDaEmpresa | null;
  /** Injetáveis só para teste. */
  lerConexao?: (admin: SupabaseClient, organizationId: string) => Promise<ConexaoStripe | null>;
  criarPix?: (conexao: ConexaoStripe, pedido: PedidoDePix) => Promise<PixCriado>;
  criarLink?: (conexao: ConexaoStripe, pedido: PedidoDeLink) => Promise<LinkCriado>;
  agora?: Date;
}

export type SaidaDoPixDaEntrada = { corpo: string } | { recusa: string };

const NA_MARCA = /\[\[\s*PIX\s*:\s*entrada\s*\]\]/i;

const SEM_COBRANCA =
  'Não foi possível gerar o Pix da entrada agora. NÃO envie a marca [[PIX: Entrada]] nem chave Pix. Diga à pessoa, numa ' +
  'mensagem curta, que o código do Pix chega em instantes, e chame atendimento humano para enviá-lo.';

const NA_MARCA_DO_RESTANTE = /\[\[\s*PIX\s*:\s*restante\s*\]\]/i;

const SEM_COBRANCA_DO_RESTANTE =
  'Não foi possível gerar o Pix do restante agora. NÃO envie a marca [[PIX: Restante]], chave Pix nem link. Diga à pessoa, numa ' +
  'mensagem curta, que o código chega em instantes, e chame atendimento humano para enviá-lo.';

/**
 * O CARTÃO NO MESMO VALOR da entrada ou do restante, ao lado do Pix. Medido em 21/11/2026: uma cliente sem saldo no Pix
 * pediu o link para pagar metade, ouviu que o link "cobra o valor cheio" e a venda só saiu pela
 * mão da equipe. O provedor cria o link em qualquer valor; com os mesmos metadados do Pix, o aviso de pagamento trata a
 * entrada no cartão igual à entrada no Pix. É um extra: se não sair, o Pix vai sozinho.
 */
async function cartaoNoValor(
  e: Pick<EntradaDoPixDaEntrada, 'supabase' | 'organizationId' | 'conversationId' | 'log' | 'lerConexao' | 'criarLink'>,
  pedido: { valorCentavos: number; descricao: string; referencia: string; metadados: Record<string, string> },
): Promise<string | null> {
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) return null;
    const link = await (e.criarLink ?? ((c, p) => criarClienteStripe(c).criarLinkDePagamento(p)))(conexao, {
      ...pedido,
      referencia: `${pedido.referencia}-so-cartao`,
      moeda: 'BRL',
      mensagemDepoisDePagar: 'Pagamento recebido. Pode voltar à conversa: a entrega continua por lá.',
      soCartao: true,
    });
    return link.url;
  } catch (err) {
    e.log.warn('link de cartão da entrada/restante não saiu — o Pix vai sozinho', {
      conversation_id: e.conversationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return null;
  }
}

/**
 * A marca `[[PIX: Restante]]` vira o Pix do valor que falta. Vai como cobrança avulsa (`metadata.extra`): o aviso de
 * pagamento registra a receita e não inicia outra entrega, porque o trabalho já começou com a entrada.
 */
export async function pixDoRestanteNoLugarDaMarca(
  e: Omit<EntradaDoPixDaEntrada, 'entrada'> & { restanteCents: number },
): Promise<SaidaDoPixDaEntrada> {
  const achada = NA_MARCA_DO_RESTANTE.exec(e.corpo);
  if (achada === null) return { corpo: e.corpo };
  const agora = e.agora ?? new Date();
  const cobranca = {
    valorCentavos: e.restanteCents,
    descricao: `${e.produto || 'Pagamento'} (restante)`,
    referencia: `restante-${e.conversationId}-${e.restanteCents}-${Math.floor(agora.getTime() / 3_600_000)}`,
    metadados: {
      organization_id: e.organizationId,
      contact_id: e.contactId,
      conversation_id: e.conversationId,
      produto: e.produto,
      extra: EXTRA_DO_RESTANTE,
    },
  };
  if (e.chavePrincipal) {
    const chave = chaveParaCopiar(e.chavePrincipal);
    if (chave === null) return { recusa: SEM_COBRANCA_DO_RESTANTE };
    e.log.info('pix do restante pela chave principal', { conversation_id: e.conversationId, restante_cents: e.restanteCents });
    const marca = { extra: { name: MARCA_DO_RESTANTE, price_cents: e.restanteCents, when: '' }, texto: achada[0] };
    const cartao = await cartaoNoValor(e, cobranca);
    return { corpo: corpoComPixDoExtra(e.corpo, marca, null, cartao, { chave, titular: e.chavePrincipal.holder, tipo: tipoDaChave(e.chavePrincipal) }) };
  }
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('pix do restante não saiu — nenhuma conta de Pix conectada', { conversation_id: e.conversationId });
      return { recusa: SEM_COBRANCA_DO_RESTANTE };
    }
    const [pix, cartao] = await Promise.all([
      (e.criarPix ?? ((c, p) => criarClienteStripe(c).criarPix(p)))(conexao, { ...cobranca, expiraEmSegundos: VALIDADE_DO_PIX_S }),
      cartaoNoValor(e, cobranca),
    ]);
    e.log.info('pix do restante criado', { conversation_id: e.conversationId, restante_cents: e.restanteCents, cobranca: pix.id });
    const marca = { extra: { name: MARCA_DO_RESTANTE, price_cents: e.restanteCents, when: '' }, texto: achada[0] };
    return { corpo: corpoComPixDoExtra(e.corpo, marca, pix.copiaECola, cartao) };
  } catch (err) {
    e.log.warn('pix do restante não saiu — envio recusado para a marca não chegar à pessoa', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: SEM_COBRANCA_DO_RESTANTE };
  }
}

/** O corpo traz a marca da entrada? Quem chama usa para não tocar no envio que não é de entrada. */
export const temMarcaDaEntrada = (corpo: string): boolean => NA_MARCA.test(corpo);

export async function pixDaEntradaNoLugarDaMarca(e: EntradaDoPixDaEntrada): Promise<SaidaDoPixDaEntrada> {
  const achada = NA_MARCA.exec(e.corpo);
  if (achada === null) return { corpo: e.corpo };
  const agora = e.agora ?? new Date();
  const cobranca = {
    valorCentavos: e.entrada.entradaCents,
    descricao: `${e.produto || 'Pagamento'} (entrada)`,
    referencia: `entrada-${e.conversationId}-${e.entrada.entradaCents}-${Math.floor(agora.getTime() / 3_600_000)}`,
    metadados: {
      organization_id: e.organizationId,
      contact_id: e.contactId,
      conversation_id: e.conversationId,
      produto: e.produto,
      entrada: 'sim',
      restante_cents: String(e.entrada.restanteCents),
    },
  };
  if (e.chavePrincipal) {
    const chave = chaveParaCopiar(e.chavePrincipal);
    if (chave === null) return { recusa: SEM_COBRANCA };
    e.log.info('pix da entrada pela chave principal', { conversation_id: e.conversationId, entrada_cents: e.entrada.entradaCents });
    const marca = { extra: { name: MARCA_DA_ENTRADA, price_cents: e.entrada.entradaCents, when: '' }, texto: achada[0] };
    const cartao = await cartaoNoValor(e, cobranca);
    return { corpo: corpoComPixDoExtra(e.corpo, marca, null, cartao, { chave, titular: e.chavePrincipal.holder, tipo: tipoDaChave(e.chavePrincipal) }) };
  }
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('pix da entrada não saiu — nenhuma conta de Pix conectada', { conversation_id: e.conversationId });
      return { recusa: SEM_COBRANCA };
    }
    const pedido: PedidoDePix = { ...cobranca, expiraEmSegundos: VALIDADE_DO_PIX_S };
    const [pix, cartao] = await Promise.all([
      (e.criarPix ?? ((c, p) => criarClienteStripe(c).criarPix(p)))(conexao, pedido),
      cartaoNoValor(e, cobranca),
    ]);
    e.log.info('pix da entrada criado no valor que a pessoa disse', {
      conversation_id: e.conversationId,
      entrada_cents: e.entrada.entradaCents,
      restante_cents: e.entrada.restanteCents,
      cobranca: pix.id,
    });
    const marca = { extra: { name: MARCA_DA_ENTRADA, price_cents: e.entrada.entradaCents, when: '' }, texto: achada[0] };
    return { corpo: corpoComPixDoExtra(e.corpo, marca, pix.copiaECola, cartao) };
  } catch (err) {
    e.log.warn('pix da entrada não saiu — envio recusado para a marca não chegar à pessoa', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: SEM_COBRANCA };
  }
}
