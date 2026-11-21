/**
 * FECHOU POR HOJE — a pessoa disse "não", "não tenho" ou se despediu. Folha pura.
 *
 * Cada fala dela abre uma régua nova de recuperação, do primeiro passo. Medido em 02/11/2026: a Mari disse
 * "Não tenho esse $ agora", depois "Nao", depois "Obrigada", e a cada fala a régua recomeçou — quatro pedidos
 * de "quanto cabe hoje" em 7 minutos e mais dois depois da despedida. A Danny reclamou: "Só fala de dinheiro".
 * Quem fechou por hoje recebe só a chamada do dia seguinte, que pergunta de novo quanto cabe.
 * Também fecha quando a última fala só confirma uma despedida ("Ok") ou quando a própria agente se despediu.
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

/** Fala que só confirma ("ok", "tá bom", um emoji): não abre nem fecha nada, quem decide é a fala antes dela. */
const SO_CONFIRMA = /^(?:ok|okay|oki|ta|ta bom|ta bem|ta certo|blz|beleza|certo|certinho|combinado|isso|sim|uhum|aham|joia|show|bjs|beijos)?$/;

/**
 * Fecha por hoje olhando as falas finais, da mais nova para a mais velha, pulando as que só confirmam.
 *
 * Medido em 21/11/2026: uma cliente escreveu "obrigada, até mais tarde" e, um minuto depois, "Ok". Só a última fala era
 * lida, "Ok" não fecha nada, e a régua mandou mais duas chamadas no mesmo dia. Pular o "ok" erra, no máximo, para o lado
 * de chamar menos: quem confirma uma pergunta da agente depois de uma despedida recebe só a chamada do dia seguinte.
 */
export function fechouPorHojeNasFalas(falas: readonly (string | null | undefined)[] | null | undefined): boolean {
  for (let i = (falas?.length ?? 0) - 1; i >= 0; i--) {
    const fala = falas![i];
    if (!fala) continue;
    if (SO_CONFIRMA.test(normalizar(fala))) continue;
    return fechouPorHoje(fala);
  }
  return false;
}

const ENCERRAMENTO_DA_AGENTE =
  /\b(?:ate (?:mais tarde|amanha|logo|breve|mais|segunda|depois)|boa noite|bom descanso|dorme bem|durma bem|fica com deus|fique com deus|descansa)\b/;

/**
 * A última mensagem da agente encerrou a conversa ("Combinado, minha flor. Até mais tarde. 🌙"): não ficou pergunta no ar, e
 * não há silêncio para recuperar. Com pergunta na mensagem, não é encerramento ("Descansa hoje, tá bom?").
 */
export function agenteEncerrou(ultimaFalaDaAgente: string | null | undefined): boolean {
  if (!ultimaFalaDaAgente || ultimaFalaDaAgente.includes("?")) return false;
  // Só o fim da mensagem: "Boa noite, meu bem. Consegui deixar…" abre com saudação e não encerra nada.
  return ENCERRAMENTO_DA_AGENTE.test(normalizar(ultimaFalaDaAgente).slice(-40));
}

const PERGUNTA_DE_DINHEIRO =
  /\bquanto (?:cabe|caberia|consegue|voce consegue|da pra|pode)|\b(?:que|qual) dia (?:o dinheiro|cai|entra|fica|voce|o seu)|\bquinta ou sexta|\bme diz (?:so )?(?:um|o) dia\b/;

/** A última fala da agente já perguntou quanto cabe ou que dia: a régua não repete a mesma pergunta hoje. */
export function jaPerguntouQuantoCabe(ultimaFalaDaAgente: string | null | undefined): boolean {
  if (!ultimaFalaDaAgente) return false;
  return PERGUNTA_DE_DINHEIRO.test(normalizar(ultimaFalaDaAgente));
}
