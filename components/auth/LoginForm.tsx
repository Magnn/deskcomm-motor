"use client";

import { useActionState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { entrarPeloFormulario, type EstadoDoLogin } from "@/app/actions/auth/signInWithPassword";

/**
 * A ação do servidor vai DIRETO no `action` do formulário: o envio funciona antes
 * de o JavaScript carregar (e com ele bloqueado). Sucesso e desvio para a
 * verificação em duas etapas são `redirect` no servidor. Ver
 * `tests/unit/credencial-nunca-na-url.test.ts`.
 */
export function LoginForm({ next }: { next?: string }) {
  const t = useT();
  const [estado, enviar, isPending] = useActionState<EstadoDoLogin, FormData>(
    entrarPeloFormulario.bind(null, next ?? null),
    null,
  );

  const mensagem =
    estado?.error === "invalid_credentials"
      ? t("Email ou senha incorretos.")
      : estado?.error === "rate_limited"
        ? t("Muitas tentativas. Aguarde alguns minutos.")
        : estado?.error === "validation_error"
          ? t("Dados inválidos. Confira os campos.")
          : estado
            ? t("Erro inesperado. Tente novamente.")
            : null;
  const campos = estado?.campos;

  return (
    <form action={enviar} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("Email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          defaultValue={estado?.email ?? ""}
          aria-invalid={campos?.email ? true : undefined}
        />
        {campos?.email && <p className="text-xs text-destructive">{t(campos.email)}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Senha")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={campos?.password ? true : undefined}
        />
        {campos?.password && <p className="text-xs text-destructive">{t(campos.password)}</p>}
      </div>
      {mensagem && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {mensagem}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Entrando...") : t("Entrar")}
      </Button>
    </form>
  );
}
