"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { attendantRouteConfigSchema } from "@/lib/followup/graph-schema";

import type { ConfigOf } from "./shared";

export function AttendantRouteForm({
  config,
  onChange,
}: {
  config: ConfigOf<"attendant_route">;
  onChange: (config: ConfigOf<"attendant_route">) => void;
}) {
  const t = useT();
  const [maxWait, setMaxWait] = useState(config.max_wait_minutes);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="attendant-route-wait">{t("Prazo máximo (minutos)")}</Label>
        <Input
          id="attendant-route-wait"
          type="number"
          min={5}
          max={1440}
          value={maxWait}
          onChange={(event) => {
            const next = Number(event.target.value);
            setMaxWait(next);
            const parsed = attendantRouteConfigSchema.safeParse({ max_wait_minutes: next });
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? t("Prazo inválido."));
              return;
            }
            setError(null);
            onChange(parsed.data);
          }}
        />
        <p className="text-xs text-text-muted">
          {t("Usa o rodízio configurado no canal e só continua após a atribuição ser confirmada.")}
        </p>
      </div>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
