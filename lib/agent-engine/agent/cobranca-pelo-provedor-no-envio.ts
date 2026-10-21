/**
 * A COBRANÇA SAI SÓ PELO PROVEDOR CONECTADO — o link do checkout externo nunca chega à pessoa.
 *
 * Com `pricing.provider_only_checkout` ligado, o link de pagamento que o agente escreve (o da configuração de preço)
 * é só a MARCA de "cobre este produto por este valor". No envio ele vira:
 *   1. o Pix do provedor (copia e cola), e
 *   2. o link de cartão do provedor, criado na hora no mesmo valor.
 * Cada um falha por conta própria. Se nenhum dos dois saiu, entra a chave Pix da empresa com o valor embutido
 * (`pricing.pix_key`), que é o último caso: a confirmação dela é manual. Sem chave também, o envio é RECUSADO —
 * o link externo não sai em hipótese nenhuma, nem como reserva.
 *
 * Decisão do dono do produto em 12/10/2026: o checkout externo saiu da conversa (a venda por ele não inicia a
 * entrega na hora e mostrava um preço diferente do combinado quando o link errado era escolhido).
 *
 * Sem o provedor conectado a regra não se aplica: quem chama mantém o comportamento de antes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import { VALIDADE_DO_PIX_S, linksDePagamentoDaConfig, pagamentosRecentesDoContato, referenciaDoPix, type LinkDePagamentoConhecido } from '@/lib/pagamentos/pix-na-conversa';
import { codigoPixEstatico } from '@/lib/pagamentos/pix-estatico';
import { criarClienteStripe, type LinkCriado, type PedidoDeLink, type PedidoDePix, type PixCriado } from '@/lib/pagamentos/stripe';
import { reais, type PricingConfig } from '@/lib/preco/tipos';
import { instrucaoDoPixCopiaECola } from "@/lib/pagamentos/como-pagar-pix";

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDaCobrancaPeloProvedor {
  corpo: string;
  pricing: PricingConfig;
  organizationId: string;
  contactId: string;
  conversationId: string;
  supabase: SupabaseClient;
  log: Registro;
  /** Injetáveis só para teste. */
  lerConexao?: (admin: SupabaseClient, organizationId: string) => Promise<ConexaoStripe | null>;
  criarPix?: (conexao: ConexaoStripe, pedido: PedidoDePix) => Promise<PixCriado>;
  criarLink?: (conexao: ConexaoStripe, pedido: PedidoDeLink) => Promise<LinkCriado>;
  agora?: Date;
}

export type SaidaDaCobrancaPeloProvedor = { corpo: string } | { recusa: string } | { semProvedor: true };

const escapar = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noCorpo = (corpo: string, url: string): boolean => new RegExp(`${escapar(url)}(?![\\w-])`).test(corpo);

/** Os balões que entram no lugar do link. Pura. */
export function baloesDaCobranca(
  link: LinkDePagamentoConhecido,
  meios: { copiaECola: string | null; urlDoCartao: string | null; pixDaChave: { codigo: string; titular: string } | null },
): string[] {
  const valor = reais(link.valorCentavos);
  if (meios.copiaECola !== null) {
    return [
      instrucaoDoPixCopiaECola(valor),
      meios.copiaECola,
      ...(meios.urlDoCartao !== null ? [`Se preferir cartão de crédito, é por este link: ${meios.urlDoCartao}`] : []),
    ];
  }
  if (meios.urlDoCartao !== null) return [`O pagamento de *${valor}* é por este link, no cartão de crédito: ${meios.urlDoCartao}`];
  if (meios.pixDaChave !== null) {
    return [
      instrucaoDoPixCopiaECola(valor, meios.pixDaChave.titular),
      meios.pixDaChave.codigo,
      `Assim que fizer, me manda o comprovante aqui, que esse eu confiro à mão.`,
    ];
  }
  return [];
}

/** Troca o balão que traz o link pelos balões da cobrança. Pura. */
export function corpoComCobranca(corpo: string, link: LinkDePagamentoConhecido, baloes: readonly string[]): string {
  const partes = corpo.split(/\n{2,}/);
  const i = partes.findIndex((b) => noCorpo(b, link.url));
  if (i < 0) return corpo;
  const resto = partes[i]!.replace(new RegExp(`(https?://)?${escapar(link.url.replace(/^https?:\/\//, ''))}(?![\\w-])`, 'g'), '').replace(/\s{2,}/g, ' ').trim();
  return [...partes.slice(0, i), ...(resto ? [resto] : []), ...baloes, ...partes.slice(i + 1)].join('\n\n');
}

export async function cobrancaPeloProvedorNoLugarDoLink(e: EntradaDaCobrancaPeloProvedor): Promise<SaidaDaCobrancaPeloProvedor> {
  const conhecidos = linksDePagamentoDaConfig(e.pricing);
  const presentes = conhecidos.filter((l) => noCorpo(e.corpo, l.url));
  if (presentes.length === 0) return { corpo: e.corpo };
  // Dois produtos ou dois valores na mesma mensagem: não dá para saber o que cobrar. O modelo reescreve.
  if (presentes.length > 1) {
    return { recusa: 'A mensagem traz mais de um link de pagamento. Mande UM link só: o do produto e do valor combinados neste turno.' };
  }
  const link = presentes[0]!;

  let conexao: ConexaoStripe | null;
  try {
    conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
  } catch {
    conexao = null;
  }
  if (conexao === null) return { semProvedor: true };

  const agora = e.agora ?? new Date();
  const pedido: PedidoDePix = {
    valorCentavos: link.valorCentavos,
    descricao: link.produto || 'Pagamento',
    referencia: referenciaDoPix(e.conversationId, link.valorCentavos, agora, await pagamentosRecentesDoContato(e.supabase, e.organizationId, e.contactId, agora)),
    metadados: { organization_id: e.organizationId, contact_id: e.contactId, conversation_id: e.conversationId, produto: link.produto },
    expiraEmSegundos: VALIDADE_DO_PIX_S,
  };
  const erro = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 160);
  const con = conexao;
  const [pix, cartao] = await Promise.all([
    (e.criarPix ?? ((c, p) => criarClienteStripe(c).criarPix(p)))(con, pedido).catch((err: unknown) => {
      e.log.warn('pix do provedor não saiu', { conversation_id: e.conversationId, error: erro(err) });
      return null;
    }),
    (e.criarLink ?? ((c, p) => criarClienteStripe(c).criarLinkDePagamento(p)))(con, {
      valorCentavos: link.valorCentavos,
      moeda: 'BRL',
      descricao: link.produto || 'Pagamento',
      referencia: `${pedido.referencia}-cartao`,
      metadados: pedido.metadados,
      mensagemDepoisDePagar: 'Pagamento recebido. Pode voltar à conversa: a entrega continua por lá.',
    }).catch((err: unknown) => {
      e.log.warn('link de cartão do provedor não saiu', { conversation_id: e.conversationId, error: erro(err) });
      return null;
    }),
  ]);

  let pixDaChave: { codigo: string; titular: string } | null = null;
  if (pix === null && cartao === null && e.pricing.pix_key) {
    const codigo = codigoPixEstatico({
      chave: e.pricing.pix_key.key,
      nome: e.pricing.pix_key.holder,
      ...(e.pricing.pix_key.city ? { cidade: e.pricing.pix_key.city } : {}),
      valorCentavos: link.valorCentavos,
      identificador: e.conversationId.replace(/-/g, '').slice(0, 20),
    });
    if (codigo !== null) pixDaChave = { codigo, titular: e.pricing.pix_key.holder };
  }
  const baloes = baloesDaCobranca(link, { copiaECola: pix?.copiaECola ?? null, urlDoCartao: cartao?.url ?? null, pixDaChave });
  if (baloes.length === 0) {
    return { recusa: 'O pagamento não pôde ser gerado agora. NÃO envie link nem chave: diga em uma frase que o sistema de pagamento está instável e que você manda o código em alguns minutos.' };
  }
  e.log.info('cobrança criada pelo provedor no lugar do link', {
    conversation_id: e.conversationId,
    valor_centavos: link.valorCentavos,
    pix: pix?.id ?? null,
    link_de_cartao: cartao?.id ?? null,
    pela_chave_da_empresa: pixDaChave !== null,
  });
  return { corpo: corpoComCobranca(e.corpo, link, baloes) };
}
