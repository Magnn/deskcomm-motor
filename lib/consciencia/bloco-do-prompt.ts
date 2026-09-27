/**
 * O BLOCO DE CONSCIÊNCIA — o que o agente lê sobre quem é esta pessoa e o quanto ela já entende do
 * próprio problema, montado dos campos que o dono preencheu na aba "Consciência" (`tipos.ts`).
 *
 * Vai logo depois da Oferta, na fila de blocos (`blocos-do-turno.ts`): calibra como conduzir a
 * pessoa até a oferta, antes de o agente decidir como responder a uma objeção. O que o cliente
 * digita (desejo, medo, promessa) entra como DADO, dentro de um molde — uma linha, sem aspas
 * duplas — pelo sanitizador compartilhado (`lib/prompt/texto-do-cliente.ts`).
 *
 * Sem campo, sem bloco: `null`, desligado ou sem nenhum campo preenchido devolve `''` — o system
 * segue idêntico ao de antes.
 */
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import { DESCRICAO_DO_NIVEL, type ConscienciaConfig } from "./tipos";

export function blocoDeConsciencia(consciencia: ConscienciaConfig | null): string {
  if (consciencia === null || !consciencia.enabled) return "";

  const desejo = umaLinha(consciencia.desejo_ou_dor ?? "");
  const medo = umaLinha(consciencia.medo_oculto ?? "");
  const promessa = umaLinha(consciencia.promessa ?? "");

  const linhas: string[] = [];
  if (consciencia.nivel !== undefined) linhas.push(`- ${DESCRICAO_DO_NIVEL[consciencia.nivel].frase}`);
  if (desejo !== "") linhas.push(`- O que esta pessoa mais quer resolver ou conquistar: ${desejo}`);
  if (medo !== "") {
    linhas.push(
      `- O medo de fundo, que raramente é dito em voz alta: ${medo}. Reconheça-o com delicadeza quando fizer sentido; nunca o nomeie de forma crua nem o repita de volta à pessoa.`,
    );
  }
  if (promessa !== "") linhas.push(`- A promessa central desta oferta, o que a torna diferente: ${promessa}`);

  if (linhas.length === 0) return "";
  return [
    "",
    "",
    "CONSCIÊNCIA DO LEAD (definida pelo dono do negócio; calibra COMO conduzir esta pessoa até a oferta)",
    ...linhas,
  ].join("\n");
}
