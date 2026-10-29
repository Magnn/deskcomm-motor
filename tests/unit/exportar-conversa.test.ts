/**
 * Exportar a conversa inteira (texto e página para PDF) — `lib/inbox/exportar-conversa.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  conteudoDaMensagem,
  nomeDoArquivo,
  paginaDaConversa,
  quemFalou,
  textoDaConversa,
  type MensagemDaExportacao,
} from "@/lib/inbox/exportar-conversa";

function msg(over: Partial<MensagemDaExportacao> = {}): MensagemDaExportacao {
  return {
    direction: "inbound",
    type: "text",
    body: "oi",
    media_derived_text: null,
    sent_via: null,
    sent_at: "2026-10-29T15:05:00Z",
    revoked_at: null,
    ...over,
  };
}

const base = { cliente: "Ana Souza", telefone: "+55 69 98108-7336", fuso: "America/Porto_Velho", geradoEm: new Date("2026-10-29T18:00:00Z") };

describe("textoDaConversa", () => {
  it("⭐ uma linha por mensagem, no fuso da org, com quem falou", () => {
    const txt = textoDaConversa({
      ...base,
      mensagens: [msg(), msg({ direction: "outbound", sent_via: "ai", body: "Olá, Ana!", sent_at: "2026-10-29T15:06:00Z" })],
    });
    expect(txt).toContain("Conversa com Ana Souza (+55 69 98108-7336)");
    expect(txt).toContain("2 mensagens");
    expect(txt).toContain("[29/10/2026 11:05] Ana Souza: oi");
    expect(txt).toContain("[29/10/2026 11:06] Atendente (IA): Olá, Ana!");
  });
});

describe("conteudoDaMensagem", () => {
  it("áudio leva rótulo e transcrição; foto leva rótulo e legenda; apagada não mostra o texto", () => {
    expect(conteudoDaMensagem(msg({ type: "audio", body: null, media_derived_text: "quero saber dele" }))).toBe(
      "[áudio] (transcrição: quero saber dele)",
    );
    expect(conteudoDaMensagem(msg({ type: "image", body: "minha foto" }))).toBe("[foto] minha foto");
    expect(conteudoDaMensagem(msg({ body: "segredo", revoked_at: "2026-10-29T15:07:00Z" }))).toBe("(mensagem apagada)");
    expect(conteudoDaMensagem(msg({ body: "  " }))).toBe("(sem texto)");
  });
});

describe("quemFalou", () => {
  it("separa cliente, IA, equipe e automação", () => {
    expect(quemFalou({ direction: "inbound", sent_via: null }, "Ana")).toBe("Ana");
    expect(quemFalou({ direction: "outbound", sent_via: "user" }, "Ana")).toBe("Equipe");
    expect(quemFalou({ direction: "outbound", sent_via: "automation" }, "Ana")).toBe("Automação");
    expect(quemFalou({ direction: "outbound", sent_via: "external_device" }, "Ana")).toBe("Equipe (celular)");
  });
});

describe("paginaDaConversa", () => {
  it("⭐ texto do cliente é escapado (não vira HTML) e a foto entra só por https", () => {
    const html = paginaDaConversa({
      ...base,
      mensagens: [
        msg({ body: '<script>alert(1)</script>' }),
        msg({ type: "image", body: null, imagemUrl: "https://x.supabase.co/a.jpg?token=1" }),
        msg({ type: "image", body: null, imagemUrl: "javascript:alert(1)" }),
      ],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('<img src="https://x.supabase.co/a.jpg?token=1"');
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain("Salvar como PDF");
    expect(html).toContain('<div class="dia">29/10/2026</div>');
  });
});

describe("nomeDoArquivo", () => {
  it("sem acento nem símbolo", () => {
    expect(nomeDoArquivo("Conceição 💜 Lima", new Date("2026-10-29T18:00:00Z"), "txt")).toBe("conversa-conceicao-lima-2026-10-29.txt");
    expect(nomeDoArquivo("😍", new Date("2026-10-29T18:00:00Z"), "txt")).toBe("conversa-cliente-2026-10-29.txt");
  });
});
