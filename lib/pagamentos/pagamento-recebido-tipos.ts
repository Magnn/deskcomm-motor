/**
 * O vocabulário do pagamento recebido por fora do checkout — o que a TELA e o servidor compartilham.
 *
 * Mora à parte de `pagamento-recebido.ts` de propósito: aquele arquivo liga o banco e o fechamento
 * do negócio (código de servidor), e o diálogo é componente de cliente. Importar o esquema de lá
 * arrastava `next/headers` para o pacote do navegador e quebrava o build.
 */
import { z } from "zod";

export const METODOS_DE_PAGAMENTO = ["pix", "dinheiro", "cartao", "transferencia", "outro"] as const;
export type MetodoDePagamento = (typeof METODOS_DE_PAGAMENTO)[number];

export const ROTULO_DO_METODO: Record<MetodoDePagamento, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  transferencia: "Transferência",
  outro: "Outro",
};

export const pagamentoRecebidoSchema = z.strictObject({
  /** Gerada pela tela ao abrir o diálogo; é o que impede o registro em dobro. */
  chave: z.string().uuid(),
  valor_cents: z.number().int().min(100).max(10_000_000),
  produto: z.string().trim().min(1).max(120),
  metodo: z.enum(METODOS_DE_PAGAMENTO).default("pix"),
  /** Quando o dinheiro entrou. Ausente = agora. */
  pago_em: z.string().datetime({ offset: true }).optional(),
  iniciar_entrega: z.boolean().default(false),
});
export type PagamentoRecebido = z.infer<typeof pagamentoRecebidoSchema>;

export type DesfechoDoNegocio = "fechado" | "ja_estava_ganho" | "sem_negocio" | "nao_fechou";
export type DesfechoDaEntrega = "nao_pedida" | "iniciada" | "sem_fluxo";

export type ResultadoDoPagamento =
  | { resultado: "registrado"; negocio: DesfechoDoNegocio; entrega: DesfechoDaEntrega; motivoDaEntrega?: string }
  | { resultado: "ja_registrado" }
  | { resultado: "contato_nao_encontrado" };

export interface SugestaoDePagamento {
  produto: string;
  valor_cents: number;
}
