/**
 * PENTE FINO DE 10/10/2026 — três defeitos medidos em produção, cada um com o seu teste.
 *
 *   1. A leitura de clima falhava em 11% das chamadas: o raciocínio da DeepSeek, ligado por padrão,
 *      consumia o teto de saída e a nota não vinha.
 *   2. Resposta da IA no canal oficial virava falha por erro de rede passageiro, sem nova tentativa
 *      — e o envio não tinha teto de tempo.
 *   3. (no `session-reconciler.test.ts`) mensagem de atendente presa na fila de canal arquivado.
 */
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { comRaciocinioDesligado } from "@/lib/agent-engine/edge/llm/providers";
import { falhaAntesDeSair, recusaPassageiraDaMeta } from "@/lib/channels/adapters/meta-cloud";
import { comReserva, googleTranscriptionProvider, type TranscriptionProvider } from "@/lib/messaging/media/transcription";

describe("o caminho dos classificadores chama a DeepSeek SEM raciocínio", () => {
  it("o corpo do pedido sai com o raciocínio desligado nas duas formas que a DeepSeek lê", async () => {
    const interno = vi.fn(async () => new Response("{}"));
    await comRaciocinioDesligado(interno as unknown as typeof fetch)("https://api.deepseek.com/responses", {
      method: "POST",
      body: JSON.stringify({ model: "deepseek-flash", input: "oi" }),
    });
    const enviado = JSON.parse(String((interno.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(enviado.thinking).toEqual({ type: "disabled" });
    expect(enviado.reasoning).toEqual({ effort: "none" });
    expect(enviado.model).toBe("deepseek-flash");
  });

  it("⭐ a fiação: quem monta o modelo da DeepSeek para os classificadores usa esse fetch", () => {
    const fonte = readFileSync("lib/ai/gateway-binding.ts", "utf8");
    const caso = fonte.slice(fonte.indexOf('case "deepseek":'));
    expect(caso.slice(0, 400)).toContain("fetch: comRaciocinioDesligado(globalThis.fetch)");
  });
});

describe("envio do canal oficial: repetir só quando a mensagem comprovadamente não saiu", () => {
  const erroDeRede = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"])(
    "a conexão nem abriu (%s): pode repetir",
    (code) => {
      expect(falhaAntesDeSair(erroDeRede(code))).toBe(true);
    },
  );

  it.each(["ECONNRESET", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])(
    "⭐ a conexão caiu DEPOIS de o pedido ir (%s): NÃO repete — a Meta pode ter enviado",
    (code) => {
      expect(falhaAntesDeSair(erroDeRede(code))).toBe(false);
    },
  );

  it("erro sem causa conhecida, ou o teto de tempo, não repete", () => {
    expect(falhaAntesDeSair(new TypeError("fetch failed"))).toBe(false);
    expect(falhaAntesDeSair(new DOMException("The operation was aborted", "TimeoutError"))).toBe(false);
    expect(falhaAntesDeSair(null)).toBe(false);
  });

  it("recusa passageira da Meta repete; erro de parâmetro, janela ou política não", () => {
    for (const c of [2, 131000, 131016]) expect(recusaPassageiraDaMeta(c)).toBe(true);
    for (const c of [131009, 131047, 131026, 100, 190, undefined]) expect(recusaPassageiraDaMeta(c)).toBe(false);
  });
});

describe("o adapter em si: teto de tempo e as duas repetições", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function adapterComCredencial() {
    // O arquivo já importou o adapter lá em cima (os predicados): sem zerar, viria o módulo real.
    vi.resetModules();
    vi.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
    vi.doMock("@/lib/channels/meta/credentials", () => ({
      resolveMetaCreds: async () => ({ token: "t", phoneNumberId: "123", graphVersion: "v23.0" }),
    }));
    const { metaCloudAdapter } = await import("@/lib/channels/adapters/meta-cloud");
    return metaCloudAdapter;
  }
  const envelope = { organizationId: "o", sessionRef: "123", to: "5511999990000", body: "oi" } as never;

  it("⭐ recusa passageira: tenta de novo e entrega; o pedido leva teto de tempo", async () => {
    const adapter = await adapterComCredencial();
    const respostas = [
      new Response(JSON.stringify({ error: { code: 131000, message: "Something went wrong" } }), { status: 500 }),
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }),
    ];
    const rede = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respostas.shift()!);
    await expect(adapter.send(envelope)).resolves.toEqual({ externalId: "wamid.1" });
    expect(rede).toHaveBeenCalledTimes(2);
    expect((rede.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it("erro de parâmetro NÃO repete: falha na primeira, com o motivo", async () => {
    const adapter = await adapterComCredencial();
    const rede = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(JSON.stringify({ error: { code: 131009, message: "Parameter value is not valid" } }), { status: 400 }));
    await expect(adapter.send(envelope)).rejects.toThrow("meta_131009");
    expect(rede).toHaveBeenCalledTimes(1);
  });

  it("⭐ conexão que caiu depois de o pedido ir NÃO repete", async () => {
    const adapter = await adapterComCredencial();
    const rede = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Promise.reject(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })));
    await expect(adapter.send(envelope)).rejects.toThrow("fetch failed");
    expect(rede).toHaveBeenCalledTimes(1);
  });
});

describe("transcrição: a segunda reserva, quando as duas primeiras contas recusam", () => {
  const audio = Buffer.from("fala");
  const recusa = (codigo: string): TranscriptionProvider => ({
    transcribe: async () => {
      throw new Error(codigo);
    },
  });

  it("⭐ principal sem saldo e reserva recusando: o áudio é lido pela segunda reserva", async () => {
    const avisos: string[] = [];
    const cadeia = comReserva(
      comReserva(recusa("transcription_429:credit_balance_exhausted"), async () => recusa("transcription_401:reserva")),
      async () => ({ transcribe: async () => "oi, quero saber do trabalho" }),
      (motivo) => avisos.push(motivo),
    );
    await expect(cadeia.transcribe(audio, "audio/ogg")).resolves.toBe("oi, quero saber do trabalho");
    // O aviso carrega os dois códigos, na ordem: é o que diz ao dono quais contas regularizar.
    expect(avisos).toEqual(["transcription_429:credit_balance_exhausted (reserva: transcription_401:reserva)"]);
  });

  it("sem chave para a segunda reserva, sobe o erro das duas primeiras — começando pelo do principal", async () => {
    const cadeia = comReserva(
      comReserva(recusa("transcription_429:credit_balance_exhausted"), async () => recusa("transcription_401:reserva")),
      async () => null,
    );
    await expect(cadeia.transcribe(audio, "audio/ogg")).rejects.toThrow(/^transcription_429:credit_balance_exhausted \(reserva: transcription_401:reserva\)$/);
  });

  it("o pedido ao Google leva a chave no cabeçalho (nunca no endereço) e o áudio em base64", async () => {
    const rede = vi.fn(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: " bom dia " }, { text: "tudo bem?" }] } }] })),
    );
    const texto = await googleTranscriptionProvider({ apiKey: "CHAVE", model: "gemini-x" }, rede as unknown as typeof fetch).transcribe(
      audio,
      "audio/ogg; codecs=opus",
    );
    expect(texto).toBe("bom dia tudo bem?");
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(url).not.toContain("CHAVE");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("CHAVE");
    const corpo = JSON.parse(String(init.body));
    expect(corpo.contents[0].parts[1].inline_data).toEqual({ mime_type: "audio/ogg", data: audio.toString("base64") });
  });

  it("recusa do Google sai com o código da segunda reserva, e só o status", async () => {
    const rede = vi.fn(async () => new Response("{}", { status: 429 }));
    await expect(
      googleTranscriptionProvider({ apiKey: "CHAVE" }, rede as unknown as typeof fetch).transcribe(audio, "audio/ogg"),
    ).rejects.toThrow("transcription_429:reserva2");
  });
});
