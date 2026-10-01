import { describe, expect, it } from "vitest";

import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";
import { validateOutboundMedia, validateStickerUpload } from "./upload-validation";

/**
 * A validação de upload outbound — o teto REAL que a Meta aceita por tipo,
 * não mais um único cap de 50MB pra tudo. O que este teste prende:
 *   1. cada tipo tem seu próprio teto de bytes (imagem/vídeo/áudio bem abaixo
 *      dos 50MB do bucket — a Meta recusa antes disso);
 *   2. `audio/webm` continua aceito (é o formato que o browser grava, e é
 *      transcodificado ANTES do envio de verdade — ver voice-transcode.ts);
 *   3. formato fora do vocabulário fechado por tipo é recusado, mesmo se o
 *      prefixo geral (`image/`, `video/`) bater — não é mais wildcard.
 */
describe("validateOutboundMedia", () => {
  it("arquivo vazio é recusado antes de olhar o tipo", () => {
    const r = validateOutboundMedia("image/jpeg", 0);
    expect(r).toEqual({ ok: false, code: "validation_failed", message: "Arquivo vazio." });
  });

  it("imagem jpeg dentro do teto de 5MB: aceita", () => {
    const r = validateOutboundMedia("image/jpeg", 4 * 1024 * 1024);
    expect(r).toEqual({ ok: true, kind: "image" });
  });

  it("imagem acima de 5MB: recusa por tamanho, não por tipo", () => {
    const r = validateOutboundMedia("image/png", 6 * 1024 * 1024);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("payload_too_large");
  });

  it("formato de imagem fora do vocabulário fechado (webp) é recusado mesmo pequeno", () => {
    const r = validateOutboundMedia("image/webp", 1024);
    expect(r).toEqual({ ok: false, code: "unsupported_media_type", message: "Tipo de arquivo não suportado." });
  });

  it("figurinha: .webp até 500 KB passa pelo caminho PRÓPRIO, e só por ele", () => {
    expect(validateStickerUpload("image/webp", 200 * 1024)).toEqual({ ok: true, kind: "sticker" });
    // o caminho comum segue recusando o mesmo arquivo — webp como imagem a Meta recusa
    expect(validateOutboundMedia("image/webp", 200 * 1024).ok).toBe(false);
  });

  it("figurinha: outro formato, acima de 500 KB e arquivo vazio são recusados com o motivo", () => {
    const png = validateStickerUpload("image/png", 1024);
    expect(!png.ok && png.code).toBe("unsupported_media_type");
    const grande = validateStickerUpload("image/webp", 600 * 1024);
    expect(!grande.ok && grande.code).toBe("payload_too_large");
    const vazio = validateStickerUpload("image/webp", 0);
    expect(!vazio.ok && vazio.code).toBe("validation_failed");
  });

  it("vídeo mp4 dentro do teto de 16MB: aceita", () => {
    const r = validateOutboundMedia("video/mp4", 15 * 1024 * 1024);
    expect(r).toEqual({ ok: true, kind: "video" });
  });

  it("vídeo acima de 16MB: recusa por tamanho", () => {
    const r = validateOutboundMedia("video/mp4", 17 * 1024 * 1024);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("payload_too_large");
  });

  it("áudio ogg dentro do teto de 16MB: aceita", () => {
    const r = validateOutboundMedia("audio/ogg", 10 * 1024 * 1024);
    expect(r).toEqual({ ok: true, kind: "audio" });
  });

  it("audio/webm (gravação do browser, ANTES da transcodificação) continua aceito", () => {
    const r = validateOutboundMedia("audio/webm;codecs=opus", 2 * 1024 * 1024);
    expect(r).toEqual({ ok: true, kind: "audio" });
  });

  it("documento pdf dentro do teto do bucket: aceita", () => {
    const r = validateOutboundMedia("application/pdf", MAX_MEDIA_BYTES - 1);
    expect(r).toEqual({ ok: true, kind: "document" });
  });

  it("documento acima do teto do bucket (MAX_MEDIA_BYTES): recusa, mesmo a Meta aceitando mais", () => {
    const r = validateOutboundMedia("application/pdf", MAX_MEDIA_BYTES + 1);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("payload_too_large");
  });

  it("mime desconhecido é recusado", () => {
    const r = validateOutboundMedia("application/x-msdownload", 1024);
    expect(r).toEqual({ ok: false, code: "unsupported_media_type", message: "Tipo de arquivo não suportado." });
  });

  it("mime com parâmetro de charset ainda resolve a categoria certa", () => {
    const r = validateOutboundMedia("text/plain; charset=utf-8", 1024);
    expect(r).toEqual({ ok: true, kind: "document" });
  });
});
