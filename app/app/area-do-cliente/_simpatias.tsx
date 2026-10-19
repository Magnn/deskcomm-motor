"use client";
/**
 * A aba SIMPATIAS do painel da área do cliente (migration 0941): a fila do "o templo faz por mim" — os pedidos
 * pagos que faltam fazer, do mais antigo ao mais novo, com o botão de marcar como feito e um recado para a
 * pessoa — e o catálogo das simpatias que aparecem na área.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { PencilSimple, Plus, Trash } from "@/lib/ui/icons";

export interface SimpatiaDoPainel {
  id: string;
  titulo: string;
  intencao: string;
  materiais: string | null;
  passos: string;
  cuidado: string | null;
  publicada: boolean;
  posicao: number;
}

export interface PedidoDoPainel {
  id: string;
  contact_id: string;
  nome: string | null;
  titulo: string;
  para_quem: string | null;
  valor_cents: number;
  pago_at: string;
  feita_at: string | null;
  nota: string | null;
}

export type FilaDeSimpatias = { a_fazer: PedidoDoPainel[]; feitos: PedidoDoPainel[] };

/** A fila, para a aba e para o número no título da aba. */
export function useFilaDeSimpatias() {
  return useQuery({
    queryKey: ["area", "simpatias", "pedidos"],
    queryFn: () => apiClient.get<{ data: FilaDeSimpatias }>("/api/v1/area/simpatias/pedidos"),
    refetchInterval: 60_000,
  });
}

function PedidoAFazer({ p }: { p: PedidoDoPainel }) {
  const t = useT();
  const tag = useTagDeIdioma();
  const qc = useQueryClient();
  const [nota, setNota] = useState("");
  const feita = useMutation({
    mutationFn: () => apiClient.patch(`/api/v1/area/simpatias/pedidos/${p.id}`, nota.trim() ? { nota: nota.trim() } : {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area", "simpatias", "pedidos"] });
      toast.success(t("Marcada como feita. A pessoa vê na área dela."));
    },
    onError: showApiError,
  });
  return (
    <Card className="space-y-2 p-4" data-testid="area-simpatia-a-fazer">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{p.titulo}</span>
        <span className="text-xs text-muted-foreground">
          {t("Pago em")} {new Date(p.pago_at).toLocaleString(tag, { dateStyle: "short", timeStyle: "short" })}
        </span>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">{t("Para:")}</span> {p.nome ?? t("Cliente")}
      </p>
      {p.para_quem ? (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("Intenção:")}</span> {p.para_quem}
        </p>
      ) : null}
      <Textarea
        aria-label={t("Recado para a pessoa (opcional)")}
        placeholder={t("Recado para a pessoa (opcional). Ex.: acendemos a vela hoje às 21h com a sua intenção.")}
        value={nota}
        maxLength={500}
        rows={2}
        onChange={(e) => setNota(e.target.value)}
      />
      <Button onClick={() => feita.mutate()} disabled={feita.isPending} data-testid="area-simpatia-marcar-feita">
        {t("Marcar como feita")}
      </Button>
    </Card>
  );
}

export function AbaSimpatias() {
  const t = useT();
  const tag = useTagDeIdioma();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<SimpatiaDoPainel | "nova" | null>(null);
  const fila = useFilaDeSimpatias();
  const catalogo = useQuery({
    queryKey: ["area", "simpatias", "catalogo"],
    queryFn: () => apiClient.get<{ data: SimpatiaDoPainel[] }>("/api/v1/area/simpatias"),
  });
  const remover = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/area/simpatias/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area", "simpatias"] });
      toast.success(t("Simpatia removida."));
    },
    onError: showApiError,
  });
  const aFazer = fila.data?.data.a_fazer ?? [];
  const feitos = fila.data?.data.feitos ?? [];
  const simpatias = catalogo.data?.data ?? [];

  return (
    <div className="space-y-6 pt-2">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t("Para o templo fazer")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("Pedidos já pagos de \"o templo faz por mim\", do mais antigo ao mais novo. Ao marcar como feita, a pessoa vê a data e o seu recado na área dela.")}
          </p>
        </div>
        {fila.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : aFazer.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t("Nenhum pedido esperando.")}</Card>
        ) : (
          aFazer.map((p) => <PedidoAFazer key={p.id} p={p} />)
        )}
        {feitos.length > 0 ? (
          <details className="rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {t("Feitas nos últimos 30 dias")} ({feitos.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {feitos.map((p) => (
                <li key={p.id} className="text-muted-foreground">
                  {p.feita_at ? new Date(p.feita_at).toLocaleDateString(tag) : ""} · {p.titulo} · {p.nome ?? t("Cliente")}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">{t("Simpatias da área")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("Cada simpatia aparece na área com o passo a passo para fazer em casa e o botão \"o templo faz por mim\". Escreva como cuidado com a intenção, sem prometer resultado.")}
            </p>
          </div>
          <Button onClick={() => setEditando("nova")} data-testid="area-nova-simpatia">
            <Plus size={16} weight="bold" aria-hidden />
            <span>{t("Nova simpatia")}</span>
          </Button>
        </div>
        {catalogo.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : simpatias.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">{t("Nenhuma simpatia ainda.")}</Card>
        ) : (
          simpatias.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{s.titulo}</span>
                  {!s.publicada ? <Badge variant="neutral">{t("Escondida")}</Badge> : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">{s.intencao}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label={t("Editar")} onClick={() => setEditando(s)}>
                  <PencilSimple size={16} aria-hidden />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t("Remover")}
                  disabled={remover.isPending}
                  onClick={() => {
                    if (window.confirm(t("Remover esta simpatia da área? Os pedidos já feitos continuam no histórico."))) remover.mutate(s.id);
                  }}
                >
                  <Trash size={16} aria-hidden />
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>
      {editando ? <EditorDeSimpatia simpatia={editando === "nova" ? null : editando} onClose={() => setEditando(null)} /> : null}
    </div>
  );
}

function EditorDeSimpatia({ simpatia, onClose }: { simpatia: SimpatiaDoPainel | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(simpatia?.titulo ?? "");
  const [intencao, setIntencao] = useState(simpatia?.intencao ?? "");
  const [materiais, setMateriais] = useState(simpatia?.materiais ?? "");
  const [passos, setPassos] = useState(simpatia?.passos ?? "");
  const [cuidado, setCuidado] = useState(simpatia?.cuidado ?? "");
  const [publicada, setPublicada] = useState(simpatia?.publicada ?? true);
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        titulo: titulo.trim(),
        intencao: intencao.trim(),
        materiais: materiais.trim() || null,
        passos: passos.trim(),
        cuidado: cuidado.trim() || null,
        publicada,
      };
      return simpatia ? apiClient.patch(`/api/v1/area/simpatias/${simpatia.id}`, corpo) : apiClient.post("/api/v1/area/simpatias", corpo);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area", "simpatias"] });
      toast.success(t("Simpatia salva."));
      onClose();
    },
    onError: showApiError,
  });

  return (
    <Dialog open onOpenChange={(aberto) => (!aberto ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{simpatia ? t("Editar simpatia") : t("Nova simpatia")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="simp-titulo">{t("Título")}</Label>
            <Input id="simp-titulo" value={titulo} maxLength={80} placeholder={t("Ex.: Simpatia do pote de mel")} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="simp-intencao">{t("Para que é (uma frase)")}</Label>
            <Input id="simp-intencao" value={intencao} maxLength={200} placeholder={t("Ex.: para adoçar a convivência em casa")} onChange={(e) => setIntencao(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="simp-materiais">{t("Materiais")}</Label>
            <Textarea id="simp-materiais" value={materiais} maxLength={600} rows={2} onChange={(e) => setMateriais(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="simp-passos">{t("Passo a passo")}</Label>
            <Textarea id="simp-passos" value={passos} maxLength={4000} rows={6} onChange={(e) => setPassos(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="simp-cuidado">{t("Cuidado (opcional)")}</Label>
            <Textarea
              id="simp-cuidado"
              value={cuidado}
              maxLength={400}
              rows={2}
              placeholder={t("Ex.: nunca deixe a vela acesa sozinha.")}
              onChange={(e) => setCuidado(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="simp-publicada">{t("Aparece para os clientes")}</Label>
            <Switch id="simp-publicada" checked={publicada} onCheckedChange={setPublicada} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !titulo.trim() || !intencao.trim() || !passos.trim()}>
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
