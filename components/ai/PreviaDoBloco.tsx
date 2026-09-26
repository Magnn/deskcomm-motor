"use client";
/**
 * O painel "O que o agente recebe": mostra o bloco de prompt que uma aba estruturada compila, tal como ele
 * vai — a mesma função do turno, sobre os mesmos campos. Sem mágica: o que está escrito aqui é o que o
 * agente lê. Fixo ao rolar em telas largas; nas estreitas desce para baixo do formulário.
 */
import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { Eye } from "@/lib/ui/icons";

interface Props {
  /** O bloco já compilado (e sem espaço nas pontas). Vazio = ainda não há o que mostrar. */
  texto: string;
  /** A aba está ligada? Desligada, a prévia ainda mostra o que passaria a valer. */
  ligada: boolean;
  /** `data-testid` do cartão (cada aba tem o seu). */
  testId: string;
}

export function PreviaDoBloco({ texto, ligada, testId }: Props) {
  const t = useT();
  return (
    <aside className="lg:sticky lg:top-4 lg:self-start">
      <Card className="flex flex-col gap-3 p-4" data-testid={testId}>
        <div className="flex items-center gap-2">
          <Eye size={16} aria-hidden className="text-text-muted" />
          <h3 className="text-sm font-medium">{t("O que o agente recebe")}</h3>
          {!ligada ? (
            <span className="ml-auto rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">
              {t("Desligada")}
            </span>
          ) : null}
        </div>
        {texto !== "" ? (
          <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-elevated p-3 text-xs leading-relaxed text-text">
            {texto}
          </pre>
        ) : (
          <p className="text-sm text-text-muted">
            {t("Preencha os campos ao lado para ver a instrução que o agente vai receber.")}
          </p>
        )}
        <p className="text-xs text-text-muted">
          {t(
            "É exatamente este texto que vai ao agente, no fim das instruções. Frases prontas e regras de segurança do agente continuam valendo mais.",
          )}
        </p>
      </Card>
    </aside>
  );
}
