"use client";
/**
 * Um lançamento por dentro: o link do anúncio, os grupos e os disparos.
 *
 * A tela se atualiza sozinha a cada meio minuto — durante um lançamento a
 * contagem dos grupos muda sem ninguém clicar em nada, e é ela que a pessoa vem
 * olhar.
 */
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { DetalheDoLancamento as Detalhe, DisparoDoLancamento } from "@/lib/lancamentos/consultas";
import { MAXIMO_DE_ITENS_DO_DISPARO, type ItemDoDisparo } from "@/lib/lancamentos/schemas";
import { ArrowLeft, Copy, PaperPlaneTilt, Pause, Play, Plus, Trash, UploadSimple } from "@/lib/ui/icons";

import { CHAVE_DOS_LANCAMENTOS, rotuloDoStatusDoLancamento } from "../_client";

const ROTULO_DO_GRUPO: Record<string, string> = { open: "Com vaga", full: "Lotado", closed: "Fechado" };
const ROTULO_DO_DISPARO: Record<DisparoDoLancamento["status"], string> = {
  scheduled: "Agendado",
  sending: "Enviando",
  sent: "Enviado",
  failed: "Falhou",
  cancelled: "Cancelado",
};
const ROTULO_DO_ITEM: Record<ItemDoDisparo["type"], string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Arquivo",
  delay: "Pausa",
};

function copiar(texto: string, aviso: string) {
  void navigator.clipboard.writeText(texto).then(
    () => toast.success(aviso),
    () => toast.error(texto),
  );
}

export function DetalheDoLancamento({ id }: { id: string }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const qc = useQueryClient();
  const chave = ["lancamento", id];
  const caminho = `/api/v1/lancamentos/${id}`;

  const q = useQuery({
    queryKey: chave,
    queryFn: () => apiClient.get<{ data: Detalhe }>(caminho),
    refetchInterval: 30_000,
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: chave });
    void qc.invalidateQueries({ queryKey: CHAVE_DOS_LANCAMENTOS });
  };

  const mudarStatus = useMutation({
    mutationFn: (status: "active" | "paused" | "archived") => apiClient.patch(caminho, { status }),
    onSuccess: recarregar,
    onError: (err) => showApiError(err),
  });
  const abrirGrupo = useMutation({
    mutationFn: () => apiClient.post(`${caminho}/grupos`, {}),
    onSuccess: () => {
      toast.success(t("Grupo aberto."));
      recarregar();
    },
    onError: (err) => showApiError(err),
  });
  const mudarGrupo = useMutation({
    mutationFn: (p: { group_id: string; status: "open" | "closed" }) => apiClient.patch(`${caminho}/grupos`, p),
    onSuccess: recarregar,
    onError: (err) => showApiError(err),
  });
  const cancelarDisparo = useMutation({
    mutationFn: (disparoId: string) => apiClient.delete(`${caminho}/disparos?disparo=${disparoId}`),
    onSuccess: () => {
      toast.success(t("Disparo cancelado."));
      recarregar();
    },
    onError: (err) => showApiError(err),
  });

  if (q.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Não foi possível carregar o lançamento.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      </div>
    );
  }

  const { lancamento, link, grupos, participantes, cliques, disparos } = q.data.data;
  const encerrado = lancamento.status === "archived";
  const quando = (iso: string) =>
    new Intl.DateTimeFormat(idioma, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/lancamentos" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ArrowLeft size={12} aria-hidden />
            {t("Lançamentos")}
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{lancamento.name}</h1>
            <Badge variant={lancamento.status === "active" ? "success" : "neutral"}>{t(rotuloDoStatusDoLancamento(lancamento.status))}</Badge>
          </div>
        </div>
        {!encerrado && (
          <div className="flex shrink-0 items-center gap-2">
            {lancamento.status === "active" ? (
              <Button variant="outline" disabled={mudarStatus.isPending} onClick={() => mudarStatus.mutate("paused")}>
                <Pause size={16} aria-hidden />
                <span>{t("Pausar")}</span>
              </Button>
            ) : (
              <Button disabled={mudarStatus.isPending} onClick={() => mudarStatus.mutate("active")}>
                <Play size={16} aria-hidden />
                <span>{t("Retomar")}</span>
              </Button>
            )}
            <Button
              variant="outline"
              disabled={mudarStatus.isPending}
              onClick={() => {
                if (window.confirm(t("Encerrar o lançamento? O link deixa de funcionar e os disparos agendados não saem. Os grupos continuam existindo no WhatsApp."))) {
                  mudarStatus.mutate("archived");
                }
              }}
            >
              {t("Encerrar")}
            </Button>
          </div>
        )}
      </header>

      {lancamento.status === "paused" && (
        <p className="rounded-md border border-border bg-warning-bg p-3 text-sm text-warning-fg">
          {t("Lançamento pausado: o link mostra uma página de espera e os disparos agendados aguardam você retomar.")}
        </p>
      )}

      <Card className="p-5" data-testid="link-do-lancamento">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t("Link do anúncio")}</Label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">{link}</code>
          <Button variant="outline" onClick={() => copiar(link, t("Link copiado."))}>
            <Copy size={16} aria-hidden />
            <span>{t("Copiar")}</span>
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Use este link no anúncio e na página de captura. Ele manda cada pessoa para o grupo que ainda tem vaga e abre o próximo grupo sozinho.")}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-center">
          <Total rotulo={t("Cliques no link")} valor={cliques} />
          <Total rotulo={t("Pessoas nos grupos")} valor={participantes} />
          <Total rotulo={t("Grupos")} valor={grupos.length} />
        </dl>
      </Card>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Grupos")}</h2>
          {!encerrado && (
            <Button size="sm" variant="outline" disabled={abrirGrupo.isPending} onClick={() => abrirGrupo.mutate()}>
              <Plus size={14} weight="bold" aria-hidden />
              <span>{abrirGrupo.isPending ? t("Abrindo…") : t("Abrir próximo grupo")}</span>
            </Button>
          )}
        </div>
        <Card className="divide-y divide-border">
          {grupos.map((g) => (
            <div key={g.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`grupo-${g.position}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{g.name}</span>
                  <Badge variant={g.status === "open" ? "success" : g.status === "full" ? "warning" : "neutral"}>
                    {t(ROTULO_DO_GRUPO[g.status] ?? g.status)}
                  </Badge>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {`${g.members_count} / ${lancamento.group_capacity} ${t("pessoas")}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {g.invite_url && (
                  <Button size="sm" variant="outline" onClick={() => copiar(g.invite_url!, t("Convite copiado."))}>
                    <Copy size={14} aria-hidden />
                    <span>{t("Convite")}</span>
                  </Button>
                )}
                {!encerrado && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={mudarGrupo.isPending}
                    onClick={() => mudarGrupo.mutate({ group_id: g.id, status: g.status === "closed" ? "open" : "closed" })}
                  >
                    {g.status === "closed" ? t("Reabrir") : t("Fechar")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
        <p className="text-xs text-muted-foreground">
          {t("Grupo fechado sai do link e não recebe disparo. Fechar aqui não remove ninguém nem apaga o grupo no WhatsApp.")}
        </p>
      </section>

      {!encerrado && <NovoDisparo id={id} gruposQueRecebem={grupos.filter((g) => g.status !== "closed").length} onCriado={recarregar} />}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Disparos")}</h2>
        {disparos.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">{t("Nenhum disparo ainda.")}</Card>
        ) : (
          <Card className="divide-y divide-border">
            {disparos.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`disparo-${d.id}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium tabular-nums">{quando(d.scheduled_at)}</span>
                    <Badge variant={d.status === "sent" ? "success" : d.status === "failed" ? "error" : d.status === "cancelled" ? "neutral" : "info"}>
                      {t(ROTULO_DO_DISPARO[d.status])}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{resumoDosItens(d.items, t)}</p>
                  {(d.enviados > 0 || d.falhas > 0 || d.pendentes > 0) && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {`${d.enviados} ${t("grupo(s) receberam")}`}
                      {d.falhas > 0 ? ` · ${d.falhas} ${t("falharam")}` : ""}
                      {d.pendentes > 0 ? ` · ${d.pendentes} ${t("na fila")}` : ""}
                    </p>
                  )}
                </div>
                {d.status === "scheduled" && (
                  <Button size="sm" variant="outline" disabled={cancelarDisparo.isPending} onClick={() => cancelarDisparo.mutate(d.id)}>
                    {t("Cancelar")}
                  </Button>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function Total({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div>
      <dd className="text-xl font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</dd>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
    </div>
  );
}

function resumoDosItens(itens: unknown, t: (texto: string) => string): string {
  if (!Array.isArray(itens)) return "";
  return (itens as ItemDoDisparo[])
    .filter((i) => i.type !== "delay")
    .map((i) => (i.type === "text" ? i.body.replace(/\s+/g, " ").slice(0, 80) : t(ROTULO_DO_ITEM[i.type])))
    .join(" · ");
}

type Rascunho = ItemDoDisparo & { chave: string; nomeDoArquivo?: string };

/** Data e hora locais no formato do campo `datetime-local`. */
function agoraParaOCampo(maisMinutos = 0): string {
  const d = new Date(Date.now() + maisMinutos * 60_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function NovoDisparo({ id, gruposQueRecebem, onCriado }: { id: string; gruposQueRecebem: number; onCriado: () => void }) {
  const t = useT();
  const [itens, setItens] = useState<Rascunho[]>([{ chave: "i0", type: "text", body: "" }]);
  const [agendar, setAgendar] = useState(false);
  const [quando, setQuando] = useState(() => agoraParaOCampo(10));
  const [subindo, setSubindo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const proxima = useRef(1);
  const novaChave = () => `i${proxima.current++}`;

  const cheio = itens.length >= MAXIMO_DE_ITENS_DO_DISPARO;
  const temMensagem = itens.some((i) => (i.type === "text" ? i.body.trim() !== "" : i.type !== "delay"));
  const textoVazio = itens.some((i) => i.type === "text" && i.body.trim() === "");

  const trocar = (chave: string, patch: Partial<Rascunho>) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? ({ ...i, ...patch } as Rascunho) : i)));
  const remover = (chave: string) => setItens((atual) => atual.filter((i) => i.chave !== chave));

  async function subir(arquivo: File) {
    setSubindo(true);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(`/api/v1/lancamentos/${id}/midia`, { method: "POST", body: form });
      const corpo = (await res.json().catch(() => null)) as
        | { data?: { storage_path: string; mime: string; kind: string; filename: string | null }; error?: { message?: string } }
        | null;
      if (!res.ok || !corpo?.data) {
        toast.error(corpo?.error?.message ?? t("Não foi possível subir o arquivo."));
        return;
      }
      const { storage_path, mime, kind, filename } = corpo.data;
      const tipo = kind === "image" || kind === "video" || kind === "audio" ? kind : "document";
      const base = { chave: novaChave(), storage_path, mime, nomeDoArquivo: filename ?? arquivo.name };
      const item: Rascunho =
        tipo === "document"
          ? { ...base, type: "document", ...(filename ? { filename } : {}) }
          : tipo === "audio"
            ? { ...base, type: "audio" }
            : { ...base, type: tipo };
      setItens((atual) => [...atual, item]);
    } finally {
      setSubindo(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  const disparar = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/v1/lancamentos/${id}/disparos`, {
        items: itens.map(({ chave: _chave, nomeDoArquivo: _nome, ...item }) =>
          item.type === "text" ? { ...item, body: item.body.trim() } : item,
        ),
        ...(agendar ? { scheduled_at: new Date(quando).toISOString() } : {}),
      }),
    onSuccess: () => {
      toast.success(agendar ? t("Disparo agendado.") : t("Disparo na fila — sai em até um minuto."));
      setItens([{ chave: novaChave(), type: "text", body: "" }]);
      setAgendar(false);
      onCriado();
    },
    onError: (err) => showApiError(err),
  });

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Novo disparo")}</h2>
      <Card className="space-y-3 p-4" data-testid="novo-disparo">
        {itens.map((item) => (
          <div key={item.chave} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {item.type === "text" ? (
                <Textarea
                  value={item.body}
                  onChange={(e) => trocar(item.chave, { body: e.target.value })}
                  rows={3}
                  maxLength={4000}
                  placeholder={t("Escreva a mensagem que vai para todos os grupos.")}
                  aria-label={t("Mensagem")}
                />
              ) : item.type === "delay" ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("Esperar")}</span>
                  <Input
                    className="w-20"
                    inputMode="numeric"
                    value={String(item.seconds)}
                    onChange={(e) => trocar(item.chave, { seconds: Math.min(60, Math.max(1, Number(e.target.value.replace(/\D/g, "")) || 1)) })}
                    aria-label={t("Segundos de espera")}
                  />
                  <span className="text-muted-foreground">{t("segundos antes da próxima mensagem")}</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="truncate rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">
                    <span className="font-medium">{t(ROTULO_DO_ITEM[item.type])}</span>
                    {item.nomeDoArquivo ? ` — ${item.nomeDoArquivo}` : ""}
                  </p>
                  {(item.type === "image" || item.type === "video" || item.type === "document") && (
                    <Input
                      value={item.caption ?? ""}
                      onChange={(e) => trocar(item.chave, { caption: e.target.value || undefined })}
                      maxLength={1024}
                      placeholder={t("Legenda (opcional)")}
                      aria-label={t("Legenda")}
                    />
                  )}
                </div>
              )}
            </div>
            {itens.length > 1 && (
              <Button size="sm" variant="outline" onClick={() => remover(item.chave)} aria-label={t("Remover")}>
                <Trash size={14} aria-hidden />
              </Button>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" disabled={cheio} onClick={() => setItens((a) => [...a, { chave: novaChave(), type: "text", body: "" }])}>
            <Plus size={14} weight="bold" aria-hidden />
            <span>{t("Texto")}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={cheio || subindo} onClick={() => arquivoRef.current?.click()}>
            <UploadSimple size={14} aria-hidden />
            <span>{subindo ? t("Subindo…") : t("Imagem, vídeo, áudio ou arquivo")}</span>
          </Button>
          <Button size="sm" variant="outline" disabled={cheio} onClick={() => setItens((a) => [...a, { chave: novaChave(), type: "delay", seconds: 5 }])}>
            <Plus size={14} weight="bold" aria-hidden />
            <span>{t("Pausa")}</span>
          </Button>
          <input
            ref={arquivoRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void subir(arquivo);
            }}
          />
        </div>

        <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="quando" checked={!agendar} onChange={() => setAgendar(false)} />
              {t("Enviar agora")}
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="quando" checked={agendar} onChange={() => setAgendar(true)} />
              {t("Agendar")}
            </label>
            {agendar && (
              <Input
                type="datetime-local"
                className="w-auto"
                value={quando}
                min={agoraParaOCampo()}
                onChange={(e) => setQuando(e.target.value)}
                aria-label={t("Data e hora do disparo")}
              />
            )}
          </div>
          <Button
            disabled={!temMensagem || textoVazio || gruposQueRecebem === 0 || disparar.isPending || subindo || (agendar && !quando)}
            onClick={() => disparar.mutate()}
          >
            <PaperPlaneTilt size={16} aria-hidden />
            <span>{`${agendar ? t("Agendar para") : t("Enviar para")} ${gruposQueRecebem} ${t("grupo(s)")}`}</span>
          </Button>
        </div>
      </Card>
    </section>
  );
}
