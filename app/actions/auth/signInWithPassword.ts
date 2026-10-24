"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { safeNext } from "@/lib/auth/safe-next";

import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";
import { campoDeTexto, errosDeCampo, type ErrosDeCampo } from "@/lib/auth/formulario-de-acesso";
import { audit, hashEmail } from "@/lib/audit";
import {
  authRateLimited,
  contaBloqueadaPorFalhas,
  registrarFalhaDeLogin,
  AUTH_LIMITS,
} from "@/lib/auth/rate-limit";

export type SignInResult = {
  ok: false;
  error: "invalid_credentials" | "rate_limited" | "validation_error" | "mfa_required";
  details?: Record<string, unknown>;
  challengeId?: string;
};

/**
 * Sign in with password.
 *
 * On success: redirects server-side to `next` (or /app/inbox / /onboarding/mfa).
 * The redirect ensures Set-Cookie headers from supabase.auth propagate before
 * middleware re-evaluates the session — fixes Next 15 Server Action cookie
 * propagation race.
 *
 * On failure: returns an error discriminator. Caller renders inline message.
 */
export async function signInWithPassword(input: LoginInput, next?: string): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Antes de falar com o GoTrue: sem isto, tentar senha era de graça e
  // ilimitado (issue #64). Conta por IP e por conta — o ataque distribuído
  // contra um e-mail só não aparece na contagem por IP.
  if (
    (await authRateLimited("login", null, AUTH_LIMITS.login)) ||
    (await contaBloqueadaPorFalhas(parsed.data.email, AUTH_LIMITS.login))
  ) {
    await audit({
      action: "auth.login_rate_limited",
      metadata: { email_hash: hashEmail(parsed.data.email) },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "rate_limited" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    // Só senha errada gasta o orçamento da conta.
    await registrarFalhaDeLogin(parsed.data.email, AUTH_LIMITS.login);
    await audit({
      action: "auth.login_failed",
      metadata: {
        email_hash: hashEmail(parsed.data.email),
        reason: error?.message ?? "unknown",
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "invalid_credentials" };
  }

  // MFA gating — if the user has any verified TOTP factor enrolled, they must
  // complete the challenge in /login/mfa before reaching the app.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factorsData?.totp?.find((f) => f.status === "verified");
  if (verifiedTotp) {
    return { ok: false, error: "mfa_required", challengeId: verifiedTotp.id };
  }

  await audit({
    action: "auth.login_success",
    actorUserId: data.user.id,
    metadata: {},
    requestId,
    ip,
    userAgent,
  });

  // Server-side redirect ensures fresh session cookie is sent to browser.
  redirect(safeNext(next, "/app"));
}

/**
 * O que a tela de login guarda entre um envio e outro. A SENHA nunca volta:
 * ela iria parar no HTML da resposta quando o envio é o POST nativo (sem
 * JavaScript). O e-mail volta para o campo não esvaziar.
 */
export type EstadoDoLogin = {
  ok: false;
  error: Exclude<SignInResult["error"], "mfa_required">;
  email: string;
  campos?: ErrosDeCampo;
} | null;

/**
 * A mesma ação, no formato do `<form action>` (com o `next` preso por `bind`).
 *
 * É o que faz o login funcionar ANTES de o JavaScript carregar — o clique nesse
 * intervalo era o POST nativo para a própria página, que voltava em branco (o
 * mesmo defeito do "esqueci a senha", medido em produção em 2026-10-02). O
 * desvio para a verificação em duas etapas, que a tela fazia com `router`, mora
 * aqui agora: `redirect` serve aos dois caminhos, com e sem JavaScript.
 */
export async function entrarPeloFormulario(
  next: string | null,
  _anterior: EstadoDoLogin,
  dados: FormData,
): Promise<EstadoDoLogin> {
  const email = campoDeTexto(dados, "email").trim();
  const destino = next ?? undefined;
  const res = await signInWithPassword({ email, password: campoDeTexto(dados, "password") }, destino);
  if (res.error === "mfa_required") {
    const params = new URLSearchParams();
    if (destino) params.set("next", destino);
    if (res.challengeId) params.set("factor", res.challengeId);
    redirect(`/login/mfa${params.toString() ? `?${params}` : ""}`);
  }
  return { ok: false, error: res.error, email, campos: errosDeCampo(res.details) };
}
