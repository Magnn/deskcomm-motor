"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/auth/schemas";
import { audit, hashEmail } from "@/lib/audit";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

export type RequestPasswordResetResult =
  | { ok: true }
  | {
      ok: false;
      error: "validation_error" | "rate_limited" | "request_failed";
      details?: Record<string, unknown>;
    };

/**
 * Pede o e-mail de redefinição de senha. Resposta neutra quanto à existência
 * do e-mail (o GoTrue responde 200 para e-mail desconhecido — não vaza nada);
 * erros aqui são só de infra (SMTP, rate limit).
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput,
): Promise<RequestPasswordResetResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const hdrs = await headers();
  const origin = hdrs.get("origin") ?? env.NEXT_PUBLIC_APP_URL;
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Sem teto, este endpoint é uma metralhadora de e-mail contra terceiros e um
  // oráculo de enumeração de conta. Issue #64.
  if (await authRateLimited("reset", parsed.data.email, AUTH_LIMITS.reset)) {
    return { ok: false, error: "rate_limited" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    // ?type=recovery sobrevive ao redirect do GoTrue (preserva query string
    // existente ao anexar `code=`/`token_hash=`) — sem SMTP customizado o
    // Supabase usa o template padrão dele, que só devolve `code` (PKCE), sem
    // `type`; /auth/confirm depende deste param pra saber que é recovery.
    redirectTo: `${origin}/auth/confirm?type=recovery`,
  });

  if (error) {
    if (error.status === 429) return { ok: false, error: "rate_limited" };
    await audit({
      action: "auth.password_reset_request_failed",
      metadata: {
        email_hash: hashEmail(parsed.data.email),
        reason: error.message,
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "request_failed" };
  }

  await audit({
    action: "auth.password_reset_requested",
    metadata: { email_hash: hashEmail(parsed.data.email) },
    requestId,
    ip,
    userAgent,
  });

  return { ok: true };
}

/**
 * O que a tela de "esqueci a senha" guarda entre um envio e outro. O e-mail volta
 * junto para o campo não esvaziar quando o envio falha.
 */
export type EstadoDoPedidoDeRedefinicao =
  | { ok: true }
  | { ok: false; error: "validation_error" | "rate_limited" | "request_failed"; email: string }
  | null;

/**
 * A mesma ação, no formato que o `<form action>` entrega (estado anterior + FormData).
 *
 * É o que faz o formulário funcionar ANTES de o JavaScript carregar. Com só um
 * `onSubmit`, o clique dado nesse intervalo virava o POST nativo do HTML para a
 * própria página: o servidor devolvia a tela em branco, o e-mail digitado sumia
 * e nenhum pedido chegava ao GoTrue — medido em produção em 2026-10-02. Sendo a
 * ação do formulário, o Next a executa nesse POST e devolve a tela já com o
 * resultado.
 */
export async function pedirRedefinicaoPeloFormulario(
  _anterior: EstadoDoPedidoDeRedefinicao,
  dados: FormData,
): Promise<EstadoDoPedidoDeRedefinicao> {
  const email = String(dados.get("email") ?? "").trim();
  const resultado = await requestPasswordReset({ email });
  return resultado.ok ? { ok: true } : { ok: false, error: resultado.error, email };
}
