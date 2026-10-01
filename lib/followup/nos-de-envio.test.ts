/**
 * Os nós PIX e Voice Studio viram mensagens que o motor JÁ sabe enviar. O que estes
 * casos guardam é o que a pessoa do outro lado recebe — e que o grafo salvo não muda.
 */
import { describe, expect, it } from "vitest";

import { voiceStudioConfigSchema, type FlowGraph, type FlowNode } from "./graph-schema";
import { baixarNosDeEnvio, bolhasDoPix, configDeVozDoItem, itemDeCobranca, itemDeTemplate, itemDeVoz } from "./nos-de-envio";

const pos = { x: 0, y: 0 };

function noPix(config: Record<string, unknown>): FlowNode {
  return { id: "p", type: "pix_payment", label: "PIX", position: pos, config: { key_type: "cpf", pix_key: "", ...config } } as FlowNode;
}
function noVoz(config: Record<string, unknown>): FlowNode {
  return { id: "v", type: "voice_studio", label: "Voz", position: pos, config: { text: "Oi", ...config } } as FlowNode;
}
const grafo = (...nodes: FlowNode[]): FlowGraph => ({ nodes, edges: [] }) as FlowGraph;

describe("bolhasDoPix — o que a pessoa recebe", () => {
  it("a chave vai SOZINHA na última bolha, para copiar sem selecionar", () => {
    const b = bolhasDoPix(noPix({ pix_key: "123.456.789-00", amount: "99,90" }).config as never);
    expect(b.at(-1)).toEqual({ type: "text", body: "123.456.789-00" });
    expect(b).toHaveLength(2);
  });

  it("valor só numérico ganha R$; texto livre fica como o dono escreveu", () => {
    const valor = (amount: string) => bolhasDoPix(noPix({ pix_key: "k", amount }).config as never)[0]?.body;
    expect(valor("97,00")).toContain("*Valor:* R$ 97,00");
    expect(valor("1.297,50")).toContain("*Valor:* R$ 1.297,50");
    expect(valor("a combinar")).toContain("*Valor:* a combinar");
  });

  it("a mensagem do dono vem primeiro e o tipo da chave é nomeado", () => {
    const [primeira] = bolhasDoPix(noPix({ pix_key: "k", key_type: "email", message_text: "Segue o PIX, combinado?" }).config as never);
    expect(primeira?.body.startsWith("Segue o PIX, combinado?")).toBe(true);
    expect(primeira?.body).toContain("*E-mail* (chave PIX)");
  });

  it("sem chave e sem texto não fabrica mensagem vazia", () => {
    expect(bolhasDoPix(noPix({}).config as never)).toEqual([]);
  });
});

describe("itemDeVoz", () => {
  it("texto vazio não vira áudio", () => {
    expect(itemDeVoz(noVoz({ text: "   " }).config as never)).toBeNull();
  });

  it("as seis vozes antigas do formulário continuam falando, numa voz real do mesmo gênero", () => {
    const esperado: Record<string, string> = {
      julieta: "coral",
      carla: "nova",
      maria_eduarda: "shimmer",
      marcos_vinicius: "ash",
      joao_pedro: "onyx",
      otavio_luiz: "echo",
    };
    for (const [antiga, real] of Object.entries(esperado)) {
      expect(itemDeVoz({ text: "Oi", voice_id: antiga, speed: 1 } as never)?.voice_id, antiga).toBe(real);
    }
  });

  it("sem provedor salvo, é a OpenAI — o que todo fluxo anterior a este campo sempre usou", () => {
    expect(itemDeVoz({ text: "Oi", voice_id: "coral", speed: 1 } as never)?.provider).toBe("openai");
  });

  it("ElevenLabs passa o id como veio: é id do provedor, não do nosso catálogo", () => {
    const item = itemDeVoz({ text: "Oi", provider: "elevenlabs", voice_id: "julieta", speed: 1 } as never);
    expect(item?.voice_id).toBe("julieta");
    expect(item?.provider).toBe("elevenlabs");
  });

  it("a velocidade do nó (0,5–2,0) é ajustada ao que as APIs aceitam (0,7–1,2)", () => {
    expect(itemDeVoz({ text: "Oi", voice_id: "coral", speed: 2 } as never)?.speed).toBe(1.2);
    expect(itemDeVoz({ text: "Oi", voice_id: "coral", speed: 0.5 } as never)?.speed).toBe(0.7);
    expect(itemDeVoz({ text: "Oi", voice_id: "coral", speed: 1 } as never)?.speed).toBe(1);
  });

  it("a configuração entregue à síntese tem o modelo que entende o estilo, só na OpenAI", () => {
    const openai = configDeVozDoItem(itemDeVoz({ text: "Oi", voice_id: "coral", speed: 1 } as never)!);
    expect(openai.model).toBe("gpt-4o-mini-tts");
    const eleven = configDeVozDoItem(itemDeVoz({ text: "Oi", provider: "elevenlabs", voice_id: "x", speed: 1 } as never)!);
    expect(eleven.model).toBeUndefined();
  });
});

describe("itemDeCobranca", () => {
  const cfg = (over: Record<string, unknown> = {}) =>
    ({ currency: "BRL", amount: "197,00", customer_name: "{full_name}", customer_phone: "{phone_number}", ...over }) as never;

  it("valor em texto vira centavos e o rótulo da caixa vira a descrição", () => {
    expect(itemDeCobranca(cfg(), "Consulta")).toEqual({
      type: "charge",
      amount_cents: 19700,
      description: "Consulta",
      customer_name: "{full_name}",
      customer_phone: "{phone_number}",
    });
    expect(itemDeCobranca(cfg({ amount: "1.297,50" }), "x")?.amount_cents).toBe(129750);
  });

  it.each([{ open_amount: true }, { amount: "" }, { amount: "0,00" }, { amount: "{valor_cobranca}" }])(
    "%j não vira cobrança — valor que não se pode afirmar não é cobrado",
    (over) => expect(itemDeCobranca(cfg(over), "x")).toBeNull(),
  );

  it("o nó vira uma Ação de conteúdo com UM item de cobrança", () => {
    const g = grafo({ id: "g", type: "payment_gateway", label: "Cobrar consulta", position: pos, config: { currency: "BRL", amount: "50,00", customer_name: "a", customer_phone: "b" } } as FlowNode);
    const n = baixarNosDeEnvio(g).nodes[0]!;
    expect(n.type).toBe("action");
    expect(n.type === "action" && n.config.mode === "content" && n.config.items).toEqual([
      expect.objectContaining({ type: "charge", amount_cents: 5000, description: "Cobrar consulta" }),
    ]);
  });
});

describe("itemDeTemplate", () => {
  it("modelo vira item com idioma e valores; idioma ausente é pt_BR", () => {
    expect(itemDeTemplate({ template_name: "oferta", values: { "1": "{primeiro_nome}" } } as never)).toEqual({
      type: "template",
      name: "oferta",
      language: "pt_BR",
      values: { "1": "{primeiro_nome}" },
    });
    expect(itemDeTemplate({ template_name: "oferta", language: "es" } as never)?.language).toBe("es");
  });

  it("sem modelo escolhido não vira item (o publish já barra)", () => {
    expect(itemDeTemplate({ template_name: "  " } as never)).toBeNull();
  });

  it("o nó de template vira uma Ação de conteúdo com UM item de template", () => {
    const g = grafo({ id: "w", type: "whatsapp_template", label: "Modelo", position: pos, config: { template_name: "oferta" } } as FlowNode);
    const n = baixarNosDeEnvio(g).nodes[0]!;
    expect(n.type).toBe("action");
    expect(n.type === "action" && n.config.mode === "content" && n.config.items).toEqual([expect.objectContaining({ type: "template", name: "oferta" })]);
  });
});

describe("baixarNosDeEnvio", () => {
  it("PIX vira uma Ação de conteúdo com o mesmo id e rótulo — o motor inteiro a trata como mensagem", () => {
    const g = baixarNosDeEnvio(grafo(noPix({ pix_key: "k", amount: "10" })));
    const n = g.nodes[0]!;
    expect(n.type).toBe("action");
    expect(n.id).toBe("p");
    expect(n.label).toBe("PIX");
    expect(n.type === "action" && n.config.mode === "content" && n.config.items.map((i) => i.type)).toEqual(["text", "text"]);
  });

  it("Voice Studio vira uma Ação com UM item de voz", () => {
    const n = baixarNosDeEnvio(grafo(noVoz({ voice_id: "julieta" }))).nodes[0]!;
    expect(n.type).toBe("action");
    expect(n.type === "action" && n.config.mode === "content" && n.config.items).toEqual([
      expect.objectContaining({ type: "voice", text: "Oi", provider: "openai", voice_id: "coral" }),
    ]);
  });

  it("grafo sem esses nós volta a MESMA referência (o cache por tick não copia à toa)", () => {
    const g = grafo({ id: "e", type: "end", label: "Fim", position: pos, config: { outcome: "converted" } } as FlowNode);
    expect(baixarNosDeEnvio(g)).toBe(g);
  });

  it("o grafo de entrada não é alterado (o editor segue mostrando o nó de PIX)", () => {
    const g = grafo(noPix({ pix_key: "k" }));
    baixarNosDeEnvio(g);
    expect(g.nodes[0]!.type).toBe("pix_payment");
  });

  it("nó sem o que enviar fica como passagem em vez de virar mensagem vazia", () => {
    expect(baixarNosDeEnvio(grafo(noPix({}))).nodes[0]!.type).toBe("pix_payment");
    expect(baixarNosDeEnvio(grafo(noVoz({ text: "" }))).nodes[0]!.type).toBe("voice_studio");
  });

  it("o nó de voz aceita o provedor no schema, e o fluxo salvo sem ele continua válido", () => {
    expect(voiceStudioConfigSchema.safeParse({}).success).toBe(true);
    expect(voiceStudioConfigSchema.safeParse({ provider: "elevenlabs", voice_id: "abc" }).success).toBe(true);
    expect(voiceStudioConfigSchema.safeParse({ provider: "azure" }).success).toBe(false);
  });
});
