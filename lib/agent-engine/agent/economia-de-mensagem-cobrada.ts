/**
 * ECONOMIA DE MENSAGEM COBRADA — quando o canal cobra por mensagem, a resposta sai em uma só.
 *
 * O canal oficial informa, a cada envio, se AQUELA mensagem foi cobrada (migration 0917). Desde
 * 01/10/2026 a resposta comum dentro da janela de atendimento voltou a ter preço; quem chega por
 * anúncio de clique segue gratuito. Medido em produção em 07/10/2026: 6.917 mensagens pagas em uma
 * semana, e o agente mandava em média 2,2 mensagens por resposta (até 4) — cada balão é uma cobrança.
 *
 * ─── A regra ──────────────────────────────────────────────────────────────────────────────────────
 * Olha a ÚLTIMA mensagem enviada ao contato sobre a qual o provedor se pronunciou. Se ela foi cobrada,
 * o turno não divide a resposta em bolhas e o modelo é instruído a dizer tudo numa mensagem. Se foi
 * gratuita, ou se o provedor ainda não disse nada (contato novo, canal que não informa), nada muda.
 *
 * ─── Por que perguntar ao provedor, e não deduzir ─────────────────────────────────────────────────
 * A tabela de preços dele mudou duas vezes em um ano, e o que decide se uma conversa é gratuita (clique
 * de anúncio, franquia do mês, janela) não é visível daqui com segurança. O que ele carimbou na
 * mensagem anterior do MESMO contato é a melhor previsão do que fará com a próxima — e se a regra dele
 * mudar de novo, este módulo acompanha sem tocar em código.
 *
 * ─── O que NÃO faz ────────────────────────────────────────────────────────────────────────────────
 * Não baixa o teto de envios do turno: cortar a segunda mensagem no meio (o link de pagamento, por
 * exemplo) custa mais do que ela. É orientação ao modelo mais o fim do fatiamento automático.
 */
import type pg from 'pg';

/** `messages.billing_type` de uma mensagem que o provedor cobrou. */
export const TIPO_COBRADO = 'regular';

/** A regra, pura: só a mensagem CARIMBADA como cobrada liga a economia. */
export function cobradoPorMensagem(ultimoTipoDeCobranca: string | null | undefined): boolean {
  return ultimoTipoDeCobranca === TIPO_COBRADO;
}

/**
 * O que o provedor disse da última mensagem enviada a este contato. `null` = nunca se pronunciou.
 * Exportada para o teste de invariante conferir as colunas no schema real.
 */
export const CONSULTA_DA_ULTIMA_COBRANCA = `
  select billing_type
    from messages
   where organization_id = $1 and contact_id = $2
     and direction = 'outbound' and billing_type is not null
   order by created_at desc
   limit 1`;

export async function ultimoTipoDeCobrancaDoContato(
  db: Pick<pg.Pool, 'query'>,
  organizationId: string,
  contactId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ billing_type: string | null }>(CONSULTA_DA_ULTIMA_COBRANCA, [
    organizationId,
    contactId,
  ]);
  return rows[0]?.billing_type ?? null;
}

/** O que o modelo lê no lugar da instrução de bolhas quando a economia está ligada. */
export const INSTRUCAO_DE_MENSAGEM_UNICA =
  'Cada mensagem enviada a este contato é cobrada pelo canal. Responda em UMA única mensagem, ' +
  'com tudo o que precisa dizer neste turno: não divida a resposta em várias mensagens curtas. ' +
  'Mantenha o tom natural, em parágrafos curtos dentro da mesma mensagem.';
