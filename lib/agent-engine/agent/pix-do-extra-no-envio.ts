/**
 * A ponta que fala com o provedor para as COBRANÇAS AVULSAS (`lib/preco/extras.ts`): troca a marca
 * `[[PIX: nome]]` que o agente escreveu pela instrução e pelo código do Pix daquele valor.
 *
 * Como no link internacional, a falha NÃO deixa o corpo passar: a marca crua não pode chegar à pessoa. Sem
 * conta conectada, com o provedor recusando ou com marca desconhecida, o envio é RECUSADO e a instrução volta
 * ao modelo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import { VALIDADE_DO_PIX_S, pagamentosRecentesDoContato } from '@/lib/pagamentos/pix-na-conversa';
import { ErroDaStripe, criarClienteStripe, type LinkCriado, type PedidoDeLink, type PedidoDePix, type PixCriado } from '@/lib/pagamentos/stripe';
import {
  corpoComPixDoExtra,
  descricaoDaCobranca,
  marcaDeExtraNoCorpo,
  referenciaDoExtra,
  slugDoExtra,
  valorDaCobranca,
} from '@/lib/preco/extras';
import type { Extra } from '@/lib/preco/tipos';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDoPixDoExtra {
  corpo: string;
  /** Os extras que ESTE turno pode cobrar. Vazio = nenhuma marca é aceita. */
  extras: readonly Extra[];
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

export type SaidaDoPixDoExtra = { corpo: string } | { recusa: string };

const SEM_COBRANCA =
  'Não foi possível gerar o Pix desta cobrança agora. NÃO envie a marca [[PIX: …]] nem chave Pix. Diga à pessoa, numa ' +
  'mensagem curta, que o código do Pix chega em instantes, e chame atendimento humano para enviá-lo.';

export async function pixDoExtraNoLugarDaMarca(e: EntradaDoPixDoExtra): Promise<SaidaDoPixDoExtra> {
  const marca = marcaDeExtraNoCorpo(e.corpo, e.extras);
  if (marca.tipo === 'nenhuma') return { corpo: e.corpo };
  if (marca.tipo === 'invalida') return { recusa: marca.motivo };
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('cobrança avulsa não saiu — nenhuma conta de Pix conectada', { conversation_id: e.conversationId });
      return { recusa: SEM_COBRANCA };
    }
    const valorCentavos = valorDaCobranca(marca.extra, marca.quantidade);
    const pedido: PedidoDePix = {
      valorCentavos,
      descricao: descricaoDaCobranca(marca.extra, marca.quantidade),
      referencia: referenciaDoExtra(
        e.conversationId,
        marca.extra,
        e.agora ?? new Date(),
        marca.quantidade,
        await pagamentosRecentesDoContato(e.supabase, e.organizationId, e.contactId, e.agora ?? new Date()),
      ),
      metadados: {
        organization_id: e.organizationId,
        contact_id: e.contactId,
        conversation_id: e.conversationId,
        produto: marca.extra.name,
        // É o que faz o aviso de pagamento NÃO tratar isto como a compra do produto principal.
        extra: slugDoExtra(marca.extra.name),
        // Várias unidades num Pix só (`[[PIX: nome x3]]`): o aviso guarda a quantidade, e o turno entrega todas.
        ...(marca.quantidade > 1 ? { quantidade: String(marca.quantidade) } : {}),
      },
      expiraEmSegundos: VALIDADE_DO_PIX_S,
    };
    // Pix e cartão saem JUNTOS: medido em 12/10/2026, uma pessoa aceitou a cobrança, disse que só tinha cartão e
    // ficou sem como pagar. Cada um falha por conta própria; só recusa o envio se nenhum dos dois saiu.
    const [pix, link] = await Promise.all([
      (e.criarPix ?? ((c, p) => criarClienteStripe(c).criarPix(p)))(conexao, pedido).catch((err: unknown) => {
        e.log.warn('pix da cobrança avulsa não saiu', { conversation_id: e.conversationId, error: (err instanceof Error ? err.message : String(err)).slice(0, 160) });
        return null;
      }),
      (e.criarLink ?? ((c, p) => criarClienteStripe(c).criarLinkDePagamento(p)))(conexao, {
        valorCentavos,
        moeda: 'BRL',
        descricao: pedido.descricao,
        referencia: `${pedido.referencia}-cartao`,
        metadados: pedido.metadados,
        mensagemDepoisDePagar: 'Pagamento recebido. Pode voltar à conversa: a entrega continua por lá.',
      }).catch((err: unknown) => {
        e.log.warn('link de cartão da cobrança avulsa não saiu', { conversation_id: e.conversationId, error: (err instanceof Error ? err.message : String(err)).slice(0, 160) });
        return null;
      }),
    ]);
    if (pix === null && link === null) return { recusa: SEM_COBRANCA };
    e.log.info('pix de cobrança avulsa criado', {
      conversation_id: e.conversationId,
      extra: pedido.metadados.extra,
      valor_centavos: valorCentavos,
      quantidade: marca.quantidade,
      cobranca: pix?.id ?? null,
      link_de_cartao: link?.id ?? null,
    });
    return { corpo: corpoComPixDoExtra(e.corpo, marca, pix?.copiaECola ?? null, link?.url ?? null) };
  } catch (err) {
    e.log.warn('cobrança avulsa não saiu — envio recusado para a marca não chegar à pessoa', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: SEM_COBRANCA };
  }
}
