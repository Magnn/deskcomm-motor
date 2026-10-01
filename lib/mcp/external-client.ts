/**
 * Cliente de Conexão com Servidores MCP Externos (ChatbotX parity).
 *
 * Implementa a especificação Model Context Protocol (MCP) via transporte HTTP / JSON-RPC 2.0.
 * Permite que agentes e fluxos de automação do DeskcommCRM conectem-se a servidores MCP remotos
 * (ex: Postgres MCP, APIs customizadas, Github, microserviços internos), descubram ferramentas
 * disponíveis dinamicamente e as executem com segurança.
 */

import { z } from "zod";

export type McpAuthType = "none" | "bearer" | "header";

export interface McpServerConfig {
  url: string;
  authType?: McpAuthType;
  token?: string;
  headerName?: string;
  headerValue?: string;
  timeoutMs?: number;
}

export const mcpToolParameterSchema = z.record(z.string(), z.any());

export const mcpDiscoveredToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  inputSchema: z
    .object({
      type: z.literal("object").optional().default("object"),
      properties: z.record(z.string(), z.any()).optional().default({}),
      required: z.array(z.string()).optional().default([]),
    })
    .optional()
    .default({ type: "object", properties: {}, required: [] }),
});

export type McpDiscoveredTool = z.infer<typeof mcpDiscoveredToolSchema>;

export interface McpCallToolResult {
  isError: boolean;
  content: string;
  raw?: unknown;
}

export class ExternalMcpClient {
  private readonly url: string;
  private readonly authType: McpAuthType;
  private readonly token?: string;
  private readonly headerName?: string;
  private readonly headerValue?: string;
  private readonly timeoutMs: number;
  private idCounter = 1;

  constructor(config: McpServerConfig) {
    if (!config.url || !/^https?:\/\//i.test(config.url.trim())) {
      throw new Error("URL do servidor MCP inválida. Deve iniciar com http:// ou https://");
    }
    this.url = config.url.trim().replace(/\/+$/, "");
    this.authType = config.authType || (config.token ? "bearer" : "none");
    this.token = config.token;
    this.headerName = config.headerName;
    this.headerValue = config.headerValue;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.authType === "bearer" && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    } else if (this.authType === "header" && this.headerName && this.headerValue) {
      headers[this.headerName] = this.headerValue;
    }

    return headers;
  }

  private getNextId(): number {
    return this.idCounter++;
  }

  /**
   * Envia uma requisição JSON-RPC 2.0 ao endpoint do servidor MCP.
   */
  private async postJsonRpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const payload = {
      jsonrpc: "2.0",
      id: this.getNextId(),
      method,
      params,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Servidor MCP retornou HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();

      if (json.error) {
        throw new Error(`Erro MCP [${json.error.code}]: ${json.error.message}`);
      }

      return json.result;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Timeout ao comunicar com servidor MCP após ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Descobre a lista de ferramentas disponíveis no servidor MCP via `tools/list`.
   */
  async listTools(): Promise<McpDiscoveredTool[]> {
    const result = await this.postJsonRpc("tools/list", {});
    const tools = Array.isArray(result?.tools) ? result.tools : [];

    const discovered: McpDiscoveredTool[] = [];
    for (const item of tools) {
      const parsed = mcpDiscoveredToolSchema.safeParse(item);
      if (parsed.success) {
        discovered.push(parsed.data);
      }
    }
    return discovered;
  }

  /**
   * Executa uma ferramenta no servidor MCP via `tools/call`.
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallToolResult> {
    if (!name || typeof name !== "string") {
      throw new Error("Nome da ferramenta é obrigatório.");
    }

    try {
      const result = await this.postJsonRpc("tools/call", {
        name,
        arguments: args,
      });

      const isError = Boolean(result?.isError);
      let contentText = "";

      if (Array.isArray(result?.content)) {
        contentText = result.content
          .map((item: any) => {
            if (typeof item === "string") return item;
            if (item && typeof item === "object" && "text" in item) return String(item.text);
            return JSON.stringify(item);
          })
          .join("\n");
      } else if (result?.content) {
        contentText = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
      } else {
        contentText = JSON.stringify(result);
      }

      return {
        isError,
        content: contentText,
        raw: result,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: `Falha na execução da ferramenta "${name}": ${msg}`,
      };
    }
  }
}
