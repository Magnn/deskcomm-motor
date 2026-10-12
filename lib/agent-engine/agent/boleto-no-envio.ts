/**
 * A ponta que fala com a rede para o BOLETO PRONTO (`lib/preco/boleto-pronto.ts`): confere a marca, busca o
 * endereço pelo CEP, emite o boleto no provedor e troca a marca pelo link e pela linha digitável.
 *
 * A marca traz o CPF de quem paga. Ela NUNCA passa adiante: ou vira boleto, ou o envio é recusado e a
 * instrução volta ao modelo. O CPF não é escrito em registro nenhum daqui.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { enderecoDoCep, type EnderecoDoCep } from '@/lib/pagamentos/cep';
import { lerConexaoStripe, type ConexaoStripe } from '@/lib/pagamentos/conexao-stripe';
import { ErroDaStripe, criarClienteStripe, type BoletoCriado, type PedidoDeBoleto } from '@/lib/pagamentos/stripe';
import { corpoComBoleto, marcaDeBoletoNoCorpo } from '@/lib/preco/boleto-pronto';
import { reais } from '@/lib/preco/tipos';

interface Registro {
  info(msg: string, dados?: Record<string, unknown>): void;
  warn(msg: string, dados?: Record<string, unknown>): void;
}

export interface EntradaDoBoleto {
  corpo: string;
  valoresPermitidosCents: readonly number[];
  /** Os metadados da cobrança para este valor: o produto principal, ou a cobrança à parte de mesmo valor. */
  metadadosDoValor: (cents: number) => Record<string, string>;
  /** O que aparece no boleto como descrição. */
  descricaoDoValor: (cents: number) => string;
  /** E-mail usado quando a pessoa não informou um: o provedor exige um para emitir. `null` = pedir à pessoa. */
  emailPadrao: string | null;
  organizationId: string;
  conversationId: string;
  supabase: SupabaseClient;
  log: Registro;
  /** Injetáveis só para teste. */
  lerConexao?: (admin: SupabaseClient, organizationId: string) => Promise<ConexaoStripe | null>;
  buscarEndereco?: (cep: string) => Promise<EnderecoDoCep | null>;
  criarBoleto?: (conexao: ConexaoStripe, pedido: PedidoDeBoleto) => Promise<BoletoCriado>;
  agora?: Date;
}

export type SaidaDoBoleto = { corpo: string } | { recusa: string };

const SEM_BOLETO =
  'Não foi possível emitir o boleto agora. NÃO envie a marca [[BOLETO: …]]. Diga à pessoa, numa mensagem curta, que o ' +
  'boleto chega em instantes, e chame atendimento humano para enviá-lo.';

export async function boletoNoLugarDaMarca(e: EntradaDoBoleto): Promise<SaidaDoBoleto> {
  const marca = marcaDeBoletoNoCorpo(e.corpo);
  if (marca.tipo === 'nenhuma') return { corpo: e.corpo };
  if (marca.tipo === 'invalida') return { recusa: marca.motivo };
  const pedido = marca.pedido;
  if (!e.valoresPermitidosCents.includes(pedido.valorCents)) {
    const lista = [...new Set(e.valoresPermitidosCents)].sort((a, b) => b - a).map(reais).join(', ');
    return { recusa: `O valor ${reais(pedido.valorCents)} não está liberado para esta pessoa agora. Valores liberados: ${lista || 'nenhum'}. Reescreva a marca com um deles.` };
  }
  const email = pedido.email ?? e.emailPadrao;
  if (email === null) return { recusa: 'Para emitir o boleto falta o e-mail dela. Peça o e-mail e escreva a marca de novo com ele no fim: [[BOLETO: valor | nome | CPF | CEP | e-mail]].' };
  try {
    const endereco = await (e.buscarEndereco ?? ((cep) => enderecoDoCep(cep)))(pedido.cep);
    if (endereco === null) {
      return { recusa: 'Não encontrei esse CEP. Peça para ela conferir o CEP (8 números) e mandar de novo; se não souber o da rua, serve o CEP geral da cidade.' };
    }
    const conexao = await (e.lerConexao ?? lerConexaoStripe)(e.supabase, e.organizationId);
    if (conexao === null) {
      e.log.warn('boleto não saiu — nenhuma conta conectada para emitir', { conversation_id: e.conversationId });
      return { recusa: SEM_BOLETO };
    }
    const agora = e.agora ?? new Date();
    const boleto = await (e.criarBoleto ?? ((c, p) => criarClienteStripe({ chave: c.chave }).criarBoleto(p)))(conexao, {
      valorCentavos: pedido.valorCents,
      descricao: e.descricaoDoValor(pedido.valorCents),
      referencia: `boleto-${e.conversationId}-${pedido.valorCents}-${Math.floor(agora.getTime() / 86_400_000)}`,
      metadados: e.metadadosDoValor(pedido.valorCents),
      pagador: { nome: pedido.nome, cpf: pedido.cpf, email, endereco },
      venceEmDias: 5,
    });
    e.log.info('boleto emitido na conversa', { conversation_id: e.conversationId, valor_centavos: pedido.valorCents, cobranca: boleto.id });
    return { corpo: corpoComBoleto(e.corpo, pedido, boleto) };
  } catch (err) {
    e.log.warn('boleto não saiu — envio recusado para a marca não chegar à pessoa', {
      conversation_id: e.conversationId,
      motivo: err instanceof ErroDaStripe ? err.codigo : 'falha',
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return { recusa: SEM_BOLETO };
  }
}
