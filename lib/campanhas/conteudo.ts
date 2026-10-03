/**
 * O CONTEÚDO DA CAMPANHA — o que ela manda a cada pessoa (migration 0915).
 *
 *   text     — o texto livre (`message_body`), como sempre foi;
 *   template — um modelo aprovado do canal oficial: o único jeito de esse canal
 *              falar com quem está fora da janela de 24h;
 *   flow     — inscreve a pessoa num fluxo publicado; a mídia, os botões e a
 *              sequência são do fluxo.
 *
 * Puro, sem banco: a tela, a preparação e a rodada leem a MESMA definição.
 */
export const TIPOS_DE_CONTEUDO = ["text", "template", "flow"] as const;
export type TipoDeConteudo = (typeof TIPOS_DE_CONTEUDO)[number];

export type ConteudoDaCampanha =
  | { kind: "text"; corpo: string }
  | { kind: "template"; nome: string; idioma: string; valores: Record<string, string> }
  | { kind: "flow"; fluxoId: string };

export interface CamposDeConteudo {
  content_kind?: string | null;
  message_body?: string | null;
  template_name?: string | null;
  template_language?: string | null;
  template_values?: unknown;
  flow_pointer_id?: string | null;
}

export const COLUNAS_DE_CONTEUDO = "content_kind, template_name, template_language, template_values, flow_pointer_id";

function valoresDoModelo(bruto: unknown): Record<string, string> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (typeof v === "string") saida[k] = v;
  }
  return saida;
}

export function tipoDoConteudo(c: CamposDeConteudo): TipoDeConteudo {
  return (TIPOS_DE_CONTEUDO as readonly string[]).includes(c.content_kind ?? "") ? (c.content_kind as TipoDeConteudo) : "text";
}

/** O conteúdo pronto para enviar, ou a frase do que falta. */
export function lerConteudo(c: CamposDeConteudo): { ok: true; conteudo: ConteudoDaCampanha } | { ok: false; falta: string } {
  const kind = tipoDoConteudo(c);
  if (kind === "template") {
    const nome = (c.template_name ?? "").trim();
    const idioma = (c.template_language ?? "").trim();
    if (nome === "" || idioma === "") return { ok: false, falta: "Escolha o modelo aprovado antes de preparar a campanha." };
    return { ok: true, conteudo: { kind, nome, idioma, valores: valoresDoModelo(c.template_values) } };
  }
  if (kind === "flow") {
    if (!c.flow_pointer_id) return { ok: false, falta: "Escolha o fluxo antes de preparar a campanha." };
    return { ok: true, conteudo: { kind, fluxoId: c.flow_pointer_id } };
  }
  const corpo = (c.message_body ?? "").trim();
  if (corpo === "") return { ok: false, falta: "Escreva a mensagem antes de preparar a campanha." };
  return { ok: true, conteudo: { kind: "text", corpo } };
}

/**
 * O texto em que as VARIÁVEIS da campanha aparecem — é o que a preparação lê
 * para excluir quem não tem o dado ("falta o nome"). No modelo, as variáveis
 * moram nos valores dos espaços; no fluxo não há variável da campanha (as do
 * fluxo são resolvidas por ele).
 */
export function textoComVariaveis(conteudo: ConteudoDaCampanha): string {
  if (conteudo.kind === "text") return conteudo.corpo;
  if (conteudo.kind === "template") return Object.values(conteudo.valores).join("\n");
  return "";
}

/** O conteúdo mudou? É o que sobe a versão do conteúdo num rascunho. */
export function conteudoMudou(antes: CamposDeConteudo, depois: CamposDeConteudo): boolean {
  const a = lerConteudo(antes);
  const d = lerConteudo(depois);
  return JSON.stringify(a) !== JSON.stringify(d);
}
