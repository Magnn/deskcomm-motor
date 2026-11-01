"use client";

import { MODELOS_PRONTOS, type ModeloPronto } from "@/lib/channels/modelos-prontos";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

const GRUPOS = [
  { categoria: "UTILITY", titulo: "Utilidade: aviso de algo real daquele contato" },
  { categoria: "MARKETING", titulo: "Marketing: oferta, novidade e retomada" },
] as const;

/**
 * Começar de um modelo pronto. Escolher só preenche o formulário: nada vai para
 * a revisão sem o operador olhar o texto e apertar o botão.
 */
export function EscolherModeloPronto({
  escolhido,
  onEscolher,
}: {
  escolhido: string | null;
  onEscolher: (modelo: ModeloPronto) => void;
}) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3" data-testid="modelos-prontos">
      <div>
        <h3 className="text-sm font-medium">{t("Começar de um modelo pronto")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Escolha um, ajuste o texto e envie para a revisão da Meta. Use cada modelo só na situação indicada.")}
        </p>
      </div>
      {GRUPOS.map((grupo) => (
        <div key={grupo.categoria} className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t(grupo.titulo)}
          </span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MODELOS_PRONTOS.filter((m) => m.category === grupo.categoria).map((modelo) => (
              <button
                key={modelo.name}
                type="button"
                onClick={() => onEscolher(modelo)}
                aria-pressed={escolhido === modelo.name}
                data-testid={`modelo-pronto-${modelo.name}`}
                className={cn(
                  "flex flex-col gap-0.5 rounded-md border border-border p-2 text-left hover:bg-muted",
                  escolhido === modelo.name && "border-primary ring-1 ring-primary/30",
                )}
              >
                <span className="text-sm font-medium">{t(modelo.titulo)}</span>
                <span className="text-xs text-muted-foreground">{t(modelo.quando)}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
