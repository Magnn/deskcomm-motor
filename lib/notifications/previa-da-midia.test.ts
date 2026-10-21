import { describe, expect, it } from "vitest";

import { previaDaMidia } from "./previa-da-midia";

describe("notificação de mídia como no WhatsApp", () => {
  it("diz o tipo, com legenda quando há", () => {
    expect(previaDaMidia({ tipo: "audio", mime: "audio/ogg" })).toBe("🎤 Áudio");
    expect(previaDaMidia({ tipo: "image", legenda: "olha aqui" })).toBe("📷 Foto: olha aqui");
    expect(previaDaMidia({ tipo: "document", mime: "application/pdf" })).toBe("📄 PDF");
    expect(previaDaMidia({ tipo: "video", mime: "application/mp4" })).toBe("🎥 Vídeo");
    expect(previaDaMidia({ tipo: "sticker" })).toBe("Figurinha");
    expect(previaDaMidia({ tipo: "reaction", legenda: "❤️" })).toBe("Reagiu com ❤️");
  });

  it("foto ou documento depois de um Pix enviado vira possível comprovante; áudio nunca", () => {
    expect(previaDaMidia({ tipo: "image", aguardandoPagamento: true })).toBe("🧾 Possível comprovante · 📷 Foto");
    expect(previaDaMidia({ tipo: "document", mime: "application/pdf", aguardandoPagamento: true })).toBe("🧾 Possível comprovante · 📄 PDF");
    expect(previaDaMidia({ tipo: "audio", aguardandoPagamento: true })).toBe("🎤 Áudio");
  });
});
