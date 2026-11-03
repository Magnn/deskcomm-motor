/**
 * O chat da área como o WhatsApp: os balões a partir de `messages`, para onde a resposta vai e quando
 * sai o aviso "te respondi na sua área" (`lib/area-do-cliente/chat.ts`, `canal-da-resposta.ts`).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/channels/pos-entrada", () => ({ aplicarEfeitosPosEntrada: vi.fn() }));
vi.mock("@/lib/channels/marcar-conversa", () => ({ marcarConversaComMensagem: vi.fn() }));

import { MARCA_DO_AVISO, mensagensDoChat, previaDaArea, sessaoParaAArea, tipoDoArquivo, type LinhaDaMensagem } from "@/lib/area-do-cliente/chat";
import { AUSENTE_DEPOIS_DE_MS, deveAvisar, textoDoAviso, vaiParaAArea } from "@/lib/area-do-cliente/canal-da-resposta";

const linha = (p: Partial<LinhaDaMensagem> & { id: string; created_at: string }): LinhaDaMensagem => ({
  direction: "inbound",
  type: "text",
  body: null,
  media_storage_path: null,
  media_derived_text: null,
  status: "delivered",
  read_at: null,
  metadata: null,
  ...p,
});

describe("mensagensDoChat", () => {
  it("ordena do mais antigo, junta os dois canais e tira o aviso", () => {
    const r = mensagensDoChat([
      linha({ id: "3", created_at: "2026-11-02T10:02:00Z", direction: "outbound", body: "oi, querida" }),
      linha({ id: "1", created_at: "2026-11-02T10:00:00Z", body: "oi pelo zap" }),
      linha({ id: "2", created_at: "2026-11-02T10:01:00Z", body: "oi pela área", metadata: { origem: "area" } }),
      linha({ id: "4", created_at: "2026-11-02T10:03:00Z", direction: "outbound", body: "te respondi na área", metadata: { [MARCA_DO_AVISO]: true } }),
    ]);
    expect(r.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(r[0]!.de).toBe("voce");
    expect(r[2]!.de).toBe("empresa");
  });

  it("as dela ficam lidas quando a empresa respondeu depois; as da empresa, quando têm read_at", () => {
    const r = mensagensDoChat([
      linha({ id: "1", created_at: "2026-11-02T10:00:00Z", body: "a" }),
      linha({ id: "2", created_at: "2026-11-02T10:01:00Z", direction: "outbound", body: "b", read_at: "2026-11-02T10:05:00Z" }),
      linha({ id: "3", created_at: "2026-11-02T10:02:00Z", body: "c" }),
      linha({ id: "4", created_at: "2026-11-02T10:01:30Z", direction: "outbound", body: "d" }),
    ]);
    const status = Object.fromEntries(r.map((m) => [m.id, m.status]));
    expect(status).toEqual({ "1": "lida", "2": "lida", "4": "entregue", "3": "entregue" });
  });

  it("separa o código Pix do texto e mostra a mídia só com endereço assinado", () => {
    const codigo = "00020126580014br.gov.bcb.pix0136abcdef1234567890abcdef520400005303986";
    const r = mensagensDoChat(
      [
        linha({ id: "1", created_at: "2026-11-02T10:00:00Z", direction: "outbound", body: `Aqui o seu Pix:\n${codigo}` }),
        linha({ id: "2", created_at: "2026-11-02T10:01:00Z", type: "audio", media_storage_path: "o/c/a.webm", media_derived_text: "olá" }),
        linha({ id: "3", created_at: "2026-11-02T10:02:00Z", type: "image", media_storage_path: "o/c/b.jpg" }),
        linha({ id: "4", created_at: "2026-11-02T10:03:00Z", type: "reaction", body: "❤️" }),
      ],
      new Map([["2", "https://x/a"]]),
    );
    expect(r[0]).toMatchObject({ tipo: "pix", pix: codigo, texto: "Aqui o seu Pix:" });
    expect(r[1]).toMatchObject({ tipo: "audio", midia: "https://x/a", transcricao: "olá" });
    expect(r.map((m) => m.id)).toEqual(["1", "2"]);
  });
});

describe("para onde vai a resposta", () => {
  it("fica na área quando a última mensagem dela veio da área", () => {
    expect(vaiParaAArea({ metadata: { origem: "area" } }, undefined)).toBe(true);
    expect(vaiParaAArea({ metadata: null }, undefined)).toBe(false);
    expect(vaiParaAArea(null, undefined)).toBe(false);
  });
  it("o aviso e o envio forçado pelo canal sempre saem pelo canal", () => {
    expect(vaiParaAArea({ metadata: { origem: "area" } }, { [MARCA_DO_AVISO]: true })).toBe(false);
    expect(vaiParaAArea({ metadata: { origem: "area" } }, { entrega: "canal" })).toBe(false);
  });
});

describe("deveAvisar", () => {
  const agora = new Date("2026-11-02T12:00:00Z");
  const antes = (ms: number) => new Date(agora.getTime() - ms).toISOString();
  const base = { vistoEm: null, avisadoEm: null, ultimaEntradaEm: antes(60_000), ultimaEntradaPeloCanalEm: antes(60_000), canalExigeJanela: false };

  it("não avisa quem está olhando a área agora", () => {
    expect(deveAvisar({ ...base, vistoEm: antes(30_000) }, agora)).toBe(false);
    expect(deveAvisar({ ...base, vistoEm: antes(AUSENTE_DEPOIS_DE_MS + 1_000) }, agora)).toBe(true);
  });
  it("um aviso só até ela voltar à área", () => {
    expect(deveAvisar({ ...base, vistoEm: antes(3_600_000), avisadoEm: antes(600_000) }, agora)).toBe(false);
    expect(deveAvisar({ ...base, vistoEm: antes(300_000), avisadoEm: antes(600_000) }, agora)).toBe(true);
  });
  it("só para quem escreveu PELO CANAL nas últimas 24 horas, em qualquer canal", () => {
    expect(deveAvisar({ ...base, ultimaEntradaPeloCanalEm: antes(25 * 3_600_000) }, agora)).toBe(false);
    // Quem só conversa pela área (nunca escreveu pelo canal) não recebe aviso no WhatsApp.
    expect(deveAvisar({ ...base, ultimaEntradaPeloCanalEm: null }, agora)).toBe(false);
    expect(deveAvisar({ ...base, canalExigeJanela: true, ultimaEntradaPeloCanalEm: antes(25 * 3_600_000) }, agora)).toBe(false);
    expect(deveAvisar({ ...base, canalExigeJanela: true, ultimaEntradaPeloCanalEm: null }, agora)).toBe(false);
  });
});

describe("textos e arquivos", () => {
  it("o aviso usa o primeiro nome e quem responde", () => {
    expect(textoDoAviso("Maria Clara", "Cigana Esmeralda", "https://a/x")).toBe(
      "Maria, Cigana Esmeralda te respondeu na sua área 🌙 Toca aqui pra ver: https://a/x",
    );
    expect(textoDoAviso(null, null, "https://a/x")).toBe("A gente te respondeu na sua área 🌙 Toca aqui pra ver: https://a/x");
  });
  it("aceita áudio e foto; recusa o resto", () => {
    expect(tipoDoArquivo("audio/webm;codecs=opus")).toBe("audio");
    expect(tipoDoArquivo("audio/mp4")).toBe("audio");
    expect(tipoDoArquivo("image/jpeg")).toBe("image");
    expect(tipoDoArquivo("application/pdf")).toBeNull();
    expect(tipoDoArquivo("image/svg+xml")).toBeNull();
  });
  it("a prévia no Desk diz que veio pela área", () => {
    expect(previaDaArea({ tipo: "arquivo", bytes: new Uint8Array(1), mime: "audio/webm", legenda: null })).toContain("pela área");
  });
});

describe("chat aberto: onde nasce a conversa de quem nunca falou por canal nenhum", () => {
  const s = (id: string, status = "WORKING", archived_at: string | null = null) => ({ id, status, archived_at });
  const ag = (sid: string, priority: number, archived_at: string | null = null) => ({ priority, archived_at, version: { channel_session_id: sid } });

  it("no número do agente publicado de maior prioridade (o critério do despacho)", () => {
    expect(sessaoParaAArea([s("a"), s("b"), s("c")], [ag("a", 1), ag("b", 5)])).toBe("b");
    expect(sessaoParaAArea([s("a"), s("b")], [{ priority: 0, archived_at: null, version: [{ channel_session_id: "b" }] }])).toBe("b");
  });
  it("ignora número arquivado e agente arquivado; entre iguais, o ligado vem antes", () => {
    expect(sessaoParaAArea([s("a", "WORKING", "2026-11-01"), s("b")], [ag("a", 9), ag("b", 1)])).toBe("b");
    expect(sessaoParaAArea([s("a"), s("b")], [ag("a", 9, "2026-11-01"), ag("b", 1)])).toBe("b");
    expect(sessaoParaAArea([s("a", "STOPPED"), s("b", "WORKING")], [ag("a", 1), ag("b", 1)])).toBe("b");
  });
  it("sem agente, qualquer número ligado (a equipe responde pelo Desk); sem número, o chat fica fechado", () => {
    expect(sessaoParaAArea([s("a", "STOPPED"), s("b")], [])).toBe("b");
    expect(sessaoParaAArea([], [ag("a", 1)])).toBeNull();
    expect(sessaoParaAArea([s("a", "WORKING", "2026-11-01")], [])).toBeNull();
  });
});
