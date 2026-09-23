/**
 * A VOZ FALA COM OS DOIS PROVEDORES — o que vai na chamada e o que volta.
 *
 * Nenhum destes testes toca a rede: `fetch` é dublado e devolve o que a
 * documentação do provedor descreve. O que eles fixam é o que ESTE código
 * decide — o formato pedido, quais campos vão a qual modelo, o plano B quando o
 * Opus é recusado e o vocabulário de erro. Que a API real da ElevenLabs aceite
 * `opus_48000_32` só se prova com chave; por isso o plano B tem teste próprio.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const converterParaNotaDeVoz = vi.fn();
vi.mock("@/lib/voz/converter", () => ({
  converterParaNotaDeVoz: (...args: unknown[]) => converterParaNotaDeVoz(...args),
}));

import { ErroDeVoz } from "@/lib/voz/erros";
import { ehOggOpus } from "@/lib/voz/ogg";
import { corpoDaSinteseOpenAi, openaiVoz } from "@/lib/voz/provedores/openai";
import { corpoDaSinteseElevenLabs, elevenlabsVoz, generoDaElevenLabs, vozDaApi } from "@/lib/voz/provedores/elevenlabs";
import { dividirEmNotas, textoParaFala } from "@/lib/voz/sintetizar";
import { MIME_DA_NOTA_DE_VOZ, lerVoiceReply } from "@/lib/voz/tipos";

/** Um Ogg/Opus mínimo: assinatura `OggS` + `OpusHead` nos primeiros bytes. */
function oggOpus(): Buffer {
  const b = Buffer.alloc(64);
  b.write("OggS", 0, "latin1");
  b.write("OpusHead", 28, "latin1");
  return b;
}

const fetchDublado = vi.fn();

function resposta(corpo: Buffer | string | object, status = 200): Response {
  const bytes = Buffer.isBuffer(corpo) ? corpo : Buffer.from(typeof corpo === "string" ? corpo : JSON.stringify(corpo));
  return new Response(new Uint8Array(bytes), { status });
}

beforeEach(() => {
  fetchDublado.mockReset();
  converterParaNotaDeVoz.mockReset();
  vi.stubGlobal("fetch", fetchDublado);
});
afterEach(() => vi.unstubAllGlobals());

describe("ehOggOpus", () => {
  it("reconhece Ogg/Opus e recusa o resto", () => {
    expect(ehOggOpus(oggOpus())).toBe(true);
    expect(ehOggOpus(Buffer.from("ID3".padEnd(64, "\0")))).toBe(false); // mp3
    expect(ehOggOpus(Buffer.alloc(10))).toBe(false); // curto demais
    const ogg = Buffer.alloc(64);
    ogg.write("OggS", 0, "latin1");
    expect(ehOggOpus(ogg), "Ogg sem OpusHead é Vorbis, e o WhatsApp não aceita").toBe(false);
  });
});

describe("OpenAI", () => {
  it("pede opus para a nota de voz e mp3 para a pré-escuta", () => {
    const base = { apiKey: "k", vozId: "coral", texto: "oi" };
    expect(corpoDaSinteseOpenAi({ ...base, formato: "nota_de_voz" }).response_format).toBe("opus");
    expect(corpoDaSinteseOpenAi({ ...base, formato: "previa" }).response_format).toBe("mp3");
  });

  it("`instructions` só vai ao modelo gpt-4o e `speed` só ao que NÃO é gpt-4o", () => {
    const base = { apiKey: "k", vozId: "coral", texto: "oi", formato: "nota_de_voz" as const };
    const novo = corpoDaSinteseOpenAi({ ...base, ajustes: { style_instructions: "calma", speed: 1.1 } });
    expect(novo.model).toBe("gpt-4o-mini-tts");
    expect(novo.instructions).toBe("calma");
    expect(novo).not.toHaveProperty("speed");

    const antigo = corpoDaSinteseOpenAi({ ...base, ajustes: { model: "tts-1", style_instructions: "calma", speed: 1.1 } });
    expect(antigo.speed).toBe(1.1);
    expect(antigo).not.toHaveProperty("instructions");
  });

  it("corta a entrada no teto da API", () => {
    const corpo = corpoDaSinteseOpenAi({ apiKey: "k", vozId: "coral", texto: "a".repeat(5000), formato: "nota_de_voz" });
    expect((corpo.input as string).length).toBe(4096);
  });

  it("devolve a nota de voz quando a resposta é Ogg/Opus", async () => {
    fetchDublado.mockResolvedValue(resposta(oggOpus()));
    const audio = await openaiVoz.sintetizar({ apiKey: "k", vozId: "coral", texto: "oi", formato: "nota_de_voz" });
    expect(audio.mime).toBe(MIME_DA_NOTA_DE_VOZ);
    const [url, init] = fetchDublado.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(init.headers.Authorization).toBe("Bearer k");
  });

  it("recusa áudio que não é Ogg/Opus — a Meta só reclamaria depois de aceitar o envio", async () => {
    fetchDublado.mockResolvedValue(resposta(Buffer.from("ID3".padEnd(64, "\0"))));
    await expect(
      openaiVoz.sintetizar({ apiKey: "k", vozId: "coral", texto: "oi", formato: "nota_de_voz" }),
    ).rejects.toMatchObject({ codigo: "formato_invalido" });
  });

  it.each([
    [401, "chave_invalida"],
    [429, "limite_do_provedor"],
    [404, "voz_inexistente"],
    [503, "provedor_fora_do_ar"],
  ])("HTTP %i vira %s", async (status, codigo) => {
    fetchDublado.mockResolvedValue(resposta({ error: { message: "x" } }, status));
    await expect(
      openaiVoz.sintetizar({ apiKey: "k", vozId: "coral", texto: "oi", formato: "nota_de_voz" }),
    ).rejects.toMatchObject({ codigo });
  });

  it("rede caída vira provedor_fora_do_ar, sem vazar a mensagem crua", async () => {
    fetchDublado.mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.openai.com"));
    const erro = await openaiVoz
      .sintetizar({ apiKey: "k", vozId: "coral", texto: "oi", formato: "nota_de_voz" })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeVoz);
    expect((erro as ErroDeVoz).message).not.toContain("ENOTFOUND");
  });

  it("lista o catálogo fixo, com feminina e masculina", async () => {
    const vozes = await openaiVoz.listarVozes("k");
    expect(vozes.some((v) => v.genero === "feminina")).toBe(true);
    expect(vozes.some((v) => v.genero === "masculina")).toBe(true);
    expect(vozes.every((v) => v.provedor === "openai" && v.categoria === "pronta")).toBe(true);
  });
});

describe("ElevenLabs", () => {
  it("traduz gênero e categoria da API para o vocabulário da tela", () => {
    expect(generoDaElevenLabs("female")).toBe("feminina");
    expect(generoDaElevenLabs("male")).toBe("masculina");
    expect(generoDaElevenLabs(undefined)).toBe("neutra");
    const v = vozDaApi({
      voice_id: "abc",
      name: "Minha voz",
      category: "cloned",
      labels: { gender: "female" },
      preview_url: "https://x/p.mp3",
    });
    expect(v).toMatchObject({ provedor: "elevenlabs", id: "abc", genero: "feminina", categoria: "clonada" });
    expect(vozDaApi({ voice_id: "z", name: "Rachel", category: "premade" }).categoria).toBe("pronta");
  });

  it("só manda no voice_settings o que foi configurado", () => {
    const corpo = corpoDaSinteseElevenLabs({
      apiKey: "k",
      vozId: "v",
      texto: "oi",
      formato: "nota_de_voz",
      ajustes: { stability: 0.4 },
    });
    expect(corpo.model_id).toBe("eleven_multilingual_v2");
    expect(corpo.voice_settings).toEqual({ stability: 0.4, use_speaker_boost: true });
  });

  it("lista as vozes da conta", async () => {
    fetchDublado.mockResolvedValue(
      resposta({ voices: [{ voice_id: "a", name: "A", category: "premade", labels: { gender: "male" } }, { name: "sem id" }] }),
    );
    const vozes = await elevenlabsVoz.listarVozes("k");
    expect(vozes).toHaveLength(1);
    expect(vozes[0]).toMatchObject({ id: "a", genero: "masculina" });
    expect((fetchDublado.mock.calls[0] as [string, { headers: Record<string, string> }])[1].headers["xi-api-key"]).toBe("k");
  });

  it("pede Opus direto e devolve sem converter", async () => {
    fetchDublado.mockResolvedValue(resposta(oggOpus()));
    const audio = await elevenlabsVoz.sintetizar({ apiKey: "k", vozId: "voz 1", texto: "oi", formato: "nota_de_voz" });
    expect(audio.mime).toBe(MIME_DA_NOTA_DE_VOZ);
    const url = (fetchDublado.mock.calls[0] as [string])[0];
    expect(url).toContain("/text-to-speech/voz%201?output_format=opus_48000_32");
    expect(converterParaNotaDeVoz).not.toHaveBeenCalled();
  });

  it("PLANO B: se o Opus é recusado (422), pede mp3 e converte", async () => {
    fetchDublado.mockResolvedValueOnce(resposta({ detail: "output format not available" }, 422));
    fetchDublado.mockResolvedValueOnce(resposta(Buffer.from("ID3-mp3")));
    converterParaNotaDeVoz.mockResolvedValue({ buffer: oggOpus(), mime: MIME_DA_NOTA_DE_VOZ });

    const audio = await elevenlabsVoz.sintetizar({ apiKey: "k", vozId: "v", texto: "oi", formato: "nota_de_voz" });

    expect(audio.mime).toBe(MIME_DA_NOTA_DE_VOZ);
    expect((fetchDublado.mock.calls[1] as [string])[0]).toContain("output_format=mp3_44100_128");
    expect(converterParaNotaDeVoz).toHaveBeenCalledTimes(1);
  });

  it("o plano B NÃO roda para erro que ele não resolve (chave, cota, voz)", async () => {
    fetchDublado.mockResolvedValue(resposta({ detail: "invalid api key" }, 401));
    await expect(
      elevenlabsVoz.sintetizar({ apiKey: "k", vozId: "v", texto: "oi", formato: "nota_de_voz" }),
    ).rejects.toMatchObject({ codigo: "chave_invalida" });
    expect(fetchDublado).toHaveBeenCalledTimes(1);
  });

  it("200 com áudio que não é Ogg/Opus também cai no conversor", async () => {
    fetchDublado.mockResolvedValue(resposta(Buffer.from("ID3-mp3")));
    converterParaNotaDeVoz.mockResolvedValue({ buffer: oggOpus(), mime: MIME_DA_NOTA_DE_VOZ });
    await elevenlabsVoz.sintetizar({ apiKey: "k", vozId: "v", texto: "oi", formato: "nota_de_voz" });
    expect(converterParaNotaDeVoz).toHaveBeenCalledTimes(1);
  });

  it("a pré-escuta é mp3 (todo navegador toca) e não passa pelo conversor", async () => {
    fetchDublado.mockResolvedValue(resposta(Buffer.from("ID3-mp3")));
    const audio = await elevenlabsVoz.sintetizar({ apiKey: "k", vozId: "v", texto: "oi", formato: "previa" });
    expect(audio.mime).toBe("audio/mpeg");
    expect((fetchDublado.mock.calls[0] as [string])[0]).toContain("output_format=mp3_44100_64");
  });

  describe("clonar", () => {
    const amostra = { nome: "a.mp3", tipo: "audio/mpeg", dados: new Uint8Array([1, 2, 3]) };

    it("envia multipart com nome, gênero e as amostras, e devolve a voz clonada", async () => {
      fetchDublado.mockResolvedValue(resposta({ voice_id: "nova-voz" }));
      const voz = await elevenlabsVoz.clonar!({ apiKey: "k", nome: "Esmeralda", genero: "feminina", amostras: [amostra, amostra] });

      expect(voz).toMatchObject({ id: "nova-voz", nome: "Esmeralda", genero: "feminina", categoria: "clonada" });
      const [url, init] = fetchDublado.mock.calls[0] as [string, { body: FormData; method: string }];
      expect(url).toBe("https://api.elevenlabs.io/v1/voices/add");
      expect(init.method).toBe("POST");
      expect(init.body.get("name")).toBe("Esmeralda");
      expect(JSON.parse(init.body.get("labels") as string)).toMatchObject({ gender: "female" });
      expect(init.body.getAll("files")).toHaveLength(2);
    });

    it("plano sem clonagem vira sem_permissao_de_clonagem", async () => {
      fetchDublado.mockResolvedValue(resposta({ detail: { status: "can_not_use_instant_voice_cloning" } }, 400));
      await expect(
        elevenlabsVoz.clonar!({ apiKey: "k", nome: "Esmeralda", genero: "feminina", amostras: [amostra] }),
      ).rejects.toMatchObject({ codigo: "sem_permissao_de_clonagem" });
    });

    it("gravação recusada vira amostra_invalida", async () => {
      fetchDublado.mockResolvedValue(resposta({ detail: "audio too short" }, 400));
      await expect(
        elevenlabsVoz.clonar!({ apiKey: "k", nome: "Esmeralda", genero: "feminina", amostras: [amostra] }),
      ).rejects.toMatchObject({ codigo: "amostra_invalida" });
    });

    it("sem amostra nem chama o provedor", async () => {
      await expect(
        elevenlabsVoz.clonar!({ apiKey: "k", nome: "Esmeralda", genero: "feminina", amostras: [] }),
      ).rejects.toMatchObject({ codigo: "amostra_invalida" });
      expect(fetchDublado).not.toHaveBeenCalled();
    });
  });

  it("apagar trata 404 como sucesso: a voz já não existe", async () => {
    fetchDublado.mockResolvedValue(resposta({}, 404));
    await expect(elevenlabsVoz.apagarVoz!("k", "x")).resolves.toBeUndefined();
    fetchDublado.mockResolvedValue(resposta({}, 401));
    await expect(elevenlabsVoz.apagarVoz!("k", "x")).rejects.toMatchObject({ codigo: "chave_invalida" });
  });
});

describe("texto para fala", () => {
  it("tira emoji, marcação do WhatsApp e link", () => {
    expect(textoParaFala("Oi *Carla* 🌙 veja https://pay.cakto.com.br/abc agora")).toBe("Oi Carla veja agora");
  });

  it("quebra de linha vira pausa", () => {
    expect(textoParaFala("Primeira.\n\nSegunda")).toBe("Primeira. Segunda");
  });
});

describe("dividir em notas", () => {
  it("texto curto = uma nota", () => {
    expect(dividirEmNotas("Oi, tudo bem?", 700)).toEqual(["Oi, tudo bem?"]);
  });

  it("corta em fim de frase, nunca no meio, e nenhuma nota passa do teto", () => {
    const frase = "Esta é uma frase de tamanho razoável para o teste. ";
    const notas = dividirEmNotas(frase.repeat(10).trim(), 120);
    expect(notas.length).toBeGreaterThan(1);
    for (const n of notas) {
      expect(n.length).toBeLessThanOrEqual(120);
      expect(n.endsWith(".")).toBe(true);
    }
  });

  it("palavra gigante não trava nem devolve nota vazia", () => {
    const notas = dividirEmNotas("a".repeat(500), 100);
    expect(notas.every((n) => n.length > 0 && n.length <= 100)).toBe(true);
    expect(notas.join("")).toBe("a".repeat(500));
  });

  it("vazio = nenhuma nota", () => {
    expect(dividirEmNotas("   ", 100)).toEqual([]);
  });
});

describe("lerVoiceReply", () => {
  const ligada = { enabled: true, provider: "openai", voice_id: "coral" };

  it("config válida e ligada vira o objeto com defaults", () => {
    expect(lerVoiceReply({ voice_reply: ligada })).toMatchObject({ mode: "mirror", max_chars_per_note: 700, voice_id: "coral" });
  });

  it("desligada, ausente ou com shape estranho = null, nunca lança", () => {
    expect(lerVoiceReply({ voice_reply: { ...ligada, enabled: false } })).toBeNull();
    expect(lerVoiceReply({})).toBeNull();
    expect(lerVoiceReply(null)).toBeNull();
    expect(lerVoiceReply({ voice_reply: { enabled: true, provider: "google", voice_id: "x" } })).toBeNull();
    expect(lerVoiceReply({ voice_reply: "lixo" })).toBeNull();
  });
});
