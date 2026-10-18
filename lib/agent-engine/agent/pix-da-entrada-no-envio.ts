/**
 * O PIX DA ENTRADA NO VALOR QUE A PESSOA DISSE (`entradaImediata`, em `lib/preco/estado-da-negociacao.ts`).
 *
 * A pessoa diz "só tenho 90 no Pix". O turno autoriza a entrada de R$ 90 e o agente escreve, sozinho num
 * balão, a marca `[[PIX: Entrada]]`; aqui a marca vira a instrução e o código do Pix desse valor exato. Não
 * há link de checkout para um valor qualquer, por isso é marca e não link. O modelo nunca escolhe o valor.
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
import { ErroDaStripe, criarClienteStripe, type PedidoDePix, type PixCriado } from '@/lib/pagamentos/stripe';
import { MARCA_DA_ENTRADA } from '@/lib/preco/bloco-da-entrada';
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
  /** Injetáveis só para teste. */
  lerConexao?: (admin: SupabaseClient, organizationId: string) => Promise<ConexaoStripe | null>;
  criarPix?: (conexao: ConexaoStripe, pedido: PedidoDePix) => Promise<PixCriado>;
  agora?: Date;
}

export type SaidaDoPixDaEntrada = { corpo: string } | { recusa: string };

const NA_MARCA = /\[\[\s*PIX\s*:\s*entrada\s*\]\]/i;

const SEM_COBRANCA =
  'Não foi possível gerar o Pix da entrada agora. NÃO envie a marca [[PIX: Entrada]] nem chave Pix. Diga à pessoa, numa ' +
  'mensagem curta, que o código do Pix chega em instantes, e chame atendimento humano para enviá-lo.';

/** O corpo traz a marca da entrada? Quem chama usa para não tocar no envio que não é de entrada. */
export const temMarcaDaEntrada = (corpo: string): boolean => NA_MARCA.test(corpo);

export async function pixDaEntradaNoLugarDaMarca(e: EntradaDoPixDaEntrada): Promise<SaidaDoPixDaEntrada> {
  const achada = NA_MARCA.exec(e.corpo);
  if (achada === null) return { corpo: e.corpo };
  try {
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('pix da entrada não saiu — nenhuma conta de Pix conectada', { conversation_id: e.conversationId });
      return { recusa: SEM_COBRANCA };
    }
    const agora = e.agora ?? new Date();
    const pedido: PedidoDePix = {
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
      expiraEmSegundos: VALIDADE_DO_PIX_S,
    };
    const pix = await (e.criarPix ?? ((c, p) => criarClienteStripe(c).criarPix(p)))(conexao, pedido);
    e.log.info('pix da entrada criado no valor que a pessoa disse', {
      conversation_id: e.conversationId,
      entrada_cents: e.entrada.entradaCents,
      restante_cents: e.entrada.restanteCents,
      cobranca: pix.id,
    });
    const marca = { extra: { name: MARCA_DA_ENTRADA, price_cents: e.entrada.entradaCents, when: '' }, texto: achada[0] };
    return { corpo: corpoComPixDoExtra(e.corpo, marca, pix.copiaECola) };
  } catch (err) {
    e.log.warn('pix da entrada não saiu — envio recusado para a marca não chegar à pessoa', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: SEM_COBRANCA };
  }
}
