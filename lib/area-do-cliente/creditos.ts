/**
 * OS CRÉDITOS da área do cliente — as regras puras (pedido do dono em 18/10/2026).
 *
 * Uma carteira só para tudo o que a pessoa compra na área: ela compra um pacote (Pix ou cartão) e usa os
 * créditos com um toque. 1 crédito vale R$ 1 no preço de tabela; pacote maior traz bônus. O valor em reais
 * aparece sempre ao lado — crédito não pode esconder quanto se gasta.
 *
 * O saldo mora no banco (`area_creditos`, migration 0938) e só muda por `fn_area_creditos_mover`.
 */

/** O `extra` do pagamento de um pacote: diz ao aviso da Stripe que o pagamento vira créditos. */
export const EXTRA_DOS_CREDITOS = "creditos";

export interface PacoteDeCreditos {
  creditos: number;
  preco_cents: number;
}

export const PACOTES_PADRAO: readonly PacoteDeCreditos[] = [
  { creditos: 30, preco_cents: 3000 },
  { creditos: 70, preco_cents: 6000 },
  { creditos: 130, preco_cents: 10000 },
];

/** Créditos que o Círculo dá a cada mês pago. */
export const CREDITOS_DO_CIRCULO_PADRAO = 30;

export interface ConfigDosCreditos {
  ativo: boolean;
  pacotes: PacoteDeCreditos[];
  circulo_mensal: number;
}

/** O bônus do pacote: o que vem além de 1 crédito por real. Nunca negativo. */
export function bonusDoPacote(p: PacoteDeCreditos): number {
  return Math.max(0, p.creditos - Math.floor(p.preco_cents / 100));
}

/** Quantos créditos custa algo que custa `precoCents` em reais: 1 por real, arredondado para cima. */
export function creditosDoPreco(precoCents: number): number {
  return Math.max(1, Math.ceil(precoCents / 100));
}

/** O pacote que a tela destaca: o do meio (nem o menor, nem empurrar o maior). */
export function pacoteEmDestaque(pacotes: readonly PacoteDeCreditos[]): number {
  return pacotes.length >= 3 ? 1 : -1;
}
