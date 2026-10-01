import { z } from "zod";

export const executionStatusSchema = z.enum(["running", "success", "failed", "cancelled"]);
export type ExecutionStatus = z.infer<typeof executionStatusSchema>;

export const executionLogEntrySchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  flowId: z.string(),
  contactId: z.string().optional(),
  contactName: z.string().optional(),
  channel: z.string().default("whatsapp"),
  status: executionStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  failedNodeId: z.string().optional(),
  failedNodeType: z.string().optional(),
  errorMessage: z.string().optional(),
  errorDetails: z.record(z.string(), z.unknown()).optional(),
  executedNodesCount: z.number().int().nonnegative().default(0),
});

export type ExecutionLogEntry = z.infer<typeof executionLogEntrySchema>;

/**
 * Traduz e diagnostica causas comuns de erros de nós em orientações acionáveis para o operador.
 */
export function diagnoseNodeError(
  nodeType: string | undefined,
  rawError: string
): { diagnostic: string; recommendation: string } {
  const err = (rawError || "").toLowerCase();

  if (nodeType === "google_sheets" || err.includes("sheets") || err.includes("spreadsheet")) {
    if (err.includes("403") || err.includes("permission")) {
      return {
        diagnostic: "Permissão insuficiente na planilha do Google Sheets.",
        recommendation: "Compartilhe a planilha com o e-mail da conta de serviço com permissão de 'Editor'.",
      };
    }
    if (err.includes("not found") || err.includes("404")) {
      return {
        diagnostic: "Planilha ou aba não encontrada.",
        recommendation: "Verifique o ID da planilha e o nome exato da aba configurada no nó.",
      };
    }
  }

  if (nodeType === "execute_code" || err.includes("code") || err.includes("eval")) {
    if (err.includes("timeout")) {
      return {
        diagnostic: "O código JavaScript excedeu o limite máximo de execução.",
        recommendation: "Otimize os loops ou aumente o limite de timeout na configuração do nó.",
      };
    }
    if (err.includes("referenceerror") || err.includes("is not defined")) {
      return {
        diagnostic: "Variável não declarada acessada no script.",
        recommendation: "Verifique os nomes das propriedades em 'context' ou adicione validações condicionais.",
      };
    }
  }

  if (nodeType === "http_request" || nodeType === "webhook" || err.includes("http")) {
    if (err.includes("500") || err.includes("502") || err.includes("503")) {
      return {
        diagnostic: "O servidor de destino retornou erro 5xx (indisponível ou falha interna).",
        recommendation: "Confira a integridade do endpoint externo ou tente novamente em alguns instantes.",
      };
    }
    if (err.includes("401") || err.includes("403")) {
      return {
        diagnostic: "Falha de autenticação na API externa.",
        recommendation: "Verifique os headers de autorização e se o token/chave de API não expirou.",
      };
    }
  }

  return {
    diagnostic: "Falha inesperada durante o processamento do nó.",
    recommendation: "Consulte os logs técnicos e valide os dados recebidos na entrada deste nó.",
  };
}
