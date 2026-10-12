/**
 * GERAR O RELATÓRIO SOB MEDIDA — do pedido ao PDF.
 *
 * Três passos, com o modelo de linguagem só no do meio:
 *   1. o código junta os FATOS: quem é a pessoa, o que ela pediu com as palavras dela e, na sinastria, as posições
 *      e os aspectos calculados (`astrologia.ts`);
 *   2. o modelo escreve o conteúdo em JSON (`tipos.ts`), só em cima desses fatos;
 *   3. o código confere o formato e barra promessa de resultado, e o PDF é desenhado (`pdf.tsx`).
 * Conteúdo fora do formato ou com promessa é pedido de novo uma vez; persistindo, a geração falha e quem chamou
 * decide (o envio é recusado — um relatório ruim não sai).
 */
import { calcularSinastria, sinastriaEmTexto, type Sinastria } from "./astrologia";
import { renderizarRelatorio, type DadosDoRelatorio } from "./pdf";
import { conteudoDoRelatorioSchema, promessasNoConteudo, type ConteudoDoRelatorio } from "./tipos";

export type TipoDeRelatorio = "sinastria" | "leitura";

export interface PedidoDeRelatorio {
  tipo: TipoDeRelatorio;
  /** O nome do produto, como foi vendido. */
  produto: string;
  /** Quem assina (o nome com que o agente se apresenta). */
  assinatura: string;
  /** Sinastria: as duas pessoas. Leitura: só `a`. */
  a: { nome: string; data?: string };
  b?: { nome: string; data: string };
  /** O que a pessoa quer entender, com as palavras dela, e o que mais ela contou. */
  contexto: string;
  /** Orientação do operador para este produto (o que ele entrega, o tom). */
  orientacao?: string;
}

const FORMATO = `Responda SOMENTE com um objeto JSON, sem texto antes nem depois, neste formato:
{
  "capa": "uma frase (até 240 caracteres) sobre o que esta leitura é para esta pessoa",
  "capitulos": [
    { "titulo": "até 60 caracteres", "abre": "uma frase de abertura, opcional",
      "blocos": [ { "tipo": "descoberta" ou "texto", "titulo": "opcional", "texto": ["1 a 3 parágrafos de 2 a 5 frases"], "aplique": "uma pergunta para ela aplicar à própria vida, opcional" } ] }
  ],
  "chaves": [ { "titulo": "uma atitude prática", "texto": "um parágrafo" } ],
  "dias": [ { "titulo": "curto", "texto": "um passo simples para o dia" } ],
  "carta": ["2 a 5 parágrafos curtos, em segunda pessoa, começando pelo nome dela"]
}`;

const REGRAS = `REGRAS QUE NÃO SE QUEBRAM
- Escreva em português do Brasil, em segunda pessoa, com carinho e clareza. Frases curtas. Sem emoji.
- Use o que ela contou: o relatório tem de soar feito para ela, não um texto que serviria a qualquer pessoa.
- NUNCA afirme o que outra pessoa sente, pensa ou vai fazer. NUNCA prometa que alguém volta, procura, liga ou muda. NUNCA dê prazo. O relatório mostra como cada um funciona e o que ela pode fazer, não o futuro.
- Não invente fatos da vida dela que ela não contou.
- "chaves": exatamente 3. "dias": exatamente 7, a maioria com algo que depende só dela.`;

export function pedidoAoModelo(p: PedidoDeRelatorio, sinastria: Sinastria | null): string {
  const partes = [`Você escreve o relatório "${p.produto}", assinado por ${p.assinatura}, para ${p.a.nome}${p.b ? ` sobre a relação com ${p.b.nome}` : ""}.`];
  if (p.orientacao) partes.push(`O QUE ESTE PRODUTO ENTREGA (orientação de quem vende):\n${p.orientacao}`);
  partes.push(`O QUE ELA CONTOU E QUER ENTENDER:\n${p.contexto.trim() || "(ela não detalhou; fique no que os dados mostram)"}`);
  if (sinastria) {
    partes.push(
      `DADOS CALCULADOS (a única fonte astrológica permitida):\n${sinastriaEmTexto(sinastria)}`,
      `COMO USAR OS DADOS
- Interprete SOMENTE os aspectos e posições listados acima. Não cite aspecto, signo, casa ou Ascendente que não esteja na lista.
- Em cada bloco "descoberta", o "titulo" é o aspecto ou a posição ("Vênus de ${p.a.nome} em trígono com Saturno de ${p.b?.nome ?? "…"}") e o texto é a leitura simbólica tradicional dele.
- O que está marcado INCERTO só entra como hipótese, dizendo que depende da hora de nascimento.
- Capítulos, nesta ordem (6 a 8): a assinatura da conexão; o magnetismo entre vocês; a linguagem do amor de cada um; o que aproxima vocês; o que provoca desencontros; o potencial da relação.`,
    );
  } else {
    partes.push(`Capítulos (4 a 6): comece pelo que ela está vivendo, passe pelo que se repete, pelo que depende dela e pelo próximo passo. Sem astrologia nem cartas que não foram dadas a você.`);
  }
  partes.push(REGRAS, FORMATO);
  return partes.join("\n\n");
}

/** O JSON dentro da resposta do modelo. Lança se não houver. */
export function jsonDaResposta(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini === -1 || fim <= ini) throw new Error("resposta sem JSON");
  return JSON.parse(texto.slice(ini, fim + 1));
}

export type ConteudoLido = { ok: true; conteudo: ConteudoDoRelatorio } | { ok: false; motivo: string };

export function lerConteudo(texto: string): ConteudoLido {
  let bruto: unknown;
  try {
    bruto = jsonDaResposta(texto);
  } catch {
    return { ok: false, motivo: "A resposta não trouxe um JSON válido." };
  }
  const lido = conteudoDoRelatorioSchema.safeParse(bruto);
  if (!lido.success) {
    const i = lido.error.issues[0];
    return { ok: false, motivo: `Formato fora do combinado em "${i?.path.join(".") ?? "?"}": ${i?.message ?? "inválido"}.` };
  }
  const promessas = promessasNoConteudo(lido.data);
  if (promessas.length > 0) {
    return { ok: false, motivo: `Há frases que afirmam o que outra pessoa sente ou vai fazer, ou prometem resultado. Reescreva sem elas: "${promessas.slice(0, 3).join('" | "')}".` };
  }
  return { ok: true, conteudo: lido.data };
}

/** A página final: fixada pelo código, para o modelo não poder tirar nem enfeitar. */
export function paginaFinal(p: PedidoDeRelatorio, sinastria: Sinastria | null): { titulo: string; texto: string }[] {
  const caixas: { titulo: string; texto: string }[] = [];
  if (sinastria) {
    caixas.push({
      titulo: "Como esta leitura foi feita",
      texto: "As posições do Sol, da Lua e dos planetas foram calculadas para as duas datas de nascimento informadas. Só entraram os encontros que o cálculo confirmou.",
    });
    caixas.push({
      titulo: "O que fica mais preciso com a hora",
      texto: "Com a **hora e a cidade** de nascimento dos dois dá para confirmar a Lua, os encontros tracejados do mapa e o Ascendente de cada um.",
    });
  } else {
    caixas.push({ titulo: "Como esta leitura foi feita", texto: `Ela foi escrita a partir do que você contou na nossa conversa, ${p.a.nome}, e de nada além disso.` });
  }
  caixas.push({
    titulo: "O que ela não faz",
    texto: "Esta é uma leitura simbólica, para você se conhecer e enxergar a situação com mais clareza. Ela não prova o que outra pessoa sente, não garante o que alguém vai fazer e não substitui uma conversa sincera nem ajuda profissional de saúde.",
  });
  return caixas;
}

export type RelatorioGerado =
  | { ok: true; pdf: Buffer; conteudo: ConteudoDoRelatorio; nomeDoArquivo: string }
  | { ok: false; motivo: string };

const semAcento = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export async function gerarRelatorio(
  p: PedidoDeRelatorio,
  deps: {
    /** Uma chamada ao modelo: recebe o pedido (e, na segunda vez, a correção) e devolve o texto. */
    chamar: (mensagens: { role: "user" | "assistant"; content: string }[]) => Promise<string>;
    renderizar?: (d: DadosDoRelatorio) => Promise<Buffer>;
  },
): Promise<RelatorioGerado> {
  let sinastria: Sinastria | null = null;
  if (p.tipo === "sinastria") {
    if (!p.b || !p.a.data) return { ok: false, motivo: "A sinastria precisa do nome e da data de nascimento das duas pessoas." };
    sinastria = calcularSinastria({ nome: p.a.nome, data: p.a.data }, p.b);
  }
  const pedido = pedidoAoModelo(p, sinastria);
  const mensagens: { role: "user" | "assistant"; content: string }[] = [{ role: "user", content: pedido }];
  let lido: ConteudoLido = { ok: false, motivo: "sem resposta" };
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const resposta = await deps.chamar(mensagens);
    lido = lerConteudo(resposta);
    if (lido.ok) break;
    mensagens.push({ role: "assistant", content: resposta.slice(0, 6000) }, { role: "user", content: `${lido.motivo} Devolva o JSON inteiro de novo, corrigido.` });
  }
  if (!lido.ok) return { ok: false, motivo: lido.motivo };
  const nomes = p.b ? `${p.a.nome} & ${p.b.nome}` : p.a.nome;
  const pdf = await (deps.renderizar ?? renderizarRelatorio)({
    titulo: p.produto,
    nomes,
    assinatura: p.assinatura,
    conteudo: lido.conteudo,
    ...(sinastria ? { sinastria } : {}),
    fim: paginaFinal(p, sinastria),
  });
  return { ok: true, pdf, conteudo: lido.conteudo, nomeDoArquivo: `${semAcento(p.produto)}_${semAcento(nomes)}.pdf` };
}
