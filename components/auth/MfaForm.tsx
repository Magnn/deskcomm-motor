"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { TOTPInput } from "@/components/auth/TOTPInput";
import { Button } from "@/components/ui/button";
import {
  verificarMfaPeloFormulario,
  type EstadoDaVerificacaoMfa,
} from "@/app/actions/auth/verifyMfa";

interface MfaFormProps {
  next?: string;
}

/**
 * A ação do servidor vai DIRETO no `action` do formulário — o envio é POST para
 * ela já no HTML do servidor (ver `tests/unit/credencial-nunca-na-url.test.ts`).
 * Os seis quadradinhos do `TOTPInput` não têm `name`; quem leva o código é o
 * campo oculto `code`, e completar os seis dígitos envia o formulário pelo
 * caminho normal (`requestSubmit`).
 */
export function MfaForm({ next }: MfaFormProps) {
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [estado, enviar, isPending] = useActionState<EstadoDaVerificacaoMfa, FormData>(
    verificarMfaPeloFormulario.bind(null, next ?? null),
    null,
  );

  // A cada resposta de erro: limpa o código e, se bloqueou, começa a contagem.
  // Ajuste durante a renderização (padrão do React para "estado que reage a uma
  // mudança"), não efeito: `tentativa` faz cada resposta ser uma mudança nova.
  const [respostaVista, setRespostaVista] = useState(estado);
  if (estado !== respostaVista) {
    setRespostaVista(estado);
    if (estado) {
      setCode("");
      setSecondsLeft(estado.error === "mfa_locked" ? (estado.retry_in_seconds ?? 60) : 0);
    }
  }

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const locked = estado?.error === "mfa_locked" && secondsLeft > 0;
  const mensagem = !estado
    ? null
    : estado.error === "mfa_locked"
      ? secondsLeft > 0
        ? `${t("Muitas tentativas. Tente novamente em")} ${secondsLeft}s.`
        : null
      : t("Código inválido. Tente novamente.");

  const recoveryHref = next
    ? `/login/recovery?next=${encodeURIComponent(next)}`
    : "/login/recovery";

  return (
    <form ref={formRef} action={enviar} className="space-y-6" noValidate>
      <input type="hidden" name="code" value={code} />
      <TOTPInput
        value={code}
        onChange={setCode}
        onComplete={(completo) => {
          if (locked || isPending) return;
          // O `onComplete` chega de dentro do `onChange`, antes de o sexto dígito
          // virar estado: sem o `flushSync`, o campo oculto iria com cinco.
          flushSync(() => setCode(completo));
          formRef.current?.requestSubmit();
        }}
        disabled={isPending || locked}
        autoFocus
        hasError={!!mensagem}
      />

      {mensagem && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
        >
          {mensagem}
        </div>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || locked || code.length !== 6}
      >
        {isPending ? t("Verificando...") : t("Verificar")}
      </Button>

      <div className="text-center text-sm">
        <Link href={recoveryHref} className="text-muted-foreground underline-offset-4 hover:underline">
          {t("Perdi acesso ao autenticador")}
        </Link>
      </div>
    </form>
  );
}
