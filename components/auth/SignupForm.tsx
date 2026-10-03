"use client";

import Link from "next/link";
import { useActionState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cadastrarPeloFormulario, type EstadoDoCadastro } from "@/app/actions/auth/signUp";

/**
 * Convite em curso: a conta está sendo criada para ACEITAR um convite, não para
 * abrir uma empresa. Muda duas coisas na tela — some o campo "Nome da empresa"
 * (a empresa já existe; pedir seria mandar a pessoa batizar a organização de
 * outra gente) e o e-mail fica travado no do convite.
 */
export interface ConviteDoSignup {
  token: string;
  email: string;
}

/**
 * A ação do servidor vai DIRETO no `action` do formulário (o token do convite
 * preso por `bind`): o envio funciona antes de o JavaScript carregar. Ver
 * `tests/unit/credencial-nunca-na-url.test.ts`.
 *
 * ⚠️ QUEM JÁ SAI AUTENTICADO NÃO PODE FICAR ESPERANDO E-MAIL. Com "Confirm
 * email" desligado no provedor de auth, não existe link para clicar; a tela de
 * "abra o e-mail" vira instrução impossível e a pessoa fica parada — logada, sem
 * organização. O desvio (convite → aceitar o convite; cadastro próprio →
 * `/get-started`) é `redirect` dentro de `cadastrarPeloFormulario`. Achado de
 * @KIRAzinx566, com um cliente real travado.
 */
export function SignupForm({ convite }: { convite?: ConviteDoSignup }) {
  const t = useT();
  const [estado, enviar, isPending] = useActionState<EstadoDoCadastro, FormData>(
    cadastrarPeloFormulario.bind(null, convite?.token ?? null),
    null,
  );

  const falha = estado?.ok === false ? estado : null;
  const errors = falha?.campos ?? {};
  const valores = falha?.valores;
  const contaExistente = falha?.error === "conta_ja_existe";
  const sentTo = estado?.ok ? estado.enviadoPara : null;
  const serverError = !falha || (contaExistente && convite)
    ? null
    : falha.error === "rate_limited"
      ? t("Muitas tentativas. Aguarde alguns minutos.")
      : falha.error === "validation_error"
        ? t("Dados inválidos. Confira os campos.")
        : falha.error === "somente_convite"
          ? // Política, não falha transitória: "tente novamente" nunca funcionaria.
            t(
              "Esta instalação aceita cadastro apenas por convite. Se você foi convidado, use o link que chegou no seu e-mail.",
            )
          : t("Não foi possível criar a conta. Tente novamente.");

  if (contaExistente && convite) {
    const destino = `/login?next=${encodeURIComponent(`/team/accept-invite/${convite.token}`)}`;
    return (
      <div className="space-y-4 rounded-md border bg-muted/40 px-4 py-6 text-center" role="status">
        <p className="text-sm font-medium">{t("Você já tem uma conta com este e-mail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Entre com ela para aceitar o convite — não é preciso criar outra.")}
        </p>
        <Button asChild className="w-full">
          <Link href={destino}>{t("Entrar e aceitar o convite")}</Link>
        </Button>
      </div>
    );
  }

  if (sentTo) {
    return (
      <div
        className="space-y-2 rounded-md border bg-muted/40 px-4 py-6 text-center"
        role="status"
      >
        <p className="text-sm font-medium">{t("Confirme seu e-mail")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Enviamos um link de confirmação para")} <strong>{sentTo}</strong>.{" "}
          {t("Abra o e-mail e clique no link para ativar sua conta.")}
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className="space-y-4" noValidate>
      {/*
        Só no modo CONVITE. Quem abre a própria empresa dá o nome no onboarding;
        quem é convidado pula o onboarding e ficava sem nome para sempre —
        aparecendo como um pedaço do identificador interno em toda tela que o
        nomeia (medido no diálogo de transferir conversa, em produção).
      */}
      {convite && (
      <div className="space-y-1.5">
        <Label htmlFor="full_name">{t("Seu nome")}</Label>
        <Input
          id="full_name"
          type="text"
          autoComplete="name"
          autoFocus
          name="full_name"
          defaultValue={valores?.full_name ?? ""}
          aria-invalid={errors.full_name ? true : undefined}
        />
        {errors.full_name && <p className="text-xs text-destructive">{t(errors.full_name)}</p>}
      </div>
      )}
      {!convite && (
      <div className="space-y-1.5">
        <Label htmlFor="org_name">{t("Nome da empresa")}</Label>
        <Input
          id="org_name"
          type="text"
          autoComplete="organization"
          autoFocus
          name="org_name"
          defaultValue={valores?.org_name ?? ""}
          aria-invalid={errors.org_name ? true : undefined}
        />
        {errors.org_name && <p className="text-xs text-destructive">{t(errors.org_name)}</p>}
      </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          // O convite vale para UM endereço. Deixar editável convidaria a
          // trocar e receber "email_divergente" depois de preencher tudo.
          readOnly={Boolean(convite)}
          name="email"
          defaultValue={convite?.email ?? valores?.email ?? ""}
          aria-invalid={errors.email ? true : undefined}
        />
        {errors.email && <p className="text-xs text-destructive">{t(errors.email)}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("Senha")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          name="password"
          aria-invalid={errors.password ? true : undefined}
        />
        {errors.password && <p className="text-xs text-destructive">{t(errors.password)}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password_confirm">{t("Confirmar senha")}</Label>
        <Input
          id="password_confirm"
          type="password"
          autoComplete="new-password"
          name="password_confirm"
          aria-invalid={errors.password_confirm ? true : undefined}
        />
        {errors.password_confirm && (
          <p className="text-xs text-destructive">{t(errors.password_confirm)}</p>
        )}
      </div>
      {serverError && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? t("Criando conta...") : t("Criar conta")}
      </Button>
    </form>
  );
}
