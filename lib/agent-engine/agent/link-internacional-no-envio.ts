/**
 * A ponta que fala com o provedor para quem escreve de FORA do Brasil: troca, no corpo que o agente vai
 * enviar, o link de pagamento em reais por um link de cobrança na moeda da pessoa (`lib/preco/preco-internacional.ts`).
 *
 * É o contrário do Pix (`pix-no-envio.ts`) num ponto: aqui a falha NÃO deixa o corpo passar. O link em reais
 * cobraria dessa pessoa um valor que a conversa nunca disse — ela ouviu "€ 20" e abriria um checkout de R$ 130.
 * Sem conta conectada, com o provedor recusando ou com mais de um link no envio, o envio é RECUSADO e a
 * instrução volta ao modelo: avisar a pessoa e chamar atendimento humano.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import { linksDePagamentoDaConfig } from '@/lib/pagamentos/pix-na-conversa';
import { ErroDaStripe, criarClienteStripe, type LinkCriado, type PedidoDeLink } from '@/lib/pagamentos/stripe';
import { valorNaMoeda, type PrecoInternacionalDoContato } from '@/lib/preco/preco-internacional';
import type { PricingConfig } from '@/lib/preco/tipos';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDoLinkInternacional {
  corpo: string;
  pricing: PricingConfig;
  preco: PrecoInternacionalDoContato;
  organizationId: string;
  contactId: string;
  conversationId: string;
  supabase: SupabaseClient;
  log: Registro;
  /** Injetáveis só para teste. */
  lerConexao?: (admin: SupabaseClient, organizationId: string) => Promise<ConexaoStripe | null>;
  criarLink?: (conexao: ConexaoStripe, pedido: PedidoDeLink) => Promise<LinkCriado>;
  agora?: Date;
}

export type SaidaDoLinkInternacional = { corpo: string } | { recusa: string };

const ESCAPA = /[.*+?^${}()|[\]\\]/g;
/** O link exato, sem casar um link maior que comece igual. */
const padraoDoLink = (url: string): RegExp => new RegExp(`${url.replace(ESCAPA, '\\$&')}(?![\\w-])`, 'g');

/** A referência da cobrança: a mesma conversa pedindo o mesmo produto no mesmo dia recebe o MESMO link. Pura. */
export function referenciaDoLinkInternacional(conversaId: string, preco: PrecoInternacionalDoContato, produto: string, agora: Date): string {
  const dia = Math.floor(agora.getTime() / 86_400_000);
  return `link-${conversaId}-${preco.moeda}-${preco.precoCents}-${dia}-${produto.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24)}`;
}

function recusa(valor: string): string {
  return (
    `Não foi possível gerar agora o link de pagamento de ${valor} para esta pessoa, que escreve de fora do Brasil. ` +
    'NÃO envie link de pagamento em reais e NÃO fale de Pix. Diga a ela, numa mensagem curta e sem link, que o link ' +
    'de pagamento chega em instantes, e chame atendimento humano para enviá-lo.'
  );
}

export async function linkInternacionalNoLugarDoLink(e: EntradaDoLinkInternacional): Promise<SaidaDoLinkInternacional> {
  const valor = valorNaMoeda(e.preco.precoCents, e.preco.moeda);
  const noCorpo = linksDePagamentoDaConfig(e.pricing).filter((l) => padraoDoLink(l.url).test(e.corpo));
  // Sem link de pagamento conhecido, não há o que trocar: o balão segue como veio.
  if (noCorpo.length === 0) return { corpo: e.corpo };
  if (noCorpo.length > 1) {
    return { recusa: `Mande UM link de pagamento só, o do trabalho que você indicou, sozinho no balão. O valor é ${valor}.` };
  }
  const link = noCorpo[0]!;
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('link internacional não saiu — nenhuma conta conectada para cobrar em moeda estrangeira', {
        conversation_id: e.conversationId,
      });
      return { recusa: recusa(valor) };
    }
    const pedido: PedidoDeLink = {
      valorCentavos: e.preco.precoCents,
      moeda: e.preco.moeda,
      descricao: link.produto || 'Pagamento',
      referencia: referenciaDoLinkInternacional(e.conversationId, e.preco, link.produto, e.agora ?? new Date()),
      metadados: {
        organization_id: e.organizationId,
        contact_id: e.contactId,
        conversation_id: e.conversationId,
        produto: link.produto,
      },
      mensagemDepoisDePagar: 'Pagamento recebido. Pode voltar à conversa: a entrega continua por lá.',
    };
    const criado = await (e.criarLink ?? ((c, p) => criarClienteStripe({ chave: c.chave }).criarLinkDePagamento(p)))(conexao, pedido);
    e.log.info('link internacional criado para a conversa', {
      conversation_id: e.conversationId,
      moeda: e.preco.moeda,
      valor_centavos: e.preco.precoCents,
      link: criado.id,
    });
    return { corpo: e.corpo.replace(padraoDoLink(link.url), () => criado.url) };
  } catch (err) {
    e.log.warn('link internacional não saiu — envio recusado para não mandar o link em reais', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: recusa(valor) };
  }
}
