/**
 * A ponta que fala com o provedor: troca, no corpo que o agente vai enviar, o link de pagamento pelo
 * "Pix copia e cola" + o link. A regra (que link vale quanto, como o corpo é reescrito) é pura e mora em
 * `lib/pagamentos/pix-na-conversa.ts`; aqui ficam a leitura da conexão e a chamada de rede.
 *
 * NUNCA lança e nunca segura o envio: sem conexão, sem link conhecido ou com o provedor recusando, devolve o
 * corpo como veio — a pessoa recebe o link de pagamento de sempre.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import {
  VALIDADE_DO_PIX_S,
  corpoComPix,
  linkDePagamentoNoCorpo,
  linksDePagamentoDaConfig,
  referenciaDoPix,
} from '@/lib/pagamentos/pix-na-conversa';
import { ErroDaStripe, criarClienteStripe, type PixCriado, type PedidoDePix } from '@/lib/pagamentos/stripe';
import type { PricingConfig } from '@/lib/preco/tipos';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDoPixNoEnvio {
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
  agora?: Date;
}

export async function pixNoLugarDoLink(e: EntradaDoPixNoEnvio): Promise<string> {
  try {
    // A leitura mais barata primeiro: sem link de pagamento conhecido no corpo, nem se consulta a conexão.
    const link = linkDePagamentoNoCorpo(e.corpo, linksDePagamentoDaConfig(e.pricing));
    if (link === null) return e.corpo;

    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) return e.corpo;

    const agora = e.agora ?? new Date();
    const pedido: PedidoDePix = {
      valorCentavos: link.valorCentavos,
      descricao: link.produto || 'Pagamento',
      referencia: referenciaDoPix(e.conversationId, link.valorCentavos, agora),
      metadados: {
        organization_id: e.organizationId,
        contact_id: e.contactId,
        conversation_id: e.conversationId,
        produto: link.produto,
      },
      expiraEmSegundos: VALIDADE_DO_PIX_S,
    };
    const pix = await (e.criarPix ?? ((c, p) => criarClienteStripe({ chave: c.chave }).criarPix(p)))(conexao, pedido);
    e.log.info('pix criado para a conversa', {
      conversation_id: e.conversationId,
      valor_centavos: link.valorCentavos,
      cobranca: pix.id,
    });
    return corpoComPix(e.corpo, link, pix.copiaECola);
  } catch (err) {
    e.log.warn('pix não saiu — a pessoa recebe o link de pagamento', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return e.corpo;
  }
}
