import { describe, it, expect } from "vitest";
import {
  exportFlowToTemplate,
  importFlowTemplate,
  flowTemplatePackageSchema,
} from "@/lib/followup/export-import";
import {
  filterMediaLibrary,
  formatMediaSize,
  detectMediaType,
  mediaItemSchema,
} from "@/lib/media/library";
import { DEFAULT_FLOW_FOLDERS, flowFolderSchema } from "@/lib/followup/folders";

describe("Engajamento - Exportação e Importação de Fluxos", () => {
  it("exporta fluxo completo para pacote de modelo válido", () => {
    const pkg = exportFlowToTemplate({
      name: "Fluxo de Qualificação",
      description: "Qualifica leads pelo WhatsApp",
      category: "Vendas",
      tags: ["lead", "vendas"],
      nodes: [
        { id: "n1", type: "message", position: { x: 0, y: 0 }, data: { text: "Olá!" } },
        { id: "n2", type: "condition", position: { x: 0, y: 100 }, data: {} },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", sourceHandle: null, targetHandle: null },
      ],
      triggers: [
        { type: "contact_created", config: {} },
      ],
    });

    expect(pkg.schemaVersion).toBe("1.0");
    expect(pkg.name).toBe("Fluxo de Qualificação");
    expect(pkg.nodes.length).toBe(2);
    expect(pkg.edges.length).toBe(1);
    expect(flowTemplatePackageSchema.safeParse(pkg).success).toBe(true);
  });

  it("importa modelo regenerando IDs únicos e mantendo conexões intactas", () => {
    const originalPkg = {
      schemaVersion: "1.0",
      name: "Template Importado",
      description: "Exemplo para teste",
      nodes: [
        { id: "origin_a", type: "message", position: { x: 10, y: 10 }, data: { msg: "A" } },
        { id: "origin_b", type: "message", position: { x: 20, y: 20 }, data: { msg: "B" } },
      ],
      edges: [
        { id: "edge_orig", source: "origin_a", target: "origin_b" },
      ],
      triggers: [],
    };

    let counter = 1;
    const testIdGen = () => `new_id_${counter++}`;

    const imported = importFlowTemplate(originalPkg, testIdGen);

    expect(imported.name).toBe("Template Importado");
    expect(imported.nodes[0]!.id).toBe("new_id_1");
    expect(imported.nodes[1]!.id).toBe("new_id_2");
    // As arestas devem apontar para os novos nós!
    expect(imported.edges[0]!.source).toBe("new_id_1");
    expect(imported.edges[0]!.target).toBe("new_id_2");
  });
});

describe("Engajamento - Biblioteca de Mídias", () => {
  it("detecta MIME types com precisão", () => {
    expect(detectMediaType("image/png")).toBe("image");
    expect(detectMediaType("audio/ogg")).toBe("audio");
    expect(detectMediaType("video/mp4")).toBe("video");
    expect(detectMediaType("application/pdf")).toBe("document");
  });

  it("formata tamanho de arquivo em bytes legíveis", () => {
    expect(formatMediaSize(0)).toBe("0 B");
    expect(formatMediaSize(1024)).toBe("1 KB");
    expect(formatMediaSize(2500000)).toBe("2.4 MB");
  });

  it("filtra itens por tipo e busca textual", () => {
    const items = [
      mediaItemSchema.parse({
        id: "1",
        name: "foto-produto.jpg",
        type: "image",
        url: "https://example.com/p.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        folder: "vendas",
        tags: ["destaque"],
      }),
      mediaItemSchema.parse({
        id: "2",
        name: "contrato.pdf",
        type: "document",
        url: "https://example.com/c.pdf",
        mimeType: "application/pdf",
        sizeBytes: 5000,
        folder: "financeiro",
        tags: ["termos"],
      }),
    ];

    const imagesOnly = filterMediaLibrary(items, { type: "image" });
    expect(imagesOnly.length).toBe(1);
    expect(imagesOnly[0]!.name).toBe("foto-produto.jpg");

    const searchMatch = filterMediaLibrary(items, { search: "termos" });
    expect(searchMatch.length).toBe(1);
    expect(searchMatch[0]!.name).toBe("contrato.pdf");
  });
});

describe("Engajamento - Pastas de Fluxos", () => {
  it("valida pastas padrões do sistema", () => {
    expect(DEFAULT_FLOW_FOLDERS.length).toBeGreaterThanOrEqual(4);
    for (const folder of DEFAULT_FLOW_FOLDERS) {
      expect(flowFolderSchema.safeParse(folder).success).toBe(true);
    }
  });
});
