import { describe, expect, it, vi, beforeEach } from "vitest";
import { ExternalMcpClient } from "@/lib/mcp/external-client";

describe("ExternalMcpClient (ChatbotX MCP Parity)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("recusa URLs que não começam com http:// ou https://", () => {
    expect(() => new ExternalMcpClient({ url: "ftp://servidor.com" })).toThrow();
    expect(() => new ExternalMcpClient({ url: "" })).toThrow();
  });

  it("monta cabeçalhos de autenticação Bearer e Header customizado", async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [] },
        }),
      } as Response;
    });

    const clientBearer = new ExternalMcpClient({
      url: "https://mcp.exemplo.com",
      authType: "bearer",
      token: "meu_token_123",
    });
    await clientBearer.listTools();
    expect(capturedHeaders.Authorization).toBe("Bearer meu_token_123");

    const clientHeader = new ExternalMcpClient({
      url: "https://mcp.exemplo.com",
      authType: "header",
      headerName: "X-API-Key",
      headerValue: "chave_secreta",
    });
    await clientHeader.listTools();
    expect(capturedHeaders["X-API-Key"]).toBe("chave_secreta");
  });

  it("descobre ferramentas e valida schema via listTools", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            tools: [
              {
                name: "consultar_saldo",
                description: "Consulta saldo bancário",
                inputSchema: {
                  type: "object",
                  properties: { conta: { type: "string" } },
                  required: ["conta"],
                },
              },
            ],
          },
        }),
      } as Response;
    });

    const client = new ExternalMcpClient({ url: "https://mcp.exemplo.com" });
    const tools = await client.listTools();

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("consultar_saldo");
    expect(tools[0]!.description).toBe("Consulta saldo bancário");
    expect(tools[0]!.inputSchema.required).toContain("conta");
  });

  it("executa ferramenta com argumentos via callTool e extrai conteúdo de texto", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return {
        ok: true,
        json: async () => ({
          jsonrpc: "2.0",
          id: 2,
          result: {
            content: [{ type: "text", text: "Saldo atual: R$ 1.500,00" }],
            isError: false,
          },
        }),
      } as Response;
    });

    const client = new ExternalMcpClient({ url: "https://mcp.exemplo.com" });
    const res = await client.callTool("consultar_saldo", { conta: "12345" });

    expect(res.isError).toBe(false);
    expect(res.content).toBe("Saldo atual: R$ 1.500,00");
  });

  it("retorna objeto amigável de erro se a execução falhar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response;
    });

    const client = new ExternalMcpClient({ url: "https://mcp.exemplo.com" });
    const res = await client.callTool("consultar_saldo", { conta: "12345" });

    expect(res.isError).toBe(true);
    expect(res.content).toContain("Falha na execução");
  });
});
