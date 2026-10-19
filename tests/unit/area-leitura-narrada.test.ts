/**
 * A LEITURA DA MESA NARRADA pela voz do próprio servidor (pedido do dono em 19/10/2026: voz sem pagar por
 * caractere, com modelos abertos rodando na VPS).
 *
 * O que este arquivo guarda:
 *  - o roteiro fala a leitura na ordem da tela, com o nome dela, sem markdown nem emoji;
 *  - a chamada vai ao serviço configurado, na API de fala compatível com a da OpenAI, com a chave no
 *    cabeçalho, e recusa áudio vazio ou resposta de erro;
 *  - sem endereço configurado não há voz (e nada sai daqui).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ env: { VOZ_PROPRIA_BASE_URL: "", VOZ_PROPRIA_API_KEY: "", VOZ_PROPRIA_MODELO: "", VOZ_PROPRIA_VOZ: "" } }));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: async () => null }));

import { roteiroDaNarracao } from "@/lib/area-do-cliente/leituras-voz";
import { VozPropriaIndisponivel, falarNaVozPropria, vozPropriaConfigurada } from "@/lib/voz/servidor-proprio";

const cartas = [
  { id: 17, nome: "A Estrela", posicao: "O que pesa", sentido: "esperança" },
  { id: 10, nome: "A Roda da Fortuna", posicao: "O que está em movimento", sentido: "ciclo" },
  { id: 6, nome: "Os Enamorados", posicao: "O conselho das cartas", sentido: "escolha" },
];
const leitura = { cartas: ["**Cansaço** de esperar ✨", "Algo já se move.", "Escolha por você."], sintese: "Junta tudo.", passo: "Um passo pequeno." };

describe("roteiro da narração", () => {
  it("fala na ordem da tela, com o nome, e sem markdown nem emoji", () => {
    const r = roteiroDaNarracao(cartas, leitura, "Maria");
    expect(r.startsWith("Maria, as suas cartas chegaram.")).toBe(true);
    expect(r.indexOf("A Estrela")).toBeLessThan(r.indexOf("A Roda da Fortuna"));
    expect(r.indexOf("A Roda da Fortuna")).toBeLessThan(r.indexOf("O que as cartas dizem juntas. Junta tudo."));
    expect(r).toContain("Um passo para os próximos dias. Um passo pequeno.");
    expect(r).not.toMatch(/\*|✨/);
  });

  it("sem nome, começa sem nome", () => {
    expect(roteiroDaNarracao(cartas, leitura, "").startsWith("As suas cartas chegaram.")).toBe(true);
  });
});

describe("a voz do próprio servidor", () => {
  beforeEach(() => {
    h.env.VOZ_PROPRIA_BASE_URL = "https://voz.test/_ouvir/";
    h.env.VOZ_PROPRIA_API_KEY = "segredo";
    h.env.VOZ_PROPRIA_MODELO = "";
    h.env.VOZ_PROPRIA_VOZ = "";
  });

  it("chama a API de fala compatível com a da OpenAI, com a chave no cabeçalho e os padrões do Kokoro", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array(4000), { status: 200 }));
    const audio = await falarNaVozPropria("Olá", { fetchImpl: fetchImpl as unknown as typeof fetch, velocidade: 0.9 });
    expect(audio.length).toBe(4000);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://voz.test/_ouvir/v1/audio/speech");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "speaches-ai/Kokoro-82M-v1.0-ONNX",
      voice: "pf_dora",
      input: "Olá",
      response_format: "mp3",
      speed: 0.9,
    });
  });

  it("erro do serviço ou áudio vazio: lança, para quem chama seguir sem voz", async () => {
    const erro = vi.fn(async () => new Response("x", { status: 500 }));
    await expect(falarNaVozPropria("Olá", { fetchImpl: erro as unknown as typeof fetch })).rejects.toBeInstanceOf(VozPropriaIndisponivel);
    const vazio = vi.fn(async () => new Response(new Uint8Array(10), { status: 200 }));
    await expect(falarNaVozPropria("Olá", { fetchImpl: vazio as unknown as typeof fetch })).rejects.toBeInstanceOf(VozPropriaIndisponivel);
  });

  it("sem endereço: não há voz e nada é chamado", async () => {
    h.env.VOZ_PROPRIA_BASE_URL = "";
    expect(vozPropriaConfigurada()).toBe(false);
    const fetchImpl = vi.fn();
    await expect(falarNaVozPropria("Olá", { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(VozPropriaIndisponivel);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
