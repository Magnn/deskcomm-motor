/**
 * O vocabulário do "Enviar Pix" da conversa — o atendente cobra por Pix sem sair do atendimento.
 * Sem dependência de servidor: o diálogo (navegador) e a rota usam a mesma régua.
 */
import { z } from "zod";

export const enviarPixSchema = z.strictObject({
  /** Em centavos. De R$ 1,00 a R$ 100.000,00. */
  valor_cents: z.number().int().min(100).max(10_000_000),
  produto: z.string().trim().min(1).max(120),
});
export type EnviarPix = z.infer<typeof enviarPixSchema>;

export interface PixEnviado {
  /** Identificador da cobrança no provedor. */
  cobranca: string;
  valor_cents: number;
}

const reais = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * As duas mensagens que a pessoa recebe: a instrução (com o valor e o nome que aparece no banco) e o código
 * sozinho, para copiar com um toque. Pura.
 */
export function mensagensDoPix(valorCents: number, copiaECola: string): [string, string] {
  return [
    `Pra pagar no Pix é só copiar o código abaixo e colar no app do seu banco, na opção *Pix Copia e Cola*. Valor: *${reais(valorCents)}*. No banco aparece o nome da empresa de pagamentos, é assim mesmo.`,
    copiaECola,
  ];
}
