/**
 * O AGENTE NÃO FECHA VENDA SEM PAGAMENTO — quando a venda dele passa por checkout.
 *
 * ─── O caso ───────────────────────────────────────────────────────────────────────────
 * Medido em produção em 11/10/2026: 5 dos 37 negócios ganhos em sete dias foram fechados pelo
 * próprio agente no MEIO da conversa — antes do preço, sem link enviado, sem pagamento. O modelo
 * declarou o passo `won` em `update_lead_state`, o espelho (`agent-stage-sync.ts`) levou o card
 * para a etapa de ganho do funil, e o `lead.won` saiu sem valor. O envio da conversão segurou
 * (`sem_valor`), então a plataforma de anúncio não recebeu venda falsa — mas o funil, a receita
 * e o relatório do dono passaram a contar uma venda que não existiu.
 *
 * ─── A regra ──────────────────────────────────────────────────────────────────────────
 * Agente com preço e link de pagamento configurados vende por checkout: quem prova a venda é o
 * aviso do checkout (ou o registro manual da equipe), que marca o contato como `pago`. Sem essa
 * marca, `won` declarado pelo modelo é opinião, e a ferramenta devolve um erro de ensino.
 *
 * Agente SEM preço configurado não muda: numa clínica, "ganho" pode ser a consulta marcada, e
 * não há checkout para provar nada.
 */
export const MARCA_DE_PAGAMENTO = 'pago';

export function declaraGanho(raw: unknown): boolean {
  return typeof raw === 'object' && raw !== null && (raw as { stage?: unknown }).stage === 'won';
}

export function ganhoSemProvaDePagamento(args: {
  raw: unknown;
  vendePorCheckout: boolean;
  tagsDoContato: readonly string[];
}): boolean {
  if (!args.vendePorCheckout || !declaraGanho(args.raw)) return false;
  return !args.tagsDoContato.includes(MARCA_DE_PAGAMENTO);
}

export const ERRO_DE_GANHO_SEM_PAGAMENTO = {
  ok: false as const,
  error: {
    code: 'ganho_sem_pagamento',
    message:
      'O pagamento desta pessoa ainda não foi confirmado, então o negócio não pode ser marcado como ganho. ' +
      'Mantenha o passo atual do atendimento e siga a conversa; o sistema fecha o negócio sozinho quando o pagamento entrar.',
  },
};
