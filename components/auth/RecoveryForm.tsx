"use client";

import { useActionState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recuperarComCodigoPeloFormulario,
  type EstadoDaRecuperacaoPorCodigo,
} from "@/app/actions/auth/useRecoveryCode";

interface RecoveryFormProps {
  next?: string;
}

/**
 * A ação do servidor vai DIRETO no `action` do formulário: o envio funciona antes
 * de o JavaScript carregar. A conferência de formato do código (8 letras ou
 * números) é da ação — ver `tests/unit/credencial-nunca-na-url.test.ts`.
 */
export function RecoveryForm({ next }: RecoveryFormProps) {
  const t = useT();
  const [estado, enviar, isPending] = useActionState<EstadoDaRecuperacaoPorCodigo, FormData>(
    recuperarComCodigoPeloFormulario.bind(null, next ?? null),
    null,
  );

  const mensagem = !estado
    ? null
    : estado.error === "service_unavailable"
      ? t("Serviço de recuperação indisponível. Contate o administrador.")
      : t("Código inválido ou já utilizado.");

  return (
    <form action={enviar} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={estado?.email ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="recovery-code">{t("Código de recuperação")}</Label>
        <Input
          id="recovery-code"
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          maxLength={8}
          required
          placeholder="ABCD2345"
          className="font-mono uppercase tracking-widest"
        />
        <p className="text-xs text-muted-foreground">
          {t("Use um dos 10 códigos que você salvou ao configurar a verificação em duas etapas.")}
        </p>
      </div>

      {mensagem && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {mensagem}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Validando…") : t("Recuperar acesso")}
      </Button>
    </form>
  );
}
