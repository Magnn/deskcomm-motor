/**
 * TRABALHO FEITO — quem é do templo terminou a parte do altar e avisa a cliente pelo agente.
 *
 * Caso real (dono, 04/11/2026): o templo faz o trabalho, leva horas, e entrega junto a parte que a
 * cliente faz em casa. A cliente não via nada disso: a prova de execução era a palavra do agente. O
 * agente NÃO pode afirmar sozinho que o trabalho terminou — ninguém confirmou. Então a confirmação é
 * um clique humano: o botão "Trabalho feito" na conversa enfileira um `followup_turn` com o motivo, e
 * o agente escreve o aviso pela cadeia de sempre (guardrails, passagem, horário do canal).
 *
 * Por que não um fluxo disparado por etapa do funil: o motor guarda UM fluxo vivo por contato, e quem
 * acabou de pagar está dentro do fluxo de entrega — o fluxo novo seria pulado em silêncio justamente
 * para quem deveria receber o aviso.
 *
 * Janela de 24 h: o aviso só sai para quem escreveu nas últimas 24 h (regra do dono: nada fora da
 * janela, mesmo sem a API oficial). A rota recusa antes, com o motivo na tela; o job também leva
 * `so_dentro_da_janela`, que descarta o envio se a janela fechar enquanto ele espera na fila.
 */
import { z } from "zod";

/** Chave do payload do job: é por ela que o aviso repetido é barrado. */
export const CHAVE_DO_TRABALHO_FEITO = "trabalho_feito";
const JANELA_MS = 24 * 3_600_000;
/** Dois cliques no mesmo trabalho (ou dois atendentes) dentro disto viram um aviso só. */
const REPETICAO_MS = 6 * 3_600_000;

export const trabalhoFeitoSchema = z.object({
  /** O que quem fez quer que a cliente saiba (ex.: "acendemos às 21h"). Vai ao agente, não direto a ela. */
  observacao: z.string().trim().max(300).optional().default(""),
});
export type TrabalhoFeito = z.infer<typeof trabalhoFeitoSchema>;

export type Recusa = "sem_mensagem_dela" | "fora_da_janela" | "ja_avisado";

/** Pode avisar agora? Pura: quem lê o banco passa o que achou. */
export function podeAvisar(
  agora: Date,
  ultimaMensagemDela: Date | null,
  ultimoAviso: Date | null,
): { ok: true } | { ok: false; motivo: Recusa } {
  if (ultimoAviso && agora.getTime() - ultimoAviso.getTime() < REPETICAO_MS) return { ok: false, motivo: "ja_avisado" };
  if (!ultimaMensagemDela) return { ok: false, motivo: "sem_mensagem_dela" };
  if (agora.getTime() - ultimaMensagemDela.getTime() > JANELA_MS) return { ok: false, motivo: "fora_da_janela" };
  return { ok: true };
}

/**
 * O que o agente lê no turno. Fala do que a equipe CONFIRMOU e de nada mais: a foto só é citada se
 * estiver na conversa, e o agente não cria etapa, prazo nem resultado.
 */
export function motivoDoTrabalhoFeito(observacao: string): string {
  const obs = observacao.trim();
  return [
    "A EQUIPE DO TEMPLO ACABOU DE CONFIRMAR, agora, que a parte do altar do trabalho desta pessoa está concluída.",
    "Avise em 1 ou 2 balões curtos, com carinho e na sua voz, que você terminou hoje a sua parte no altar, com o nome dela.",
    obs ? `O que a equipe pediu para ela saber: "${obs}". Diga isso com as suas palavras, sem acrescentar nada.` : "",
    "Se a equipe mandou uma foto nesta conversa nas últimas horas, diga que é do altar dela. Se não há foto, não fale de foto.",
    "Depois, lembre a parte dela em casa pela etapa em que ela está no MATERIAL DE ENTREGA, sem criar etapa, ritual ou prazo novo.",
    "Não prometa resultado nem prazo de resultado. Termine com uma pergunta simples sobre como ela está.",
  ]
    .filter(Boolean)
    .join(" ");
}

export const MENSAGEM_DA_RECUSA: Record<Recusa, string> = {
  sem_mensagem_dela: "Esta pessoa ainda não escreveu nesta conversa, então o aviso não pode sair.",
  fora_da_janela: "Ela não escreve há mais de 24 horas. O aviso não sai fora da janela: mande quando ela escrever de novo.",
  ja_avisado: "O aviso de trabalho feito já foi pedido para esta pessoa nas últimas 6 horas.",
};
