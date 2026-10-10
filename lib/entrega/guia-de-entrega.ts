/**
 * O GUIA DA ENTREGA — o material certo na mão da agente, sem depender de ela lembrar de procurá-lo.
 *
 * Pagou o "Abertura do Coração"? Então, neste turno, o guia de "Abertura do Coração" e as regras
 * gerais de entrega já estão no prompt. Antes isto era pedido à agente ("consulte no conhecimento"),
 * e no painel de Teste o modelo pequeno simplesmente NÃO chamava a busca: entregava de cabeça,
 * misturava o trabalho pago com outro e não perguntava as restrições (criança, pet, asma). A
 * busca, feita pelo código, tira essa decisão do modelo.
 *
 * Quando dispara: o contato tem a tag `pago` E `produto:<trabalho>` (as duas são postas pela compra
 * aprovada — `lib/pagamentos/compra-cakto.ts`). Sem as duas, nada é injetado e o turno segue como
 * sempre: quem só DISSE que pagou não recebe o entregável.
 *
 * Só entram trechos de materiais cujo nome começa por "Entregável" (as fichas de oferta e os outros
 * materiais do agente ficam de fora), e o bloco tem teto de tamanho: é custo de token por turno.
 */

export const TRABALHOS_DA_ENTREGA: Readonly<Record<string, string>> = {
  "abertura-do-coracao": "Abertura do Coração",
  "abertura-da-prosperidade": "Abertura da Prosperidade",
  "limpeza-e-protecao": "Limpeza e Proteção",
  "desbloqueio-dos-caminhos": "Desbloqueio dos Caminhos",
};

export interface TrabalhoPago {
  slug: string;
  nome: string;
}

/** O trabalho pago, lido das tags. `null` se não pagou, ou se o produto não é um dos trabalhos. */
export function trabalhoPagoDasTags(tags: readonly string[] | null | undefined): TrabalhoPago | null {
  const t = tags ?? [];
  if (!t.includes("pago")) return null;
  for (const tag of t) {
    if (!tag.startsWith("produto:")) continue;
    const slug = tag.slice("produto:".length);
    const nome = TRABALHOS_DA_ENTREGA[slug];
    if (nome !== undefined) return { slug, nome };
  }
  return null;
}

export interface TrechoDoConhecimento {
  content: string;
  source_name?: string | null | undefined;
}

export interface DepsDoGuia {
  buscar(query: string, topK: number): Promise<TrechoDoConhecimento[]>;
}

/** Teto do bloco, em caracteres (~2.500 tokens). */
export const TETO_DO_GUIA = 9000;

const ehDeEntrega = (t: TrechoDoConhecimento): boolean => (t.source_name ?? "").startsWith("Entregável");

/** Teto próprio do acompanhamento: ele não disputa espaço com o guia do trabalho. */
export const TETO_DO_ACOMPANHAMENTO = 4000;

export function montarBlocoDoGuia(
  trabalho: TrabalhoPago,
  trechos: readonly string[],
  acompanhamento: readonly string[] = [],
): string {
  if (trechos.length === 0) return "";
  const guia = trechos.join("\n---\n").slice(0, TETO_DO_GUIA);
  const corpo =
    acompanhamento.length === 0
      ? guia
      : [
          guia,
          "---",
          `ACOMPANHAMENTO DEPOIS DO TRABALHO (só quando ela tiver terminado TODAS as etapas de "${trabalho.nome}" acima. Antes disso, não mencione. Uma etapa por vez, esperando ela dizer que fez; a última só quando ela chamar no dia marcado.)`,
          acompanhamento.join("\n---\n").slice(0, TETO_DO_ACOMPANHAMENTO),
        ].join("\n");
  return [
    "",
    "",
    `MATERIAL DE ENTREGA (a pessoa PAGOU "${trabalho.nome}"; entregue ESTE trabalho e nenhum outro. A compra está confirmada: não fale em confirmação nem em espera.)`,
    `ORDEM DA ENTREGA: (1) Se você ainda NÃO perguntou com quem ela mora, sua resposta é SÓ este molde: "Recebi seu pagamento, [primeiro nome]! Vou montar o seu trabalho de ${trabalho.nome} do jeito que cabe na sua casa e na sua rotina. Antes de eu montar, me conta: você mora sozinha ou com quem?" (2) Depois, UMA pergunta por mensagem até saber: criança, bicho ou asma em casa; se pode usar vela; quanto tempo tem à noite. (3) Só então monte a etapa 1 a partir do material abaixo, personalizada com o que ela contou. Uma etapa por vez, esperando ela dizer "pronto". Use só se a conversa for sobre a entrega ou o trabalho.`,
    "---",
    corpo,
  ].join("\n");
}

/**
 * O material de ACOMPANHAMENTO de um trabalho: o que vem DEPOIS das noites dele.
 *
 * É um material à parte, e não um capítulo do guia, por duas razões. A busca do guia traz um número
 * fixo de trechos: um guia que cresce passa a perder pedaços, e o que some é imprevisível. E o
 * acompanhamento é opcional por trabalho — quem não escreveu um não muda nada.
 *
 * O nome é a ligação: "Entregável: <Trabalho> — <qualquer coisa>". Sem cadastro, sem tela nova.
 */
export const prefixoDoAcompanhamento = (trabalho: TrabalhoPago): string => `Entregável: ${trabalho.nome} — `;

/** O material é de OUTRO trabalho (o guia dele ou o acompanhamento dele)? */
function ehDeOutroTrabalho(nomeDoMaterial: string, trabalho: TrabalhoPago): boolean {
  return Object.values(TRABALHOS_DA_ENTREGA).some(
    (n) => n !== trabalho.nome && (nomeDoMaterial === `Entregável: ${n}` || nomeDoMaterial.startsWith(`Entregável: ${n} — `)),
  );
}

/** Busca as regras gerais, o guia do trabalho pago e o acompanhamento dele, e monta o bloco. `""` = nada a injetar. */
export async function carregarGuiaDeEntrega(deps: DepsDoGuia, trabalho: TrabalhoPago): Promise<string> {
  const [regras, guia, depois] = await Promise.all([
    deps.buscar("Entregável: regras gerais e como montar o entregável personalizado", 4),
    deps.buscar(`Entregável: ${trabalho.nome}`, 6),
    deps.buscar(`${prefixoDoAcompanhamento(trabalho)}acompanhamento depois do trabalho`, 6),
  ]);
  const vistos = new Set<string>();
  const novo = (t: TrechoDoConhecimento): string | null => {
    const chave = t.content.trim();
    if (chave === "" || vistos.has(chave)) return null;
    vistos.add(chave);
    return chave;
  };

  const trechos: string[] = [];
  for (const t of [...regras, ...guia]) {
    const nome = t.source_name ?? "";
    // Do guia do trabalho pago, só o dele: outro "Entregável: …" traria o trabalho errado. E o
    // acompanhamento tem a sua própria vez, abaixo — aqui ele empurraria o guia para fora do teto.
    if (!ehDeEntrega(t) || ehDeOutroTrabalho(nome, trabalho) || nome.startsWith(prefixoDoAcompanhamento(trabalho))) continue;
    const chave = novo(t);
    if (chave !== null) trechos.push(chave);
  }

  const acompanhamento: string[] = [];
  for (const t of depois) {
    if (!(t.source_name ?? "").startsWith(prefixoDoAcompanhamento(trabalho))) continue;
    const chave = novo(t);
    if (chave !== null) acompanhamento.push(chave);
  }
  return montarBlocoDoGuia(trabalho, trechos, acompanhamento);
}
