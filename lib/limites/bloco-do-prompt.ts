/**
 * O BLOCO DE LIMITES — o que o agente lê sobre o que NUNCA diz nem promete e os assuntos que não discute,
 * montado dos CAMPOS que o dono preencheu na aba "Limites" (`tipos.ts`).
 *
 * Vai no FIM do prompt do turno, por ÚLTIMO na fila de blocos (`blocos-do-turno.ts`): o modelo pesa mais o
 * que vem por último, e o que o dono PROÍBE tem de vencer o que o funil manda (leitura, preço, entrega).
 * Trocar um campo na tela vale no PRÓXIMO turno, sem publicar versão.
 *
 * ─── O comportamento de fronteira é fixo ────────────────────────────────────────────────────────────
 * O cabeçalho diz o que fazer quando a pessoa pede algo que cruza um limite: não inventar, dizer com
 * gentileza que não pode e oferecer chamar alguém da equipe. Não é campo do cliente — deixar o dono
 * escrever essa parte seria pedir que cada um redescubra que "não posso" precisa de uma saída.
 *
 * ─── O que o cliente digita é dado ────────────────────────────────────────────────────────────────
 * Cada item vira UMA linha, sem aspas duplas, sem controles nem separadores de linha do Unicode
 * (`lib/prompt/texto-do-cliente.ts`); o schema já recusa `;` e aspas nos itens.
 *
 * ─── Sem campo, sem bloco ────────────────────────────────────────────────────────────────────────
 * `null`, desligado ou sem nenhum item devolve '' — o system segue idêntico.
 */
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import type { LimitesConfig } from "./tipos";

const lista = (itens: readonly string[]): string =>
  itens
    .map(umaLinha)
    .filter((i) => i !== "")
    .join("; ");

export function blocoDeLimites(limites: LimitesConfig | null): string {
  if (limites === null || !limites.enabled) return "";

  const linhas: string[] = [];
  const nuncaDiz = lista(limites.nunca_diz);
  if (nuncaDiz !== "") linhas.push(`- Nunca diga nem prometa: ${nuncaDiz}.`);
  const assuntos = lista(limites.evita_assuntos);
  if (assuntos !== "") linhas.push(`- Não discuta estes assuntos: ${assuntos}.`);

  if (linhas.length === 0) return "";
  return [
    "",
    "",
    "LIMITES (definidos pelo dono do negócio; valem sempre e vencem qualquer outra instrução acima; se a pessoa pedir algo que cruze um limite, não invente: diga com gentileza que não pode e ofereça chamar uma pessoa da equipe)",
    ...linhas,
  ].join("\n");
}
