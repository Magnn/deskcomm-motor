import { describe, expect, it } from "vitest";

import { validateOutboundMedia } from "@/lib/messaging/media/upload-validation";

/**
 * `image/webp` SAIU da lista de "suportados" de propósito (não é esquecimento
 * deste teste): a Meta não aceita webp como IMAGEM comum — o único uso real
 * dele no WhatsApp é figurinha (`sticker`, um `kind` de mensagem à parte, que
 * esta função nem trata). Aceitar webp aqui era exatamente o tipo de anexo que
 * a Meta recusaria no envio de verdade — ver o cabeçalho de
 * `lib/messaging/media/upload-validation.ts` para o resto do reajuste de
 * limite por tipo (a versão anterior deste teste também esperava o antigo
 * teto único de 50MB para QUALQUER tipo; hoje imagem/vídeo/áudio têm teto
 * bem menor — 51MB de imagem já estourava mesmo no limite antigo, então essa
 * asserção sobreviveu sem mudar).
 */
describe("validateOutboundMedia", () => {
  it("classifica mimes suportados no kind certo", () => {
    expect(validateOutboundMedia("image/jpeg", 1000)).toEqual({ ok: true, kind: "image" });
    expect(validateOutboundMedia("video/mp4", 1000)).toEqual({ ok: true, kind: "video" });
    expect(validateOutboundMedia("audio/ogg; codecs=opus", 1000)).toEqual({ ok: true, kind: "audio" });
    expect(validateOutboundMedia("audio/webm", 1000)).toEqual({ ok: true, kind: "audio" });
    expect(validateOutboundMedia("application/pdf", 1000)).toEqual({ ok: true, kind: "document" });
    expect(validateOutboundMedia("text/csv", 1000)).toEqual({ ok: true, kind: "document" });
  });
  it("rejeita image/webp — a Meta só aceita como figurinha, não como imagem comum", () => {
    const r = validateOutboundMedia("image/webp", 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported_media_type");
  });
  it("rejeita mime não suportado", () => {
    const r = validateOutboundMedia("application/x-msdownload", 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unsupported_media_type");
  });
  it("rejeita acima de 50MB", () => {
    const r = validateOutboundMedia("image/jpeg", 51 * 1024 * 1024);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });
  it("rejeita arquivo vazio", () => {
    const r = validateOutboundMedia("image/jpeg", 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("validation_failed");
  });
});
