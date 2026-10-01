"use client";

import { useT } from "@/hooks/i18n/useT";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PencilSimple, SlidersHorizontal } from "@/lib/ui/icons";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";

interface Props {
  customFields?: Record<string, unknown> | null;
  customFieldDefs?: CustomFieldDef[];
  onEdit?: () => void;
  canEdit?: boolean;
}

export function ContactCustomFieldsView({
  customFields = {},
  customFieldDefs = [],
  onEdit,
  canEdit = true,
}: Props) {
  const t = useT();
  const fields = customFields ?? {};

  // Mapeia os campos definidos
  const defMap = new Map<string, CustomFieldDef>();
  for (const d of customFieldDefs) {
    defMap.set(d.key, d);
  }

  // Lista de chaves a exibir: combina os definidos + chaves presentes no objeto
  const allKeys = Array.from(
    new Set([...customFieldDefs.map((d) => d.key), ...Object.keys(fields)])
  ).filter((k) => k.trim() !== "");

  const populatedEntries = allKeys.map((key) => {
    const def = defMap.get(key);
    const label = def?.label ?? key;
    const value = fields[key];
    const type = def?.type ?? "text";
    return { key, label, value, type, def };
  });

  const hasAnyValue = populatedEntries.some(
    (e) => e.value !== undefined && e.value !== null && e.value !== ""
  );

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-muted-foreground" aria-hidden />
          <h2 className="text-sm font-semibold tracking-tight">{t("Campos personalizados")}</h2>
          {hasAnyValue && (
            <Badge variant="outline" className="text-xs">
              {populatedEntries.filter((e) => e.value !== undefined && e.value !== null && e.value !== "").length}
            </Badge>
          )}
        </div>
        {canEdit && onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-8 gap-1 text-xs">
            <PencilSimple size={14} weight="bold" aria-hidden />
            <span>{t("Editar campos")}</span>
          </Button>
        )}
      </div>

      {!hasAnyValue ? (
        <div className="py-6 text-center text-sm text-muted-foreground">
          <p>{t("Nenhum campo personalizado preenchido para este contato.")}</p>
          {canEdit && onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit} className="mt-3 text-xs">
              <PencilSimple size={14} className="mr-1" aria-hidden />
              {t("Preencher campos")}
            </Button>
          )}
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:grid-cols-3">
          {populatedEntries.map(({ key, label, value, type, def }) => {
            const hasVal = value !== undefined && value !== null && value !== "";
            if (!hasVal) return null;

            return (
              <div key={key} className="space-y-1">
                <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
                <dd className="break-words font-medium">
                  {renderValue(value, type, def, t)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </Card>
  );
}

function renderValue(
  value: unknown,
  type: string,
  def: CustomFieldDef | undefined,
  t: (text: string) => string
) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }

  if (typeof value === "boolean" || type === "boolean") {
    return (
      <Badge variant={value ? "default" : "outline"} className="text-xs font-normal">
        {value ? t("Sim") : t("Não")}
      </Badge>
    );
  }

  if (type === "url" && typeof value === "string") {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline hover:opacity-80"
      >
        {value}
      </a>
    );
  }

  if (type === "select" || type === "multiselect") {
    if (Array.isArray(value)) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => {
            const opt = def?.options?.find((o) => o.value === String(v));
            return (
              <Badge key={String(v)} variant="secondary" className="text-xs">
                {opt?.label ?? String(v)}
              </Badge>
            );
          })}
        </div>
      );
    }
    const opt = def?.options?.find((o) => o.value === String(value));
    return (
      <Badge variant="secondary" className="text-xs">
        {opt?.label ?? String(value)}
      </Badge>
    );
  }

  if (type === "date" && typeof value === "string") {
    try {
      const [year, month, day] = value.split("-");
      if (year && month && day) {
        return `${day}/${month}/${year}`;
      }
    } catch {
      // fallback
    }
  }

  if (typeof value === "object") {
    return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  }

  return <span>{String(value)}</span>;
}
