"use client";
/**
 * Instagram — comentou na publicação, recebe uma mensagem no direct.
 *
 * Três blocos: as contas conectadas, as regras e os últimos comentários atendidos.
 * A regra diz em quais publicações vale, quais palavras a acionam, o que vai no
 * direct e (se quiser) o que aparece embaixo do comentário.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { PublicacaoDoInstagram } from "@/lib/channels/instagram/api";
import type { EscopoDasPublicacoes, TipoDeCasamento } from "@/lib/channels/instagram/regras";
import type { ConexaoDoInstagram, EventoDeComentario, RegraSalva } from "@/lib/channels/instagram/repositorio";
import { Plus, Trash } from "@/lib/ui/icons";

interface Retrato {
  configurado: boolean;
  conexoes: ConexaoDoInstagram[];
  regras: RegraSalva[];
  eventos: EventoDeComentario[];
}

const CHAVE = ["instagram"] as const;

/** O recado da volta do consentimento, em frase. */
const MOTIVO_DO_ERRO: Record<string, string> = {
  nao_configurado: "O Instagram não está configurado nesta instalação.",
  sessao_expirada: "A conexão demorou demais e expirou. Clique em Conectar Instagram de novo.",
  recusado: "Você não autorizou o acesso na tela do Instagram.",
  sem_codigo: "O Instagram não devolveu a autorização. Tente de novo.",
  conta_pessoal: "Essa conta é pessoal. Só conta profissional (comercial ou criador de conteúdo) pode ser conectada — mude o tipo da conta no aplicativo do Instagram.",
  conta_de_outra_empresa: "Essa conta do Instagram já está conectada a outra empresa nesta instalação.",
  cifra_indisponivel: "O servidor não conseguiu guardar o acesso com segurança. Fale com quem administra este sistema.",
  avisos_nao_ligados: "A conta foi conectada, mas o Instagram não ligou os avisos de comentário. Reconecte a conta.",
  falha_na_meta: "O Instagram recusou a conexão. Tente de novo em instantes.",
};

const ROTULO_DO_CASAMENTO: Record<TipoDeCasamento, string> = {
  contains: "Contém uma das palavras",
  exact: "É exatamente uma das palavras",
  any: "Qualquer comentário",
};

const ROTULO_DO_ENVIO: Record<string, string> = {
  sent: "Enviado",
  failed: "Falhou",
  pending: "Na fila",
  skipped: "Não enviada",
};

export function InstagramComentarios({ conectado, erro }: { conectado: string | null; erro: string | null }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<RegraSalva | "nova" | null>(null);

  const q = useQuery({ queryKey: CHAVE, queryFn: () => apiClient.get<{ data: Retrato }>("/api/v1/instagram") });
  const recarregar = () => void qc.invalidateQueries({ queryKey: CHAVE });

  const desconectar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/instagram/connections/${id}`),
    onSuccess: () => {
      toast.success(t("Conta desconectada."));
      recarregar();
    },
    onError: (err) => showApiError(err),
  });
  const alternar = useMutation({
    mutationFn: (r: RegraSalva) => apiClient.patch(`/api/v1/instagram/rules/${r.id}`, corpoDaRegra({ ...r, is_active: !r.is_active })),
    onSuccess: recarregar,
    onError: (err) => showApiError(err),
  });
  const apagar = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/instagram/rules/${id}`),
    onSuccess: () => {
      toast.success(t("Regra apagada."));
      recarregar();
    },
    onError: (err) => showApiError(err),
  });

  const dados = q.data?.data;
  const quando = (iso: string) =>
    new Intl.DateTimeFormat(idioma, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Instagram")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Quem comenta numa publicação recebe uma mensagem no direct — e, se você quiser, uma resposta embaixo do comentário.")}
        </p>
      </header>

      {conectado && (
        <p className="rounded-md border border-border bg-success-bg p-3 text-sm text-success-fg" data-testid="instagram-conectado">
          {`${t("Conta conectada:")} @${conectado}`}
        </p>
      )}
      {erro && (
        <p className="rounded-md border border-border bg-error-bg p-3 text-sm text-error-fg" data-testid="instagram-erro">
          {t(MOTIVO_DO_ERRO[erro] ?? "Não foi possível conectar a conta do Instagram.")}
        </p>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : q.isError || !dados ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Não foi possível carregar o Instagram.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : !dados.configurado ? (
        <Card className="max-w-2xl p-6" data-testid="instagram-nao-configurado">
          <h2 className="text-sm font-semibold">{t("O Instagram ainda não foi configurado nesta instalação")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("Quem administra o sistema precisa cadastrar o aplicativo do Instagram no servidor. Depois disso, o botão de conectar a conta aparece aqui.")}
          </p>
        </Card>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Contas")}</h2>
              <Button asChild size="sm">
                {/* Navegação de verdade, não chamada de API: a rota redireciona para o Instagram. */}
                <a href="/api/v1/instagram/oauth/start">
                  <Plus size={14} weight="bold" aria-hidden />
                  <span>{t("Conectar Instagram")}</span>
                </a>
              </Button>
            </div>
            {dados.conexoes.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">
                {t("Nenhuma conta conectada. Conecte uma conta profissional do Instagram para criar as regras.")}
              </Card>
            ) : (
              <Card className="divide-y divide-border">
                {dados.conexoes.map((c) => (
                  <div key={c.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">@{c.username}</span>
                        <Badge variant={c.status === "active" ? "success" : "error"}>
                          {c.status === "active" ? t("Conectada") : t("Precisa reconectar")}
                        </Badge>
                      </div>
                      {c.status !== "active" && c.status_reason && <p className="text-xs text-muted-foreground">{c.status_reason}</p>}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={desconectar.isPending}
                      onClick={() => {
                        if (window.confirm(t("Desconectar esta conta? As regras dela são apagadas junto."))) desconectar.mutate(c.id);
                      }}
                    >
                      {t("Desconectar")}
                    </Button>
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Regras")}</h2>
              <Button size="sm" variant="outline" disabled={dados.conexoes.length === 0} onClick={() => setEditando("nova")}>
                <Plus size={14} weight="bold" aria-hidden />
                <span>{t("Nova regra")}</span>
              </Button>
            </div>
            {dados.regras.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">{t("Nenhuma regra ainda.")}</Card>
            ) : (
              <Card className="divide-y divide-border">
                {dados.regras.map((r) => (
                  <div key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`regra-${r.id}`}>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      <p className="truncate text-xs text-muted-foreground">
                        {`${r.post_scope === "all" ? t("Todas as publicações") : `${r.post_ids.length} ${t("publicação(ões)")}`} · ${t(ROTULO_DO_CASAMENTO[r.match_type])}${r.match_type === "any" ? "" : `: ${r.keywords.join(", ")}`}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch checked={r.is_active} disabled={alternar.isPending} onCheckedChange={() => alternar.mutate(r)} aria-label={t("Regra ligada")} />
                      <Button size="sm" variant="outline" onClick={() => setEditando(r)}>
                        {t("Editar")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={apagar.isPending}
                        aria-label={t("Apagar regra")}
                        onClick={() => {
                          if (window.confirm(t("Apagar esta regra?"))) apagar.mutate(r.id);
                        }}
                      >
                        <Trash size={14} aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Últimos comentários atendidos")}</h2>
            {dados.eventos.length === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground">{t("Nenhum comentário atendido ainda.")}</Card>
            ) : (
              <Card className="divide-y divide-border">
                {dados.eventos.map((e) => (
                  <div key={e.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        <span className="font-medium">{e.from_username ? `@${e.from_username}` : t("Alguém")}</span>
                        <span className="text-muted-foreground">{` — ${e.comment_text ?? ""}`}</span>
                      </p>
                      {e.error && <p className="truncate text-xs text-error-fg">{e.error}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <Badge variant={e.dm_status === "sent" ? "success" : e.dm_status === "failed" ? "error" : "neutral"}>
                        {`${t("Direct:")} ${t(ROTULO_DO_ENVIO[e.dm_status] ?? e.dm_status)}`}
                      </Badge>
                      {e.public_reply_status !== "skipped" && (
                        <Badge variant={e.public_reply_status === "sent" ? "success" : e.public_reply_status === "failed" ? "error" : "neutral"}>
                          {`${t("Resposta pública:")} ${t(ROTULO_DO_ENVIO[e.public_reply_status] ?? e.public_reply_status)}`}
                        </Badge>
                      )}
                      <span className="tabular-nums text-muted-foreground">{quando(e.created_at)}</span>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </section>

          {editando !== null && (
            <EditorDaRegra
              regra={editando === "nova" ? null : editando}
              conexoes={dados.conexoes}
              onClose={() => setEditando(null)}
              onSalva={() => {
                setEditando(null);
                recarregar();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** O corpo que a rota de edição espera: a regra inteira, menos a conta. */
function corpoDaRegra(r: Pick<RegraSalva, "name" | "is_active" | "post_scope" | "post_ids" | "match_type" | "keywords" | "dm_message" | "public_replies">) {
  return {
    name: r.name,
    is_active: r.is_active,
    post_scope: r.post_scope,
    post_ids: r.post_ids,
    match_type: r.match_type,
    keywords: r.keywords,
    dm_message: r.dm_message,
    public_replies: r.public_replies,
  };
}

function EditorDaRegra({
  regra,
  conexoes,
  onClose,
  onSalva,
}: {
  regra: RegraSalva | null;
  conexoes: ConexaoDoInstagram[];
  onClose: () => void;
  onSalva: () => void;
}) {
  const t = useT();
  const [nome, setNome] = useState(regra?.name ?? "");
  const [conta, setConta] = useState(regra?.connection_id ?? conexoes[0]?.id ?? "");
  const [escopo, setEscopo] = useState<EscopoDasPublicacoes>(regra?.post_scope ?? "all");
  const [posts, setPosts] = useState<string[]>(regra?.post_ids ?? []);
  const [casamento, setCasamento] = useState<TipoDeCasamento>(regra?.match_type ?? "contains");
  const [palavras, setPalavras] = useState((regra?.keywords ?? []).join(", "));
  const [direct, setDirect] = useState(regra?.dm_message ?? "");
  const [publicas, setPublicas] = useState((regra?.public_replies ?? []).join("\n"));

  // As publicações só são buscadas quando a pessoa escolhe "publicações específicas".
  const publicacoes = useQuery({
    queryKey: ["instagram", "publicacoes", conta],
    queryFn: () => apiClient.get<{ data: { publicacoes: PublicacaoDoInstagram[] } }>(`/api/v1/instagram/connections/${conta}`),
    enabled: escopo === "specific" && conta !== "",
  });

  const listaDePalavras = palavras
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const listaDePublicas = publicas
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  const pronto =
    nome.trim().length >= 2 &&
    conta !== "" &&
    direct.trim() !== "" &&
    (casamento === "any" || listaDePalavras.length > 0) &&
    (escopo === "all" || posts.length > 0);

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = corpoDaRegra({
        name: nome.trim(),
        is_active: regra?.is_active ?? true,
        post_scope: escopo,
        post_ids: escopo === "specific" ? posts : [],
        match_type: casamento,
        keywords: casamento === "any" ? [] : listaDePalavras,
        dm_message: direct.trim(),
        public_replies: listaDePublicas,
      });
      return regra
        ? apiClient.patch(`/api/v1/instagram/rules/${regra.id}`, corpo)
        : apiClient.post("/api/v1/instagram/rules", { ...corpo, connection_id: conta });
    },
    onSuccess: () => {
      toast.success(t("Regra salva."));
      onSalva();
    },
    onError: (err) => showApiError(err),
  });

  const alternarPost = (id: string) => setPosts((atual) => (atual.includes(id) ? atual.filter((p) => p !== id) : [...atual, id]));

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvar.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{regra ? t("Editar regra") : t("Nova regra")}</DialogTitle>
          <DialogDescription>{t("Quando alguém comentar, o direct é enviado na hora. Cada comentário é atendido uma única vez.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="regra-nome">{t("Nome da regra")}</Label>
            <Input id="regra-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>

          {!regra && conexoes.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="regra-conta">{t("Conta")}</Label>
              <select
                id="regra-conta"
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                value={conta}
                onChange={(e) => {
                  setConta(e.target.value);
                  setPosts([]);
                }}
              >
                {conexoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    @{c.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("Em quais publicações")}</Label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="escopo" checked={escopo === "all"} onChange={() => setEscopo("all")} />
                {t("Todas as publicações")}
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="escopo" checked={escopo === "specific"} onChange={() => setEscopo("specific")} />
                {t("Só nas que eu escolher")}
              </label>
            </div>
            {escopo === "specific" &&
              (publicacoes.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : publicacoes.isError ? (
                <p className="text-xs text-error-fg">{t("Não foi possível carregar as publicações. Reconecte a conta e tente de novo.")}</p>
              ) : (
                <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" data-testid="regra-publicacoes">
                  {(publicacoes.data?.data.publicacoes ?? []).map((p) => {
                    const marcada = posts.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => alternarPost(p.id)}
                        aria-pressed={marcada}
                        title={p.caption ?? undefined}
                        className={`relative aspect-square overflow-hidden rounded-md border-2 text-left ${marcada ? "border-accent" : "border-border"}`}
                      >
                        {p.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- miniatura servida pelo Instagram, com endereço que vence
                          <img src={p.thumbnailUrl} alt={p.caption ?? ""} className="h-full w-full object-cover" />
                        ) : (
                          <span className="block p-1 text-[10px] text-muted-foreground">{(p.caption ?? p.id).slice(0, 60)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regra-casamento">{t("Quando o comentário")}</Label>
            <select
              id="regra-casamento"
              className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
              value={casamento}
              onChange={(e) => setCasamento(e.target.value as TipoDeCasamento)}
            >
              {(Object.keys(ROTULO_DO_CASAMENTO) as TipoDeCasamento[]).map((c) => (
                <option key={c} value={c}>
                  {t(ROTULO_DO_CASAMENTO[c])}
                </option>
              ))}
            </select>
            {casamento !== "any" && (
              <>
                <Input value={palavras} onChange={(e) => setPalavras(e.target.value)} placeholder="quero, link, eu quero" aria-label={t("Palavras")} />
                <p className="text-xs text-muted-foreground">{t("Separe por vírgula. Maiúsculas, acentos e pontuação não fazem diferença.")}</p>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regra-direct">{t("Mensagem do direct")}</Label>
            <Textarea id="regra-direct" value={direct} onChange={(e) => setDirect(e.target.value)} rows={4} maxLength={1000} />
            <p className="text-xs text-muted-foreground">{t("Use {{usuario}} para colocar o @ de quem comentou.")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regra-publicas">{t("Resposta embaixo do comentário (opcional)")}</Label>
            <Textarea id="regra-publicas" value={publicas} onChange={(e) => setPublicas(e.target.value)} rows={3} />
            <p className="text-xs text-muted-foreground">
              {t("Uma por linha: a cada comentário, uma delas é escolhida. Só é postada quando o direct saiu.")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={!pronto || salvar.isPending}>
            {salvar.isPending ? t("Salvando…") : t("Salvar regra")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
