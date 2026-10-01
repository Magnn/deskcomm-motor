import { z } from "zod";

/**
 * Esquema de organização de pastas para fluxos e agentes.
 * Permite categorização departedamental e por campanha (ex: Vendas, Suporte, Onboarding).
 */
export const flowFolderSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(1, "Nome da pasta é obrigatório"),
  color: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Cor hex inválida").default("#6366f1"),
  icon: z.string().default("Folder"),
  description: z.string().optional(),
  parentId: z.string().nullable().default(null),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type FlowFolder = z.infer<typeof flowFolderSchema>;

export const DEFAULT_FLOW_FOLDERS: FlowFolder[] = [
  {
    id: "folder_vendas",
    name: "Vendas & Prospecção",
    color: "#10b981",
    icon: "CurrencyDollar",
    description: "Fluxos de qualificação, prospecção e conversão de novos clientes",
    parentId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "folder_onboarding",
    name: "Boas-vindas & Onboarding",
    color: "#3b82f6",
    icon: "Sparkle",
    description: "Apresentação da empresa, coleta de dados iniciais e boas-vindas",
    parentId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "folder_suporte",
    name: "Suporte & Atendimento",
    color: "#f59e0b",
    icon: "Headphones",
    description: "Triagem de dúvidas frequentes e encaminhamento para atendentes",
    parentId: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: "folder_recuperacao",
    name: "Recuperação & Reativação",
    color: "#ef4444",
    icon: "ArrowCounterClockwise",
    description: "Resgate de leads inativos, carrinhos abandonados e pós-venda",
    parentId: null,
    createdAt: new Date().toISOString(),
  },
];
