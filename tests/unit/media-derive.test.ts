import { describe, expect, it, vi } from "vitest";

import { PdfExtractError } from "@/lib/ai/rag/extractors/pdf";
import { deriveMediaText, type DeriveDeps } from "@/lib/messaging/media/derive";

function deps(over: Partial<DeriveDeps> = {}): DeriveDeps {
  return {
    transcriber: { transcribe: vi.fn(async () => "transcrição do áudio") },
    describeImage: vi.fn(async () => "uma foto de um tênis vermelho"),
    extractPdf: vi.fn(async () => "conteúdo do pdf"),
    ...over,
  };
}

describe("deriveMediaText", () => {
  it("audio → transcrição", async () => {
    expect(await deriveMediaText("audio", Buffer.from([1]), "audio/ogg", deps())).toBe(
      "transcrição do áudio",
    );
  });
  it("document pdf → texto extraído", async () => {
    expect(
      await deriveMediaText("document", Buffer.from([1]), "application/pdf", deps()),
    ).toBe("conteúdo do pdf");
  });
  it("⭐ PDF só de imagem (comprovante escaneado) vai para a visão — 11/11/2026", async () => {
    const describeImage = vi.fn(async () => "Comprovante Pix R$ 130,00");
    const extractPdf = vi.fn(async () => {
      throw new PdfExtractError("pdfjs-dist extracted no text (possibly image-only PDF)", undefined, "sem_texto");
    });
    expect(await deriveMediaText("document", Buffer.from([1]), "application/pdf", deps({ extractPdf, describeImage }))).toBe("Comprovante Pix R$ 130,00");
    expect(describeImage).toHaveBeenCalledWith(expect.any(Buffer), "application/pdf");
  });
  it("PDF que falhou por outro motivo não vai para a visão", async () => {
    const describeImage = vi.fn(async () => "x");
    const extractPdf = vi.fn(async () => {
      throw new PdfExtractError("corrompido");
    });
    await expect(deriveMediaText("document", Buffer.from([1]), "application/pdf", deps({ extractPdf, describeImage }))).rejects.toThrow("corrompido");
    expect(describeImage).not.toHaveBeenCalled();
  });
  it("image → descrição por visão", async () => {
    expect(await deriveMediaText("image", Buffer.from([1]), "image/jpeg", deps())).toBe(
      "uma foto de um tênis vermelho",
    );
  });
  it("document NÃO-pdf → vazio (sem extrator)", async () => {
    expect(await deriveMediaText("document", Buffer.from([1]), "text/csv", deps())).toBe("");
  });
  it("tipo sem derivação (sticker/video) → vazio", async () => {
    expect(await deriveMediaText("sticker", Buffer.from([1]), "image/webp", deps())).toBe("");
    expect(await deriveMediaText("video", Buffer.from([1]), "video/mp4", deps())).toBe("");
  });
  it("trunca derivado gigante a 8000 chars", async () => {
    const huge = "a".repeat(20000);
    const out = await deriveMediaText("document", Buffer.from([1]), "application/pdf", deps({
      extractPdf: vi.fn(async () => huge),
    }));
    expect(out.length).toBe(8000);
  });
});
