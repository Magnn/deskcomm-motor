/**
 * BOTÕES DE RESPOSTA — a pergunta que a pessoa responde com um toque.
 *
 * Nasceu para UMA pergunta: "quer continuar o atendimento ou prefere parar?". Antes, a saída era
 * oferecida por texto ("responda SAIR") em toda cobrança de silêncio — medido em produção em
 * 10/10/2026: 559 mensagens num dia com o convite, no meio de venda, e 21 pessoas bloqueadas por
 * responder a palavra. O botão resolve os dois lados: a saída fica clara para quem quer sair, e só
 * aparece quando o sistema decide oferecê-la (`lib/recuperacao/decisao.ts`), nunca por conta do
 * modelo.
 *
 * O formato é agnóstico de canal: `id` + `title`. Quem traduz para o transporte é o adapter; canal
 * que não tem botão recebe a mesma saída como uma linha de texto (`LINHA_SEM_BOTAO`).
 */

export interface BotaoDeResposta {
  id: string;
  title: string;
}

/** O que a plataforma oficial aceita: até 3 botões, título de até 20 caracteres. */
const MAXIMO_DE_BOTOES = 3;
const MAXIMO_DO_TITULO = 20;

/**
 * "Parar atendimento" é reconhecido de volta por `lib/opt-out/deteccao.ts` — o toque chega como o
 * texto do título, e é a mesma regra que entende a frase digitada. Trocar o título aqui sem conferir
 * lá faz o botão virar conversa comum. Vigiado em `tests/unit/botoes-de-resposta.test.ts`.
 */
export const BOTAO_CONTINUAR: BotaoDeResposta = { id: "continuar_atendimento", title: "Quero continuar" };
export const BOTAO_PARAR: BotaoDeResposta = { id: "parar_atendimento", title: "Parar atendimento" };
export const BOTOES_DE_CONTINUAR_OU_PARAR: readonly BotaoDeResposta[] = [BOTAO_CONTINUAR, BOTAO_PARAR];

/** A mesma saída, para canal sem botão. A frase é a que a detecção reconhece. */
export const LINHA_SEM_BOTAO = "Se preferir parar o atendimento, é só responder: parar atendimento.";

/** Canais cujo transporte sabe enviar botão de resposta. Os demais recebem a linha de texto. */
const PROVEDORES_COM_BOTAO: ReadonlySet<string> = new Set(["meta_cloud"]);

export function canalTemBotaoDeResposta(provider: string | null | undefined): boolean {
  return typeof provider === "string" && PROVEDORES_COM_BOTAO.has(provider);
}

/**
 * Lê `metadata.reply_buttons` de um envio. Qualquer coisa fora do formato devolve `null`: metadata
 * é campo aberto, e botão malformado derrubaria o envio inteiro na plataforma.
 */
export function lerBotoesDeResposta(metadata: Record<string, unknown> | null | undefined): BotaoDeResposta[] | null {
  const cru = metadata?.reply_buttons;
  if (!Array.isArray(cru) || cru.length === 0 || cru.length > MAXIMO_DE_BOTOES) return null;
  const botoes: BotaoDeResposta[] = [];
  for (const item of cru) {
    if (typeof item !== "object" || item === null) return null;
    const { id, title } = item as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0 || id.length > 256) return null;
    if (typeof title !== "string" || title.trim().length === 0 || title.length > MAXIMO_DO_TITULO) return null;
    botoes.push({ id, title });
  }
  return new Set(botoes.map((b) => b.id)).size === botoes.length ? botoes : null;
}
