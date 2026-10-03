/**
 * Issue #64 — o teto está LIGADO no login, não só disponível numa lib.
 *
 * O helper tem teste próprio (lib/auth/rate-limit.test.ts); este aqui prova a
 * fiação: a action recusa a 6ª tentativa contra a MESMA conta dentro da janela,
 * antes de falar com o GoTrue. Sem a chamada em signInWithPassword.ts, as seis
 * tentativas chegariam ao provedor e o teste fica vermelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const signIn = vi.fn(async () => ({
  data: { user: null, session: null },
  error: { message: "Invalid login credentials", status: 400 },
}));

describe("signInWithPassword — teto de tentativas", () => {
  beforeEach(() => {
    vi.resetModules();
    signIn.mockClear();
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.77" : null),
    } as never);
    signIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    } as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: signIn,
        mfa: { listFactors: vi.fn(async () => ({ data: { totp: [{ id: "f1" }] } })) },
      },
    } as never);
  });

  it("recusa a 6ª tentativa contra a mesma conta sem chamar o provedor", async () => {
    const { signInWithPassword } = await import("./signInWithPassword");
    const input = { email: "alvo@example.com", password: "senha-errada-123" };

    const resultados = [];
    for (let i = 0; i < 6; i++) {
      resultados.push(await signInWithPassword(input));
    }

    // AUTH_LIMITS.login.id = 5 → as 5 primeiras passam do teto e falham no
    // provedor; a 6ª nem chega lá.
    expect(resultados.slice(0, 5).map((r) => r.error)).toEqual(
      Array(5).fill("invalid_credentials"),
    );
    expect(resultados[5]?.error).toBe("rate_limited");
    expect(signIn).toHaveBeenCalledTimes(5);
  });

  it("acertar a senha não gasta o orçamento de bloqueio da conta", async () => {
    const { signInWithPassword } = await import("./signInWithPassword");
    const input = { email: "certo@example.com", password: "senha-certa-123" };

    // Provedor aceita, e a conta tem MFA — o retorno é mfa_required, o que
    // basta: o ponto é que o caminho de SUCESSO não incrementa o contador.
    signIn.mockResolvedValue({
      data: { user: { id: "u1" }, session: {} },
      error: null,
    } as never);

    const resultados = [];
    for (let i = 0; i < 10; i++) {
      resultados.push(await signInWithPassword(input));
    }

    // Nenhuma das dez foi barrada: se o sucesso contasse, a 6ª seria.
    expect(resultados.filter((r) => r?.error === "rate_limited")).toHaveLength(0);
    expect(signIn).toHaveBeenCalledTimes(10);
  });
});

/**
 * A ação que vai DIRETO no `action` do formulário de login — o que faz o login
 * funcionar antes de o JavaScript carregar. O desvio para a verificação em duas
 * etapas saiu do `router` da tela e mora nela (`redirect` serve aos dois
 * caminhos); e a senha nunca pode voltar no estado, porque sem JavaScript o
 * estado vai para o HTML da resposta.
 */
describe("entrarPeloFormulario", () => {
  function formulario(email: string, password: string) {
    const dados = new FormData();
    dados.set("email", email);
    dados.set("password", password);
    return dados;
  }

  beforeEach(async () => {
    vi.resetModules();
    signIn.mockReset();
    const { redirect } = await import("next/navigation");
    vi.mocked(redirect).mockReset();
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "198.51.100.91" : null),
    } as never);
  });

  it("conta com verificação em duas etapas: vai para /login/mfa levando o `next` e o fator", async () => {
    signIn.mockResolvedValue({ data: { user: { id: "u1" }, session: {} }, error: null } as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: signIn,
        mfa: { listFactors: vi.fn(async () => ({ data: { totp: [{ id: "f-9", status: "verified" }] } })) },
      },
    } as never);
    const { redirect } = await import("next/navigation");
    const { entrarPeloFormulario } = await import("./signInWithPassword");

    await entrarPeloFormulario("/app/inbox", null, formulario("mfa@example.com", "senha-certa-123"));

    expect(redirect).toHaveBeenCalledWith("/login/mfa?next=%2Fapp%2Finbox&factor=f-9");
  });

  it("senha errada: o estado traz o e-mail e NUNCA a senha", async () => {
    signIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    } as never);
    vi.mocked(createClient).mockResolvedValue({ auth: { signInWithPassword: signIn } } as never);
    const { entrarPeloFormulario } = await import("./signInWithPassword");

    const estado = await entrarPeloFormulario(null, null, formulario("errou@example.com", "senha-errada-xyz"));

    expect(estado).toMatchObject({ ok: false, error: "invalid_credentials", email: "errou@example.com" });
    expect(JSON.stringify(estado)).not.toContain("senha-errada-xyz");
  });
});
