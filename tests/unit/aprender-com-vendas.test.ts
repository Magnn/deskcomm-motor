/**
 * APRENDER COM VENDAS — E PODER VOLTAR ATRÁS.
 *
 * O flywheel só julgava a higiene das anotações; nada olhava se a conversa vendeu. A peça nova
 * compara conversas que fecharam com as que não fecharam e PROPÕE — nunca aplica. Estes testes
 * seguram as travas que são do código (e não só do pedido ao modelo) e a volta atrás.
 */
import { describe, expect, it } from "vitest";

import {
  licaoProibida,
  licoesValidas,
  promptDeComparacao,
  recorteDaNegociacao,
  REGRA_DE_VENDAS,
  transcricao,
} from "@/lib/agent-engine/flywheel/vendas";
import { COLUNAS_QUE_NAO_SE_COPIAM, conteudoDaVersao } from "@/lib/ai/agents/clonar-versao";
import { composeAppliedPrompt, removerTrechoAplicado } from "@/lib/ai/apply-proposal";

const nossa = (body: string) => ({ direction: "outbound", body });
const dela = (body: string) => ({ direction: "inbound", body });

describe("o trecho da conversa que vai para a comparação", () => {
  it("começa pouco antes do preço e não leva o início da conversa", () => {
    const inicio = Array.from({ length: 20 }, (_, i) => dela(`mensagem de abertura ${i}`));
    const conversa = [...inicio, nossa("O trabalho custa R$ 130, pagamento único."), dela("vou pagar")];
    const recorte = recorteDaNegociacao(conversa);
    expect(recorte[0]?.body).toBe("mensagem de abertura 14");
    expect(recorte.at(-1)?.body).toBe("vou pagar");
    expect(recorte).toHaveLength(8);
  });

  it("sem preço dito, vale o fim da conversa; e nunca passa do teto de mensagens", () => {
    const longa = Array.from({ length: 80 }, (_, i) => dela(`m${i}`));
    const recorte = recorteDaNegociacao(longa);
    expect(recorte).toHaveLength(REGRA_DE_VENDAS.mensagensPorConversa);
    expect(recorte.at(-1)?.body).toBe("m79");
  });

  it("mensagem vazia sai, e cada mensagem é cortada no teto de caracteres", () => {
    const t = transcricao([nossa("Fica R$ 130."), dela("   "), dela("x".repeat(1000))]);
    const linhas = t.split("\n");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toBe("AGENTE: Fica R$ 130.");
    expect(linhas[1]).toBe(`PESSOA: ${"x".repeat(REGRA_DE_VENDAS.caracteresPorMensagem)}`);
  });
});

describe("o pedido de comparação", () => {
  const p = promptDeComparacao(["AGENTE: a"], ["AGENTE: b"]);

  it("numera os dois lados e diz que lista vazia é resposta certa", () => {
    expect(p).toContain("--- GANHA 1 ---");
    expect(p).toContain("--- PERDIDA 1 ---");
    expect(p).toContain("Lista vazia é resposta certa");
  });

  it("proíbe as quatro saídas fáceis: preço, promessa, pressa e terceiros", () => {
    expect(p).toContain("NÃO proponha baixar o preço");
    expect(p).toContain("NÃO proponha prometer resultado");
    expect(p).toContain("urgência");
    expect(p).toContain("rival, traição");
  });
});

describe("⭐ as travas do código sobre o que o modelo respondeu", () => {
  const boa = {
    regra: "Antes de dizer o valor, repita com as palavras dela o que ela contou e pergunte se é isso.",
    ganhas: [1, 2, 4],
    perdidas: [3],
    por_que: "Nas ganhas o agente confirmou o caso antes do preço.",
  };

  it("lição com apoio em 3 conversas ganhas passa, com os índices em base zero", () => {
    expect(licoesValidas({ licoes: [boa] }, 6, 6)).toEqual([
      { regra: boa.regra, ganhas: [0, 1, 3], perdidas: [2], porQue: boa.por_que },
    ]);
  });

  it("apoio em menos de 3 ganhas não é padrão: descartada", () => {
    expect(licoesValidas({ licoes: [{ ...boa, ganhas: [1, 2] }] }, 6, 6)).toEqual([]);
    // Índice repetido ou fora da amostra não conta como apoio.
    expect(licoesValidas({ licoes: [{ ...boa, ganhas: [1, 1, 1, 9] }] }, 6, 6)).toEqual([]);
  });

  it.each([
    "Ofereça o desconto logo na primeira reclamação para não perder a pessoa de vista.",
    "Baixe o valor assim que ela hesitar, antes que a conversa esfrie de vez.",
    "Garanta que o trabalho traz a pessoa de volta em poucos dias para dar segurança.",
    "Diga que é a última vaga da noite para que ela decida sem pensar muito.",
    "Lembre que existe uma rival por perto e que o tempo corre contra ela.",
  ])("lição proibida não vira proposta: %s", (regra) => {
    expect(licaoProibida(regra)).toBe(true);
    expect(licoesValidas({ licoes: [{ ...boa, regra }] }, 6, 6)).toEqual([]);
  });

  it("no máximo três lições, e resposta torta vira lista vazia", () => {
    const quatro = [1, 2, 3, 4].map((i) => ({ ...boa, regra: `${boa.regra} (variação ${i})` }));
    expect(licoesValidas({ licoes: quatro }, 6, 6)).toHaveLength(REGRA_DE_VENDAS.maximoDeLicoes);
    expect(licoesValidas(null, 6, 6)).toEqual([]);
    expect(licoesValidas({ licoes: "nenhuma" }, 6, 6)).toEqual([]);
    expect(licoesValidas({ licoes: [{ regra: "curta", ganhas: [1, 2, 3] }] }, 6, 6)).toEqual([]);
  });
});

describe("⭐ aplicar copia a versão INTEIRA", () => {
  it("só o que identifica a linha fica de fora — coluna nova passa sem ninguém lembrar dela", () => {
    const versao = {
      id: "v1",
      organization_id: "o",
      agent_id: "a",
      version_number: 7,
      status: "published",
      published_at: "2026-10-10",
      superseded_at: null,
      created_at: "2026-10-01",
      created_by: "u",
      provisioning_origin: null,
      system_prompt: "roteiro",
      followup: { silence_recovery: { enabled: true } },
      split_messages: true,
      split_max_chars: 300,
      knowledge_source_ids: ["k1"],
      pipeline_ids: ["p1"],
      operator_enabled: true,
      multimodal_input: true,
      uma_coluna_que_ainda_nao_existe: 42,
    };
    const copia = conteudoDaVersao(versao);
    for (const coluna of COLUNAS_QUE_NAO_SE_COPIAM) expect(copia).not.toHaveProperty(coluna);
    // Medido em 10/10/2026: a aplicação de proposta perdia exatamente estas.
    expect(copia).toMatchObject({
      followup: { silence_recovery: { enabled: true } },
      split_messages: true,
      split_max_chars: 300,
      knowledge_source_ids: ["k1"],
      pipeline_ids: ["p1"],
      operator_enabled: true,
      multimodal_input: true,
      uma_coluna_que_ainda_nao_existe: 42,
    });
  });
});

describe("⭐ desfazer tira exatamente o que a proposta pôs", () => {
  const base = "Você é a atendente.\n\nREGRAS\n- seja breve";
  const licao = "Confirme o caso com as palavras dela antes de dizer o valor.";

  it("aplicar e desfazer devolve o roteiro de antes", () => {
    const aplicado = composeAppliedPrompt(base, licao);
    expect(aplicado).toContain("## Aprendizado do flywheel");
    expect(removerTrechoAplicado(aplicado, licao)).toBe(base);
  });

  it("com outra proposta aplicada depois, sai só a que foi desfeita", () => {
    const outra = "Mande o link sozinho numa mensagem, sem texto junto.";
    const comAsDuas = composeAppliedPrompt(composeAppliedPrompt(base, licao), outra);
    const semAPrimeira = removerTrechoAplicado(comAsDuas, licao);
    expect(semAPrimeira).toContain(outra);
    expect(semAPrimeira).not.toContain(licao);
    expect(removerTrechoAplicado(semAPrimeira ?? "", outra)).toBe(base);
  });

  it("roteiro editado por cima: o trecho não está mais lá, e a resposta é null — não um chute", () => {
    const editado = composeAppliedPrompt(base, licao).replace("antes de dizer o valor", "sempre");
    expect(removerTrechoAplicado(editado, licao)).toBeNull();
    expect(removerTrechoAplicado(base, licao)).toBeNull();
  });
});
