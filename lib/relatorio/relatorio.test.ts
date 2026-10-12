import { describe, expect, it, vi } from "vitest";

import { calcularSinastria, dataEmIso, mapaDoDia, sinastriaEmTexto } from "./astrologia";
import { gerarRelatorio, lerConteudo, pedidoAoModelo } from "./gerar";

const par = (t: string): string => `${t} Um parágrafo de tamanho real para o teste de formato do conteúdo.`;
const conteudo = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  capa: "Uma leitura dos encontros e dos desafios de vocês, com as posições reais dos planetas.",
  capitulos: [1, 2, 3].map((n) => ({ titulo: `Capítulo ${n}`, blocos: [{ tipo: "descoberta", titulo: "Sol junto do Sol", texto: [par("Identidade parecida.")] }] })),
  chaves: [1, 2, 3].map((n) => ({ titulo: `Chave ${n}`, texto: par("Fale antes do silêncio.") })),
  dias: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ titulo: `Passo ${n}`, texto: "Escreva três atitudes que fazem você se sentir amada." })),
  carta: ["Marilene,", "que esta leitura te devolva clareza."],
  ...extra,
});

describe("o cálculo dos mapas", () => {
  it("⭐ posições conferidas contra efemérides: 04/02/1982 e 01/02/1980", () => {
    const a = mapaDoDia("1982-02-04");
    expect(a.Sol.signo).toBe("Aquário");
    expect(Math.floor(a.Sol.grau)).toBe(15);
    expect(a["Vênus"].signo).toBe("Capricórnio");
    expect(a.Saturno.signo).toBe("Libra");
    // A Lua mudou de signo naquele dia: sem a hora, ela é incerta.
    expect(a.Lua.signoCerto).toBe(false);
    const b = mapaDoDia("1980-02-01");
    expect(b.Sol.signo).toBe("Aquário");
    expect(b["Vênus"].signo).toBe("Peixes");
    expect(b.Lua.signo).toBe("Leão");
  });

  it("⭐ os aspectos saem do cálculo, e o que depende da hora vem marcado", () => {
    const s = calcularSinastria({ nome: "Marilene", data: "1982-02-04" }, { nome: "Donizete", data: "1980-02-01" });
    const solSol = s.aspectos.find((x) => x.de === "Sol" && x.para === "Sol");
    expect(solSol).toMatchObject({ aspecto: "conjunção", firme: true });
    expect(s.aspectos.find((x) => x.de === "Lua" && x.para === "Saturno")).toMatchObject({ aspecto: "quadratura", firme: false });
    const texto = sinastriaEmTexto(s);
    expect(texto).toContain("Sol de Marilene em conjunção com Sol de Donizete");
    expect(texto).toContain("INCERTO sem a hora");
  });

  it("datas escritas à mão viram ISO, e data impossível é recusada", () => {
    expect(dataEmIso("04/02/1982")).toBe("1982-02-04");
    expect(dataEmIso("4-2-82")).toBe("1982-02-04");
    expect(dataEmIso("04 02 1982")).toBe("1982-02-04");
    // O caso medido: a pessoa digitou 1082.
    expect(dataEmIso("04/02/1082")).toBeNull();
    expect(dataEmIso("31/02/1990")).toBeNull();
    expect(dataEmIso("amanhã")).toBeNull();
  });
});

describe("o conteúdo do relatório", () => {
  it("⭐ promessa sobre a outra pessoa é barrada antes do PDF", () => {
    const comPromessa = conteudo({ carta: ["Marilene,", "ele vai voltar para você, fique tranquila."] });
    const lido = lerConteudo(JSON.stringify(comPromessa));
    expect(lido.ok).toBe(false);
    expect(!lido.ok && lido.motivo).toContain("vai voltar");
    expect(lerConteudo(JSON.stringify(conteudo())).ok).toBe(true);
  });

  it("resposta sem JSON ou fora do formato explica o que faltou", () => {
    expect(lerConteudo("desculpe, não consigo")).toEqual({ ok: false, motivo: "A resposta não trouxe um JSON válido." });
    const lido = lerConteudo(JSON.stringify(conteudo({ capitulos: [] })));
    expect(!lido.ok && lido.motivo).toContain("capitulos");
  });

  it("o pedido ao modelo leva os dados calculados e proíbe o que não está neles", () => {
    const p = { tipo: "sinastria" as const, produto: "O Código da Conexão", assinatura: "Atendente", a: { nome: "Ana", data: "1982-02-04" }, b: { nome: "Lucas", data: "1980-02-01" }, contexto: "- a gente se afasta" };
    const pedido = pedidoAoModelo(p, calcularSinastria({ nome: "Ana", data: "1982-02-04" }, p.b));
    expect(pedido).toContain("Sol de Ana em conjunção com Sol de Lucas");
    expect(pedido).toContain("Interprete SOMENTE os aspectos");
    expect(pedido).toContain("a gente se afasta");
  });
});

describe("gerarRelatorio", () => {
  const p = { tipo: "sinastria" as const, produto: "O Código da Conexão", assinatura: "Atendente", a: { nome: "Ana", data: "1982-02-04" }, b: { nome: "Lucas", data: "1980-02-01" }, contexto: "" };

  it("⭐ gera um PDF de verdade, com o nome do arquivo sem acento", async () => {
    const r = await gerarRelatorio(p, { chamar: async () => JSON.stringify(conteudo()) });
    if (!r.ok) throw new Error(r.motivo);
    expect(r.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(r.pdf.length).toBeGreaterThan(8000);
    expect(r.nomeDoArquivo).toBe("O_Codigo_da_Conexao_Ana_Lucas.pdf");
  });

  it("conteúdo ruim é pedido de novo uma vez, com o motivo; persistindo, falha", async () => {
    const chamar = vi.fn(async (_m: { role: string; content: string }[]) => "sem json");
    const r = await gerarRelatorio(p, { chamar, renderizar: async () => Buffer.from("x") });
    expect(r.ok).toBe(false);
    expect(chamar).toHaveBeenCalledTimes(2);
    expect(chamar.mock.calls[1]![0].at(-1)?.content).toContain("Devolva o JSON inteiro de novo");
  });

  it("sinastria sem a segunda pessoa não gera nada", async () => {
    const r = await gerarRelatorio({ ...p, b: undefined as never }, { chamar: async () => "{}" });
    expect(r).toEqual({ ok: false, motivo: "A sinastria precisa do nome e da data de nascimento das duas pessoas." });
  });
});
