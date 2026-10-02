"use client";

import { useActionState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  pedirRedefinicaoPeloFormulario,
  type EstadoDoPedidoDeRedefinicao,
} from "@/app/actions/auth/requestPasswordReset";

/**
 * A ação do servidor vai DIRETO no `action` do formulário — sem embrulho no
 * cliente. É o que faz o envio funcionar antes de o bundle carregar: o React
 * renderiza o `<form>` como POST para a ação, o Next a executa nesse POST nativo
 * e devolve a tela com o resultado. Com o `onSubmit` de antes, o clique dado
 * nesse intervalo recarregava a página em branco e o e-mail nunca era pedido.
 *
 * Por isso não há `method="post"` aqui: com função no `action`, quem garante o
 * POST é o React (e ele recusa um `method` escrito à mão). A cerca de
 * `tests/unit/credencial-nunca-na-url.test.ts` aceita esta forma.
 */
export function ForgotPasswordForm() {
  const t = useT();
  const [estado, enviar, isPending] = useActionState<EstadoDoPedidoDeRedefinicao, FormData>(
    pedirRedefinicaoPeloFormulario,
    null,
  );

  if (estado?.ok) {
    return (
      <div
        className="space-y-2 rounded-md border bg-muted/40 px-4 py-6 text-center"
        role="status"
      >
        <p className="text-sm font-medium">{t("Verifique seu e-mail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Se existir uma conta com esse e-mail, enviamos um link para redefinir a senha.")}
        </p>
      </div>
    );
  }

  const falha = estado?.ok === false ? estado : null;
  const mensagem =
    falha?.error === "rate_limited"
      ? t("Muitas tentativas. Aguarde alguns minutos.")
      : falha?.error === "validation_error"
        ? t("Email inválido. Confira o campo.")
        : falha
          ? t("Não foi possível enviar o e-mail. Tente novamente.")
          : null;

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
          defaultValue={falha?.email ?? ""}
          aria-invalid={falha?.error === "validation_error" ? true : undefined}
        />
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
        {isPending ? t("Enviando...") : t("Enviar link de redefinição")}
      </Button>
    </form>
  );
}
