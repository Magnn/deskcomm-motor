/**
 * A AGENTE FALA QUANDO A PESSOA FALOU — e nunca deixa a pessoa sem resposta.
 *
 * O que estes testes seguram é a fronteira entre "voz" e "texto":
 *  - a config só liga a voz quando é válida e está ligada (`lerVoiceReply`);
 *  - a nota é gravada NA PASTA DA CONVERSA, com nome estável (replay não duplica);
 *  - link vai como TEXTO, depois das notas — nunca lido em voz alta;
 *  - QUALQUER falha da síntese vira `{ ok: false }`, que o turno traduz em texto;
 *  - o envio para no primeiro desfecho que não seja de sucesso;
 *  - `media.kind: 'audio'` chega ao handler como `type: 'audio'`, e a foto do
 *    catálogo (sem `kind`) continua indo como imagem.
 */
import { describe, expect, it, vi } from "vitest";

import {
  enviarNotasDeVoz,
  inboundEhAudio,
  MAX_NOTAS_POR_RESPOSTA,
  nomeDaNota,
  prepararNotasDeVoz,
  separarLinks,
  type DependenciasDeNota,
  type NotaPreparada,
} from "@/lib/agent-engine/agent/nota-de-voz";
import { corpoDoEnvio } from "@/lib/agent-engine/edge/crm/send-message";
import { ErroDeVoz } from "@/lib/voz/erros";
import { MIME_DA_NOTA_DE_VOZ, voiceReplySchema, type VoiceReplyConfig } from "@/lib/voz/tipos";

const CONFIG: VoiceReplyConfig = voiceReplySchema.parse({
  enabled: true,
  provider: "elevenlabs",
  voice_id: "voz-esmeralda",
  max_chars_per_note: 200,
});

function dependencias(sobrescreve: Partial<DependenciasDeNota> = {}): DependenciasDeNota & {
  gravados: Array<{ caminho: string; mime: string }>;
  avisos: Array<{ msg: string; campos?: Record<string, unknown> }>;
} {
  const gravados: Array<{ caminho: string; mime: string }> = [];
  const avisos: Array<{ msg: string; campos?: Record<string, unknown> }> = [];
  return {
    resolverChave: async () => "chave-de-teste",
    sintetizar: async () => ({ buffer: Buffer.from("ogg"), mime: MIME_DA_NOTA_DE_VOZ }),
    guardar: async (caminho, _dados, mime) => {
      gravados.push({ caminho, mime });
      return true;
    },
    log: { warn: (msg, campos) => void avisos.push({ msg, campos }) },
    ...sobrescreve,
    gravados,
    avisos,
  };
}

const PEDIDO = { tenantId: "org-1", conversationId: "conv-1", config: CONFIG };

describe("separarLinks", () => {
  it("tira a URL da fala e a devolve à parte, sem pontuação colada", () => {
    const r = separarLinks("Aqui está o seu trabalho: https://pay.cakto.com.br/abc_123. Qualquer dúvida me chama.");
    expect(r.links).toEqual(["https://pay.cakto.com.br/abc_123"]);
    expect(r.fala).not.toContain("http");
  });

  it("mesma URL repetida vira um link só", () => {
    expect(separarLinks("https://a.com/x e de novo https://a.com/x").links).toEqual(["https://a.com/x"]);
  });
});

describe("prepararNotasDeVoz", () => {
  it("grava cada nota na pasta da conversa e devolve os links à parte", async () => {
    const d = dependencias();
    const r = await prepararNotasDeVoz(d, { ...PEDIDO, texto: "Vou te mandar o link agora. https://pay.cakto.com.br/x" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.links).toEqual(["https://pay.cakto.com.br/x"]);
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0]!.storagePath.startsWith("org-1/conv-1/voz-")).toBe(true);
    expect(r.notas[0]!.fala).not.toContain("http");
    expect(d.gravados[0]!.mime).toBe(MIME_DA_NOTA_DE_VOZ);
  });

  it("o caminho tem de ser da conversa — é o que o handler de mensagens exige", async () => {
    const d = dependencias();
    const r = await prepararNotasDeVoz(d, { ...PEDIDO, texto: "Oi, tudo bem?" });
    if (!r.ok) throw new Error("esperava ok");
    // `isMediaPathOwnedBy`: `${org}/${conversa}/`
    expect(r.notas[0]!.storagePath.startsWith("org-1/conv-1/")).toBe(true);
  });

  it("nome estável: mesmo texto e voz = mesmo arquivo; outra voz = outro arquivo", () => {
    expect(nomeDaNota(CONFIG, "oi")).toBe(nomeDaNota(CONFIG, "oi"));
    expect(nomeDaNota(CONFIG, "oi")).not.toBe(nomeDaNota(CONFIG, "tchau"));
    expect(nomeDaNota(CONFIG, "oi")).not.toBe(nomeDaNota({ ...CONFIG, voice_id: "outra" }, "oi"));
  });

  it("texto que passa do teto vira várias notas, cada uma dentro do limite", async () => {
    const frase = "Esta é uma frase de tamanho razoável para o teste. ";
    const d = dependencias();
    const r = await prepararNotasDeVoz(d, { ...PEDIDO, texto: frase.repeat(6).trim() });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.notas.length).toBeGreaterThan(1);
    expect(r.notas.every((n) => n.fala.length <= 200)).toBe(true);
  });

  it(`passou de ${MAX_NOTAS_POR_RESPOSTA} notas: sai como texto (nota demais cansa)`, async () => {
    const frase = "Esta é uma frase de tamanho razoável para o teste. ";
    const r = await prepararNotasDeVoz(dependencias(), { ...PEDIDO, texto: frase.repeat(40).trim() });
    expect(r).toEqual({ ok: false, motivo: "longo_demais" });
  });

  it("só link (ou só emoji): não há o que falar, sai como texto", async () => {
    const d = dependencias();
    expect(await prepararNotasDeVoz(d, { ...PEDIDO, texto: "https://pay.cakto.com.br/x" })).toEqual({ ok: false, motivo: "sem_fala" });
    expect(await prepararNotasDeVoz(d, { ...PEDIDO, texto: "🌙✨" })).toEqual({ ok: false, motivo: "sem_fala" });
    expect(d.gravados).toHaveLength(0);
  });

  it("sem chave do provedor: cai para texto e NÃO chama a síntese", async () => {
    const sintetizar = vi.fn();
    const r = await prepararNotasDeVoz(dependencias({ resolverChave: async () => null, sintetizar }), { ...PEDIDO, texto: "Oi" });
    expect(r).toEqual({ ok: false, motivo: "sem_chave" });
    expect(sintetizar).not.toHaveBeenCalled();
  });

  it.each(["limite_do_provedor", "chave_invalida", "provedor_fora_do_ar", "formato_invalido"] as const)(
    "falha da síntese (%s) vira texto, com o motivo no log e sem o texto da pessoa",
    async (codigo) => {
      const d = dependencias({
        sintetizar: async () => {
          throw new ErroDeVoz(codigo, 500, "trecho secreto que a pessoa ia ouvir");
        },
      });
      const r = await prepararNotasDeVoz(d, { ...PEDIDO, texto: "Oi, tudo bem?" });
      expect(r).toEqual({ ok: false, motivo: codigo });
      expect(JSON.stringify(d.avisos)).not.toContain("trecho secreto");
    },
  );

  it("erro que não é de voz também não derruba o turno", async () => {
    const r = await prepararNotasDeVoz(
      dependencias({
        sintetizar: async () => {
          throw new TypeError("bug nosso");
        },
      }),
      { ...PEDIDO, texto: "Oi" },
    );
    expect(r).toEqual({ ok: false, motivo: "erro_inesperado" });
  });

  it("storage que recusa gravar cai para texto", async () => {
    const r = await prepararNotasDeVoz(dependencias({ guardar: async () => false }), { ...PEDIDO, texto: "Oi, tudo bem?" });
    expect(r.ok).toBe(false);
  });
});

describe("enviarNotasDeVoz", () => {
  const notas: NotaPreparada[] = [
    { storagePath: "org/conv/voz-1.ogg", mime: MIME_DA_NOTA_DE_VOZ, fala: "primeira" },
    { storagePath: "org/conv/voz-2.ogg", mime: MIME_DA_NOTA_DE_VOZ, fala: "segunda" },
  ];
  type Desfecho = { kind: "sent" | "blocked" | "queued" };
  const sent: Desfecho = { kind: "sent" };

  it("manda as notas em ordem e os links por último, como texto", async () => {
    const ordem: string[] = [];
    const r = await enviarNotasDeVoz(
      { ok: true, notas, links: ["https://a.com/x"] },
      {
        enviarNota: async (n) => (ordem.push(`nota:${n.fala}`), sent),
        enviarTexto: async (t) => (ordem.push(`texto:${t}`), sent),
        sleep: async () => undefined,
        jitter: () => 0,
      },
    );
    expect(ordem).toEqual(["nota:primeira", "nota:segunda", "texto:https://a.com/x"]);
    expect(r).toBe(sent);
  });

  it("para no primeiro desfecho que não é sucesso: nem a próxima nota nem o link saem", async () => {
    // `blocked` (opt-out/is_blocked) é veto permanente. `queued` NÃO para: o canal segurou
    // a mensagem e vai reentregar, e o resto do turno segue — como em `sendInBubbles`.
    const segurada: Desfecho = { kind: "blocked" };
    const enviarNota = vi.fn(async (): Promise<Desfecho> => segurada);
    const enviarTexto = vi.fn(async (): Promise<Desfecho> => sent);
    const r = await enviarNotasDeVoz(
      { ok: true, notas, links: ["https://a.com/x"] },
      { enviarNota, enviarTexto, sleep: async () => undefined, jitter: () => 0 },
    );
    expect(enviarNota).toHaveBeenCalledTimes(1);
    expect(enviarTexto).not.toHaveBeenCalled();
    expect(r).toBe(segurada);
  });

  it("espera o jitter anti-banimento entre uma mensagem e outra", async () => {
    const sleep = vi.fn(async () => undefined);
    await enviarNotasDeVoz(
      { ok: true, notas, links: ["https://a.com/x"] },
      { enviarNota: async () => sent, enviarTexto: async () => sent, sleep, jitter: () => 1500 },
    );
    expect(sleep).toHaveBeenCalledTimes(2); // nota1→nota2 e nota2→link
    expect(sleep).toHaveBeenCalledWith(1500);
  });
});

describe("corpoDoEnvio com mídia", () => {
  const base = {
    tenantId: "org-1",
    leadId: "lead-1",
    jobId: "job-1",
    seq: 1,
    conversationId: "conv-1",
  };

  it("nota de voz vai como type 'audio', com a fala como legenda", () => {
    const corpo = corpoDoEnvio(
      { ...base, body: "o que a nota diz", media: { storagePath: "org-1/conv-1/voz-1.ogg", mime: MIME_DA_NOTA_DE_VOZ, kind: "audio" } },
      "chave",
    );
    expect(corpo).toMatchObject({ type: "audio", media_storage_path: "org-1/conv-1/voz-1.ogg", media_mime: MIME_DA_NOTA_DE_VOZ, body: "o que a nota diz" });
  });

  it("a foto do catálogo, que nunca declarou `kind`, continua indo como imagem", () => {
    const corpo = corpoDoEnvio(
      { ...base, body: "", media: { storagePath: "org-1/conv-1/catalogo-a.jpg", mime: "image/jpeg" } },
      "chave",
    );
    expect(corpo).toMatchObject({ type: "image" });
    expect(corpo).not.toHaveProperty("body");
  });

  it("texto puro segue como texto", () => {
    expect(corpoDoEnvio({ ...base, body: "oi" }, "chave")).toMatchObject({ type: "text", body: "oi" });
  });
});

describe("inboundEhAudio", () => {
  function banco(tipo: string | null) {
    const consultas: Array<{ sql: string; params: unknown[] }> = [];
    return {
      consultas,
      db: {
        query: async (sql: string, params: unknown[]) => {
          consultas.push({ sql, params });
          return { rows: tipo === null ? [] : [{ type: tipo }] };
        },
      },
    };
  }
  const ids = { tenantId: "org-1", conversationId: "conv-1", inboundMessageId: "msg-1" };

  it("áudio da pessoa liga o espelho; texto e imagem não", async () => {
    expect(await inboundEhAudio(banco("audio").db as never, ids)).toBe(true);
    expect(await inboundEhAudio(banco("text").db as never, ids)).toBe(false);
    expect(await inboundEhAudio(banco("image").db as never, ids)).toBe(false);
    expect(await inboundEhAudio(banco(null).db as never, ids)).toBe(false);
  });

  it("o recorte é org + conversa + id + inbound: mensagem NOSSA ou de outro tenant nunca liga a voz", async () => {
    const { db, consultas } = banco("audio");
    await inboundEhAudio(db as never, ids);
    const { sql, params } = consultas[0]!;
    expect(params).toEqual(["org-1", "conv-1", "msg-1"]);
    expect(sql).toMatch(/organization_id = \$1/);
    expect(sql).toMatch(/conversation_id = \$2/);
    expect(sql).toMatch(/direction = 'inbound'/);
  });

  it("falha de leitura vira false: na dúvida, texto", async () => {
    const quebrado = {
      query: async () => {
        throw new Error("banco fora");
      },
    };
    expect(await inboundEhAudio(quebrado as never, ids)).toBe(false);
  });
});
