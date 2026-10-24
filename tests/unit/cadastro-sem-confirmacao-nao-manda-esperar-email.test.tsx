/**
 * A TELA DO CADASTRO NÃO PODE MANDAR ESPERAR UM E-MAIL QUE NÃO VAI CHEGAR.
 *
 * Par do `app/actions/auth/signUp.test.ts`: lá se guarda que a action DIZ que a
 * sessão veio aberta; aqui, que o cadastro AGE sobre isso. Separados de
 * propósito — a action podia devolver `sessao_ativa` certinho e o formulário
 * continuar mostrando "confirme seu e-mail", que era exatamente o defeito
 * medido, e um teste só do lado da action ficaria verde com a pessoa presa do
 * mesmo jeito.
 *
 * Medido na `origin/main` @ `4d50f63f` com `GOTRUE_MAILER_AUTOCONFIRM=true`: a
 * tela dizia "Enviamos um link de confirmação para …" enquanto o cookie de
 * sessão já estava no browser e o usuário não tinha organização nenhuma.
 * Achado de @KIRAzinx566, com um cliente real travado nessa tela.
 *
 * Desde 2026-10-03 o desvio é `redirect` dentro de `cadastrarPeloFormulario` —
 * a ação que vai DIRETO no `action` do formulário, para o cadastro funcionar
 * antes de o JavaScript carregar (antes era `router.replace` no cliente, que só
 * existe depois dele). Por isso os casos ⭐ dirigem a AÇÃO, com o provedor de
 * auth simulado como em `signUp.test.ts`, e a tela é testada no que sobrou para
 * ela: mostrar o e-mail de confirmação só quando ele vai existir.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { modoDeCadastro } from "@/lib/auth/politica-de-cadastro";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((destino: string) => {
    // O `redirect` de verdade interrompe a ação lançando; o simulado também,
    // para nada depois dele rodar sem querer.
    throw new Error(`NEXT_REDIRECT:${destino}`);
  }),
}));
vi.mock("@/lib/auth/politica-de-cadastro", () => ({
  modoDeCadastro: vi.fn(async () => "aberto"),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));

const signUpDoProvedor = vi.fn();

/** Um e-mail e um IP novos por caso: o teto de `signup` é por IP e por janela. */
let n = 0;
function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [k, v] of Object.entries(campos)) dados.set(k, v);
  return dados;
}

async function conviteValido(email: string) {
  const { signInviteToken, INVITE_TTL_SECONDS } = await import("@/lib/auth/invite-token");
  return signInviteToken({
    invite_id: "00000000-0000-4000-8000-000000000003",
    email,
    organization_id: "00000000-0000-4000-8000-000000000001",
    role: "agent",
    exp: Math.floor(Date.now() / 1000) + INVITE_TTL_SECONDS,
  });
}

describe("cadastro quando o provedor já abriu a sessão", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    signUpDoProvedor.mockReset();
    n += 1;
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? `192.0.2.${n % 250}` : null),
    } as never);
    vi.mocked(createClient).mockResolvedValue({ auth: { signUp: signUpDoProvedor } } as never);
    vi.mocked(modoDeCadastro).mockResolvedValue("aberto");
  });

  const sessaoAberta = () =>
    signUpDoProvedor.mockResolvedValue({
      data: { user: { id: "u-1" }, session: { access_token: "tok", refresh_token: "ref" } },
      error: null,
    });

  it("⭐ sessão já aberta: leva à saída em vez de mandar abrir o e-mail", async () => {
    sessaoAberta();
    const { cadastrarPeloFormulario } = await import("@/app/actions/auth/signUp");

    await expect(
      cadastrarPeloFormulario(
        null,
        null,
        formulario({
          org_name: "Plata Iphones",
          email: `dono-${n}@plata.test`,
          password: "SenhaForte!2026",
          password_confirm: "SenhaForte!2026",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/get-started");
  });

  it("⭐ sessão já aberta COM convite: vai aceitar o convite, não abrir empresa", async () => {
    // Dar organização própria a quem foi convidado é o erro que
    // `decidirConviteDoSignup` existe para evitar. Um desvio que mandasse todo
    // mundo para `/get-started` ficaria verde no caso acima e recriaria esse
    // erro aqui.
    sessaoAberta();
    const email = `convidado-${n}@plata.test`;
    const token = await conviteValido(email);
    const { cadastrarPeloFormulario } = await import("@/app/actions/auth/signUp");

    await expect(
      cadastrarPeloFormulario(
        token,
        null,
        formulario({
          full_name: "Convidada da Silva",
          email,
          password: "SenhaForte!2026",
          password_confirm: "SenhaForte!2026",
        }),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/team/accept-invite/${token}`);
  });

  it("CONTROLE — confirmação LIGADA: o e-mail de confirmação é a resposta, sem desvio", async () => {
    // Sem este caso, "sempre redireciona" ficaria verde e tiraria da tela a
    // única instrução correta para quem de fato precisa confirmar o e-mail.
    signUpDoProvedor.mockResolvedValue({ data: { user: { id: "u-2" }, session: null }, error: null });
    const email = `dono-${n}@plata.test`;
    const { cadastrarPeloFormulario } = await import("@/app/actions/auth/signUp");

    const estado = await cadastrarPeloFormulario(
      null,
      null,
      formulario({
        org_name: "Plata Iphones",
        email,
        password: "SenhaForte!2026",
        password_confirm: "SenhaForte!2026",
      }),
    );

    expect(estado).toEqual({ ok: true, enviadoPara: email });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("na falha, as SENHAS não voltam no estado (iriam para o HTML sem JavaScript)", async () => {
    signUpDoProvedor.mockResolvedValue({ data: { user: null, session: null }, error: { status: 500 } });
    const { cadastrarPeloFormulario } = await import("@/app/actions/auth/signUp");

    const estado = await cadastrarPeloFormulario(
      null,
      null,
      formulario({
        org_name: "Plata Iphones",
        email: `dono-${n}@plata.test`,
        password: "SenhaForte!2026",
        password_confirm: "SenhaForte!2026",
      }),
    );

    expect(estado).toMatchObject({ ok: false, valores: { org_name: "Plata Iphones" } });
    expect(JSON.stringify(estado)).not.toContain("SenhaForte!2026");
  });
});

describe("a tela do cadastro", () => {
  const cadastrar = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    cadastrar.mockReset();
    vi.doMock("@/app/actions/auth/signUp", () => ({ cadastrarPeloFormulario: cadastrar }));
  });

  async function preencherEEnviar(comEmpresa = true) {
    const user = userEvent.setup();
    if (comEmpresa) await user.type(screen.getByLabelText(/Nome da empresa/i), "Plata Iphones");
    else await user.type(screen.getByLabelText(/Seu nome/i), "Convidada da Silva");
    if (comEmpresa) await user.type(screen.getByLabelText(/^Email$/i), "dono@plata.test");
    await user.type(screen.getByLabelText(/^Senha$/i), "SenhaForte!2026");
    await user.type(screen.getByLabelText(/Confirmar senha/i), "SenhaForte!2026");
    await user.click(screen.getByRole("button", { name: /criar conta/i }));
  }

  it("mostra o e-mail de confirmação quando a ação diz que ele foi enviado", async () => {
    cadastrar.mockResolvedValue({ ok: true, enviadoPara: "dono@plata.test" });
    const { SignupForm } = await import("@/components/auth/SignupForm");
    render(<SignupForm />);
    await preencherEEnviar();

    await screen.findByText(/Enviamos um link de confirmação/i);
    const dados = cadastrar.mock.calls[0]?.[2] as FormData;
    expect(dados.get("org_name")).toBe("Plata Iphones");
    expect(dados.get("email")).toBe("dono@plata.test");
  });

  it("o convite viaja preso à ação, e o e-mail é o do convite", async () => {
    cadastrar.mockResolvedValue({ ok: true, enviadoPara: "convidado@plata.test" });
    const { SignupForm } = await import("@/components/auth/SignupForm");
    render(<SignupForm convite={{ token: "tok-123", email: "convidado@plata.test" }} />);
    await preencherEEnviar(false);

    await screen.findByText(/Enviamos um link de confirmação/i);
    const [token, , dados] = cadastrar.mock.calls[0] as [string, unknown, FormData];
    expect(token).toBe("tok-123");
    expect(dados.get("email")).toBe("convidado@plata.test");
    expect(dados.get("full_name")).toBe("Convidada da Silva");
  });
});
