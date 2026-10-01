"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  PencilSimple,
  Trash,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Check,
} from "@/lib/ui/icons";
import { updatePipelineConfig } from "@/app/actions/settings/updatePipelineConfig";
import type { CustomFieldDef, CustomFieldType } from "@/components/contacts/CustomFieldsEditor";

const TIPOS_DE_CAMPO: Array<{ tipo: CustomFieldType; rotulo: string }> = [
  { tipo: "text", rotulo: "Texto curto" },
  { tipo: "textarea", rotulo: "Texto longo (área de texto)" },
  { tipo: "number", rotulo: "Número" },
  { tipo: "date", rotulo: "Data" },
  { tipo: "boolean", rotulo: "Sim / Não (Booleano)" },
  { tipo: "select", rotulo: "Seleção única (Dropdown)" },
  { tipo: "multiselect", rotulo: "Múltipla seleção" },
  { tipo: "email", rotulo: "E-mail" },
  { tipo: "phone", rotulo: "Telefone" },
  { tipo: "url", rotulo: "Link / URL" },
];

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface Props {
  pipelineId: string;
  initialFields: CustomFieldDef[];
  pipelineName: string;
}

export function CustomFieldsSettingsClient({
  pipelineId,
  initialFields,
  pipelineName,
}: Props) {
  const t = useT();
  const [fields, setFields] = useState<CustomFieldDef[]>(initialFields);
  const [isPending, startTransition] = useTransition();

  // Estado do diálogo de criação / edição
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form local
  const [formKey, setFormKey] = useState("");
  const [formLabel, setFormLabel] = useState("");
  const [formType, setFormType] = useState<CustomFieldType>("text");
  const [formRequired, setFormRequired] = useState(false);
  const [formOptionsText, setFormOptionsText] = useState("");

  function abrirCriacao() {
    setEditingIndex(null);
    setFormKey("");
    setFormLabel("");
    setFormType("text");
    setFormRequired(false);
    setFormOptionsText("");
    setDialogOpen(true);
  }

  function abrirEdicao(index: number) {
    const f = fields[index];
    if (!f) return;
    setEditingIndex(index);
    setFormKey(f.key);
    setFormLabel(f.label);
    setFormType(f.type);
    setFormRequired(Boolean(f.required));
    setFormOptionsText((f.options ?? []).map((o) => o.label).join(", "));
    setDialogOpen(true);
  }

  function handleLabelChange(val: string) {
    setFormLabel(val);
    if (editingIndex === null && !formKey) {
      setFormKey(slugify(val));
    }
  }

  async function salvarLista(novosCampos: CustomFieldDef[]) {
    startTransition(async () => {
      const res = await updatePipelineConfig(pipelineId, {
        fields: novosCampos,
      });
      if (res.ok) {
        setFields(novosCampos);
        toast.success(t("Campos personalizados atualizados com sucesso."));
      } else {
        toast.error(t("Erro ao salvar:") + " " + res.error);
      }
    });
  }

  function salvarForm() {
    if (!formLabel.trim()) {
      toast.error(t("O rótulo do campo é obrigatório."));
      return;
    }
    const finalKey = formKey.trim() || slugify(formLabel);
    if (!finalKey) {
      toast.error(t("A chave do campo é obrigatória."));
      return;
    }

    // Valida duplicidade de chave
    const jaExiste = fields.some(
      (f, idx) => f.key.toLowerCase() === finalKey.toLowerCase() && idx !== editingIndex
    );
    if (jaExiste) {
      toast.error(t("Já existe um campo com esta chave identificadora."));
      return;
    }

    const temOpcoes = formType === "select" || formType === "multiselect";
    const options = temOpcoes
      ? formOptionsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((opt) => ({ value: slugify(opt) || opt, label: opt }))
      : undefined;

    const novoCampo: CustomFieldDef = {
      key: finalKey,
      label: formLabel.trim(),
      type: formType,
      required: formRequired,
      ...(options ? { options } : {}),
    };

    let novos: CustomFieldDef[];
    if (editingIndex !== null) {
      novos = [...fields];
      novos[editingIndex] = novoCampo;
    } else {
      novos = [...fields, novoCampo];
    }

    setDialogOpen(false);
    salvarLista(novos);
  }

  function removerCampo(index: number) {
    const f = fields[index];
    if (!confirm(t(`Deseja remover o campo "${f?.label}"?`))) return;
    const novos = fields.filter((_, idx) => idx !== index);
    salvarLista(novos);
  }

  function mover(index: number, direcao: -1 | 1) {
    const dest = index + direcao;
    if (dest < 0 || dest >= fields.length) return;
    const novos = [...fields];
    const temp = novos[index];
    novos[index] = novos[dest]!;
    novos[dest] = temp!;
    salvarLista(novos);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {t("Funil vinculado:")} <span className="font-medium text-foreground">{pipelineName}</span>
          </p>
        </div>
        <Button onClick={abrirCriacao} size="sm" className="gap-1.5 self-start sm:self-auto">
          <Plus size={16} weight="bold" aria-hidden />
          <span>{t("Novo campo")}</span>
        </Button>
      </div>

      {fields.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <ListChecks size={40} className="text-muted-foreground opacity-40" aria-hidden />
          <h3 className="mt-3 text-base font-semibold">{t("Nenhum campo personalizado cadastrado")}</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {t("Campos personalizados permitem coletar dados sob medida dos contatos (como CPF, profissão, segmento ou datas).")}
          </p>
          <Button onClick={abrirCriacao} size="sm" className="mt-4 gap-1.5">
            <Plus size={15} weight="bold" aria-hidden />
            <span>{t("Criar primeiro campo")}</span>
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {fields.map((campo, index) => {
            const rotuloTipo = TIPOS_DE_CAMPO.find((tc) => tc.tipo === campo.type)?.rotulo ?? campo.type;
            return (
              <Card
                key={campo.key}
                className="flex items-center justify-between gap-4 p-4 transition-colors hover:border-border-strong"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{campo.label}</h3>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {campo.key}
                    </code>
                    <Badge variant="outline" className="text-xs">
                      {rotuloTipo}
                    </Badge>
                    {campo.required && (
                      <Badge variant="destructive" className="text-xs">
                        {t("Obrigatório")}
                      </Badge>
                    )}
                  </div>

                  {campo.options && campo.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">{t("Opções:")}</span>
                      {campo.options.map((opt) => (
                        <Badge key={opt.value} variant="secondary" className="text-xs font-normal">
                          {opt.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => mover(index, -1)}
                    disabled={index === 0 || isPending}
                    title={t("Mover para cima")}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => mover(index, 1)}
                    disabled={index === fields.length - 1 || isPending}
                    title={t("Mover para baixo")}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => abrirEdicao(index)}
                    disabled={isPending}
                    title={t("Editar")}
                  >
                    <PencilSimple size={15} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removerCampo(index)}
                    disabled={isPending}
                    title={t("Excluir")}
                  >
                    <Trash size={15} aria-hidden />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog de Criação / Edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? t("Editar campo personalizado") : t("Novo campo personalizado")}
            </DialogTitle>
            <DialogDescription>
              {t("Defina o nome, identificador e o tipo de entrada para os dados.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="field-label">{t("Nome do campo (Rótulo)")}</Label>
              <Input
                id="field-label"
                placeholder={t("Ex: Cargo, CPF, Origem da indicação…")}
                value={formLabel}
                onChange={(e) => handleLabelChange(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="field-key">
                {t("Chave identificadora")}{" "}
                <span className="text-xs text-muted-foreground">({t("usada em automações e APIs")})</span>
              </Label>
              <Input
                id="field-key"
                placeholder="cargo"
                value={formKey}
                onChange={(e) => setFormKey(slugify(e.target.value))}
                className="font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("Tipo do dado")}</Label>
              <Select
                value={formType}
                onValueChange={(val: CustomFieldType) => setFormType(val)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_DE_CAMPO.map((tc) => (
                    <SelectItem key={tc.tipo} value={tc.tipo}>
                      {tc.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(formType === "select" || formType === "multiselect") && (
              <div className="space-y-1.5">
                <Label htmlFor="field-options">
                  {t("Opções")} <span className="text-xs text-muted-foreground">({t("separadas por vírgula")})</span>
                </Label>
                <Input
                  id="field-options"
                  placeholder="Opção 1, Opção 2, Opção 3"
                  value={formOptionsText}
                  onChange={(e) => setFormOptionsText(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="field-required" className="text-sm font-medium">
                  {t("Campo obrigatório")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("Exige preenchimento ao salvar o contato.")}
                </p>
              </div>
              <Switch
                id="field-required"
                checked={formRequired}
                onCheckedChange={setFormRequired}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button size="sm" onClick={salvarForm} disabled={isPending} className="gap-1.5">
              <Check size={14} weight="bold" aria-hidden />
              <span>{t("Salvar campo")}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
