/**
 * CONTA SEM EMPRESA VAI PARA `/get-started` — provado EXECUTANDO o layout de `/app`.
 *
 * Medido em 18/10/2026: uma conta nova cujo link de confirmação não provisionou a empresa entrou pela
 * senha e caiu numa casca sem menu (`/app` → Perfil), sem pista de que faltava criar a empresa. O
 * layout já distinguia "teve e foi revogada" (`/acesso-revogado`), mas o "nunca teve" não levava a
 * lugar nenhum.
 *
 * O que este arquivo guarda:
 *  - sem organização e sem revogação → `/get-started`;
 *  - revogada continua indo para `/acesso-revogado` (a revogação não vira criação de empresa);
 *  - administrador da plataforma e sessão de suporte não são empurrados para criar empresa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  usuario: { id: "user-1", idioma: "pt-BR", is_platform_admin: false, support: null as unknown, organizations: [] },
  revogado: false,
}));

vi.mock("@/lib/auth/server", () => ({
  loadAuthUser: async () => h.usuario,
  resolveActiveOrg: async () => null,
  isMfaEnrolled: async () => true,
  requiresMfa: async () => false,
}));
vi.mock("@/lib/auth/vinculo-revogado", () => ({ acessoFoiRevogado: async () => h.revogado }));
vi.mock("@/lib/channels/health", () => ({ listarConexoesCaidas: async () => [] }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/branding/instalacao", () => ({ marcaDaInstalacao: async () => ({}) }));

const rodar = async () => {
  const { default: AppLayout } = await import("@/app/app/layout");
  return AppLayout({ children: null });
};

beforeEach(() => {
  h.usuario = { id: "user-1", idioma: "pt-BR", is_platform_admin: false, support: null, organizations: [] };
  h.revogado = false;
});

describe("layout de /app sem organização", () => {
  it("conta que nunca teve empresa vai para /get-started", async () => {
    await expect(rodar()).rejects.toThrow("REDIRECT:/get-started");
  });

  it("vínculo revogado continua indo para /acesso-revogado", async () => {
    h.revogado = true;
    await expect(rodar()).rejects.toThrow("REDIRECT:/acesso-revogado");
  });

  it("administrador da plataforma e suporte não são mandados criar empresa", async () => {
    h.usuario = { ...h.usuario, is_platform_admin: true };
    await expect(rodar()).resolves.toBeDefined();

    h.usuario = { ...h.usuario, is_platform_admin: false, support: { ativo: true } };
    await expect(rodar()).resolves.toBeDefined();
  });
});
