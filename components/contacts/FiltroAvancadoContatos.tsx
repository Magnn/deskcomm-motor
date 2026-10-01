"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipDeEtiqueta } from "@/components/tags/ChipDeEtiqueta";
import { SlidersHorizontal, ArrowsClockwise, Check } from "@/lib/ui/icons";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import type { ContactOrderBy } from "@/lib/schemas/contacts";

export interface FiltrosAvancadosState {
  tag?: string;
  source?: string;
  statusCliente?: "todos" | "cliente" | "nao_cliente";
  bloqueado?: "todos" | "ativo" | "bloqueado";
  campoPersonalizado?: {
    chave: string;
    operador: "preenchido" | "vazio" | "contem";
    valor?: string;
  };
  orderBy?: ContactOrderBy;
  orderDir?: "asc" | "desc";
}

interface Props {
  filtros: FiltrosAvancadosState;
  aoMudarFiltros: (novosFiltros: FiltrosAvancadosState) => void;
  tagsDisponiveis: string[];
  opcoesOrigem: Array<{ value: string | undefined; label: string }>;
  camposPersonalizados?: CustomFieldDef[];
  clientesLigado?: boolean;
}

export function FiltroAvancadoContatos({
  filtros,
  aoMudarFiltros,
  tagsDisponiveis,
  opcoesOrigem,
  camposPersonalizados = [],
  clientesLigado = false,
}: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [estadoLocal, setEstadoLocal] = useState<FiltrosAvancadosState>(filtros);

  // Calcula quantos filtros ativos temos
  let contadorFiltrosAtivos = 0;
  if (filtros.tag) contadorFiltrosAtivos++;
  if (filtros.source) contadorFiltrosAtivos++;
  if (filtros.statusCliente && filtros.statusCliente !== "todos") contadorFiltrosAtivos++;
  if (filtros.bloqueado && filtros.bloqueado !== "todos") contadorFiltrosAtivos++;
  if (filtros.campoPersonalizado?.chave) contadorFiltrosAtivos++;

  function aplicar() {
    aoMudarFiltros(estadoLocal);
    setAberto(false);
  }

  function limpar() {
    const limpos: FiltrosAvancadosState = {
      tag: undefined,
      source: undefined,
      statusCliente: "todos",
      bloqueado: "todos",
      campoPersonalizado: undefined,
      orderBy: filtros.orderBy,
      orderDir: filtros.orderDir,
    };
    setEstadoLocal(limpos);
    aoMudarFiltros(limpos);
    setAberto(false);
  }

  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setEstadoLocal(filtros);
      }}
    >
      <SheetTrigger asChild>
        <Button variant={contadorFiltrosAtivos > 0 ? "default" : "outline"} size="sm" className="gap-2">
          <SlidersHorizontal size={15} weight="bold" aria-hidden />
          <span>{t("Filtros")}</span>
          {contadorFiltrosAtivos > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 rounded-full px-1.5 text-xs font-semibold"
            >
              {contadorFiltrosAtivos}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-primary" aria-hidden />
            <SheetTitle>{t("Filtros avançados")}</SheetTitle>
          </div>
          <SheetDescription>
            {t("Segmentar contatos por múltiplos critérios simultâneos.")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto py-4">
          {/* Seção 1: Tags */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">{t("Tag / Etiqueta")}</Label>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant={!estadoLocal.tag ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setEstadoLocal((s) => ({ ...s, tag: undefined }))}
              >
                {t("Todas")}
              </Button>
              {tagsDisponiveis.map((tg) => {
                const ativa = estadoLocal.tag === tg;
                return (
                  <Button
                    key={tg}
                    variant={ativa ? "default" : "outline"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() =>
                      setEstadoLocal((s) => ({
                        ...s,
                        tag: ativa ? undefined : tg,
                      }))
                    }
                  >
                    <ChipDeEtiqueta tag={tg} />
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Seção 2: Origem */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">{t("Origem")}</Label>
            <Select
              value={estadoLocal.source ?? "todas"}
              onValueChange={(val) =>
                setEstadoLocal((s) => ({
                  ...s,
                  source: val === "todas" ? undefined : val,
                }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder={t("Todas as origens")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">{t("Todas as origens")}</SelectItem>
                {opcoesOrigem
                  .filter((op) => op.value !== undefined)
                  .map((op) => (
                    <SelectItem key={op.value} value={op.value!}>
                      {t(op.label)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Seção 3: Status de Cliente */}
          {clientesLigado && (
            <div className="space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">
                {t("Status de cliente")}
              </Label>
              <Select
                value={estadoLocal.statusCliente ?? "todos"}
                onValueChange={(val: "todos" | "cliente" | "nao_cliente") =>
                  setEstadoLocal((s) => ({ ...s, statusCliente: val }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{t("Todos os contatos")}</SelectItem>
                  <SelectItem value="cliente">{t("Apenas clientes ativos")}</SelectItem>
                  <SelectItem value="nao_cliente">{t("Apenas prospects (não clientes)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seção 4: Status de Bloqueio */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">{t("Status do contato")}</Label>
            <Select
              value={estadoLocal.bloqueado ?? "todos"}
              onValueChange={(val: "todos" | "ativo" | "bloqueado") =>
                setEstadoLocal((s) => ({ ...s, bloqueado: val }))
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">{t("Todos (ativos e bloqueados)")}</SelectItem>
                <SelectItem value="ativo">{t("Apenas ativos (não bloqueados)")}</SelectItem>
                <SelectItem value="bloqueado">{t("Apenas bloqueados")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Seção 5: Filtro por Campo Personalizado */}
          {camposPersonalizados.length > 0 && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">
                {t("Campo personalizado")}
              </Label>
              <Select
                value={estadoLocal.campoPersonalizado?.chave ?? "nenhum"}
                onValueChange={(val) => {
                  if (val === "nenhum") {
                    setEstadoLocal((s) => ({ ...s, campoPersonalizado: undefined }));
                  } else {
                    setEstadoLocal((s) => ({
                      ...s,
                      campoPersonalizado: {
                        chave: val,
                        operador: "preenchido",
                        valor: "",
                      },
                    }));
                  }
                }}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t("Selecione um campo…")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">{t("Nenhum filtro de campo")}</SelectItem>
                  {camposPersonalizados.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {estadoLocal.campoPersonalizado?.chave && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Select
                    value={estadoLocal.campoPersonalizado.operador}
                    onValueChange={(op: "preenchido" | "vazio" | "contem") =>
                      setEstadoLocal((s) => ({
                        ...s,
                        campoPersonalizado: s.campoPersonalizado
                          ? { ...s.campoPersonalizado, operador: op }
                          : undefined,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preenchido">{t("Está preenchido")}</SelectItem>
                      <SelectItem value="vazio">{t("Está vazio")}</SelectItem>
                      <SelectItem value="contem">{t("Contém texto")}</SelectItem>
                    </SelectContent>
                  </Select>

                  {estadoLocal.campoPersonalizado.operador === "contem" && (
                    <Input
                      placeholder={t("Valor…")}
                      value={estadoLocal.campoPersonalizado.valor ?? ""}
                      onChange={(e) =>
                        setEstadoLocal((s) => ({
                          ...s,
                          campoPersonalizado: s.campoPersonalizado
                            ? { ...s.campoPersonalizado, valor: e.target.value }
                            : undefined,
                        }))
                      }
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="border-t border-border pt-4 sm:flex-row sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={limpar}
            disabled={contadorFiltrosAtivos === 0}
            className="gap-1.5 text-xs text-muted-foreground"
          >
            <ArrowsClockwise size={14} aria-hidden />
            <span>{t("Limpar filtros")}</span>
          </Button>

          <Button size="sm" onClick={aplicar} className="gap-1.5">
            <Check size={14} weight="bold" aria-hidden />
            <span>{t("Aplicar")}</span>
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
