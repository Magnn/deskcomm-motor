/**
 * O passo de IA de um fluxo que terminou SEM enviar nada (nenhuma linha no livro de envios do job). Mora aqui, e não
 * no agent-engine, porque o fluxo decide o que fazer com ele (`turn-bridge.ts`: uma nova tentativa) e a ponte nunca
 * importa nada do agent-engine — a dependência é numa direção só.
 */
export const SEM_ENVIO_DO_PASSO = "O assistente concluiu este passo sem enviar uma mensagem. Revise o próximo passo.";

/** O evento da segunda chance: no máximo UM por nó em cada inscrição. */
export const EVENTO_NOVA_TENTATIVA = "turn_retry";

/** Quanto esperar para tentar de novo: o bastante para o turno da mensagem que chegou junto terminar. */
export const ESPERA_DA_NOVA_TENTATIVA_MS = 2 * 60_000;
