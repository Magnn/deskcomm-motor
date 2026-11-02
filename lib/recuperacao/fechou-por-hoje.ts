/**
 * FECHOU POR HOJE — a pessoa disse "não", "não tenho" ou se despediu. Folha pura.
 *
 * Cada fala dela abre uma régua nova de recuperação, do primeiro passo. Medido em 02/11/2026: a Mari disse
 * "Não tenho esse $ agora", depois "Nao", depois "Obrigada", e a cada fala a régua recomeçou — quatro pedidos
 * de "quanto cabe hoje" em 7 minutos e mais dois depois da despedida. A Danny reclamou: "Só fala de dinheiro".
 * Quem fechou por hoje recebe só a chamada do dia seguinte, que pergunta de novo quanto cabe.
 */

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.!,;:…]+/g, " ")
    .replace(/[^\p{L}\p{N}$? ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SEM_DINHEIRO =
  /\b(?:nao tenho|nao tem|sem|nao estou com|nao to com|nao tou com) (?:esse |o |nenhum |nada de |como )?(?:valor|dinheiro|grana|condic\w*|pagar|\$)|\b(?:to|tou|estou|tô) zerad[oa]|\bnao tenho (?:agora|por agora|no momento|hoje)|\b(?:agora|hoje|no momento) nao\b|\bnao (?:posso|consigo|da|dá) (?:agora|hoje|no momento)|\bsem trabalh|\bdesempregad/;
const NEGACAO_ISOLADA = /^(?:nao|n|nn|nao obrigad[oa]|nao quero|nao posso|nao tenho|nao da|pode deixar|pode deixa|deixa pra la|deixa)$/;
const DESPEDIDA =
  /^(?:(?:ok|ta|ta bem|ta bom|sim|tudo bem|combinado|amem) )?(?:muito )?(?:obrigad[oa]|brigad[oa]|valeu|amem|amen|tchau|boa noite|ate amanha|ate mais|fica com deus|deus abencoe|igualmente|bom domingo|bom descanso|boa semana)(?: .*)?$/;

/** A última fala dela fecha a conversa por hoje: recusa, falta de dinheiro ou despedida. */
export function fechouPorHoje(ultimaFala: string | null | undefined): boolean {
  if (!ultimaFala) return false;
  const t = normalizar(ultimaFala);
  if (t === "") return false;
  if (SEM_DINHEIRO.test(t) || NEGACAO_ISOLADA.test(t)) return true;
  // Despedida é curta e não pergunta nada: "obrigada, quanto é?" continua a conversa.
  return t.length <= 40 && !t.includes("?") && DESPEDIDA.test(t);
}

const PERGUNTA_DE_DINHEIRO =
  /\bquanto (?:cabe|caberia|consegue|voce consegue|da pra|pode)|\b(?:que|qual) dia (?:o dinheiro|cai|entra|fica|voce|o seu)|\bquinta ou sexta|\bme diz (?:so )?(?:um|o) dia\b/;

/** A última fala da agente já perguntou quanto cabe ou que dia: a régua não repete a mesma pergunta hoje. */
export function jaPerguntouQuantoCabe(ultimaFalaDaAgente: string | null | undefined): boolean {
  if (!ultimaFalaDaAgente) return false;
  return PERGUNTA_DE_DINHEIRO.test(normalizar(ultimaFalaDaAgente));
}
