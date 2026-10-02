"use client";
/**
 * A lista de lançamentos em grupos, e o formulário de criar um.
 *
 * Um lançamento são vários grupos de WhatsApp atrás de UM link: o link vai no
 * anúncio e manda cada pessoa para o grupo que ainda tem vaga. Aqui se vê, de
 * cada lançamento, o que decide o próximo clique — quantos grupos, quanta gente,
 * quantos cliques — e se cria um novo.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty";
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
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { NumeroParaGrupos } from "@/lib/channels/numeros-para-grupos";
import type { ResumoDoLancamento } from "@/lib/lancamentos/consultas";
import { LOTACAO_PADRAO, nomeDoGrupo, TETO_DO_WHATSAPP } from "@/lib/lancamentos/regras";
import { Plus, UsersThree } from "@/lib/ui/icons";

interface Listagem {
  lancamentos: ResumoDoLancamento[];
  numeros: NumeroParaGrupos[];
}

export const CHAVE_DOS_LANCAMENTOS = ["lancamentos"] as const;

export function rotuloDoStatusDoLancamento(status: ResumoDoLancamento["status"]): string {
  return status === "active" ? "No ar" : status === "paused" ? "Pausado" : "Encerrado";
}

export function ListaDeLancamentos() {
  const t = useT();
  const [criando, setCriando] = useState(false);
  const q = useQuery({
    queryKey: CHAVE_DOS_LANCAMENTOS,
    queryFn: () => apiClient.get<{ data: Listagem }>("/api/v1/lancamentos"),
  });
  const lancamentos = q.data?.data.lancamentos ?? [];
  const numeros = q.data?.data.numeros ?? [];

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Lançamentos")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Vários grupos de WhatsApp atrás de um link só: o link do anúncio manda cada pessoa para o grupo que ainda tem vaga.")}
          </p>
        </div>
        <Button onClick={() => setCriando(true)} disabled={q.isLoading}>
          <Plus size={16} weight="bold" aria-hidden />
          <span>{t("Novo lançamento")}</span>
        </Button>
      </header>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : q.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-error-fg">{t("Erro ao carregar os lançamentos.")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => q.refetch()}>
            {t("Tentar novamente")}
          </Button>
        </Card>
      ) : lancamentos.length === 0 ? (
        <Card className="p-2">
          <EmptyState
            icon={UsersThree}
            headline={t("Nenhum lançamento ainda.")}
            subcopy={t("Crie um lançamento para ganhar o link único e o primeiro grupo. Os próximos grupos abrem sozinhos quando o atual enche.")}
            primary={{ label: t("Novo lançamento"), onClick: () => setCriando(true) }}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {lancamentos.map((l) => (
            <Link key={l.id} href={`/app/lancamentos/${l.id}`} className="block" data-testid={`lancamento-${l.id}`}>
              <Card className="flex flex-col gap-2 p-4 transition-colors hover:bg-surface-elevated sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{l.name}</span>
                    <Badge variant={l.status === "active" ? "success" : "neutral"}>{t(rotuloDoStatusDoLancamento(l.status))}</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{l.link}</p>
                </div>
                <dl className="flex shrink-0 gap-6 text-sm">
                  <Numero rotulo={t("Grupos")} valor={l.grupos} />
                  <Numero rotulo={t("Pessoas")} valor={l.participantes} />
                  <Numero rotulo={t("Cliques")} valor={l.cliques} />
                </dl>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {criando && <NovoLancamento numeros={numeros} onClose={() => setCriando(false)} />}
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="text-right">
      <dd className="text-base font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</dd>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
    </div>
  );
}

function NovoLancamento({ numeros, onClose }: { numeros: NumeroParaGrupos[]; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const conectados = numeros.filter((n) => n.conectado);
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState(conectados[0]?.id ?? "");
  const [modelo, setModelo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [lotacao, setLotacao] = useState(String(LOTACAO_PADRAO));
  const [soAdmin, setSoAdmin] = useState(true);
  const [apoio, setApoio] = useState("");

  const modeloEfetivo = modelo.trim() || (nome.trim() ? `${nome.trim()} #{n}` : "");
  const lotacaoNumero = Number(lotacao);
  const lotacaoValida = Number.isInteger(lotacaoNumero) && lotacaoNumero >= 2 && lotacaoNumero <= TETO_DO_WHATSAPP;
  const pronto = nome.trim().length >= 2 && numero !== "" && modeloEfetivo.length >= 2 && lotacaoValida && apoio.replace(/\D/g, "").length >= 10;

  const criar = useMutation({
    mutationFn: () =>
      apiClient.post<{ data: { id: string; link: string } }>("/api/v1/lancamentos", {
        name: nome.trim(),
        channel_session_id: numero,
        group_name_template: modeloEfetivo,
        ...(descricao.trim() ? { group_description: descricao.trim() } : {}),
        group_capacity: lotacaoNumero,
        admins_only: soAdmin,
        seed_participant: apoio,
      }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: CHAVE_DOS_LANCAMENTOS });
      toast.success(t("Lançamento criado, com o primeiro grupo."));
      router.push(`/app/lancamentos/${res.data.id}`);
    },
    onError: (err) => showApiError(err),
  });

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !criar.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Novo lançamento")}</DialogTitle>
          <DialogDescription>{t("O primeiro grupo é criado agora, no WhatsApp do número escolhido.")}</DialogDescription>
        </DialogHeader>

        {conectados.length === 0 ? (
          <p className="rounded-md border border-border bg-surface-elevated p-3 text-sm text-muted-foreground">
            {t("Nenhum número por QR code está conectado. Grupos só existem em número conectado por QR code — conecte um em Conexões e volte aqui.")}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lanc-nome">{t("Nome do lançamento")}</Label>
              <Input id="lanc-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lanc-numero">{t("Número que cria os grupos")}</Label>
              <select
                id="lanc-numero"
                className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              >
                {conectados.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.telefone && n.telefone !== n.nome ? `${n.nome} — ${n.telefone}` : n.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lanc-modelo">{t("Nome dos grupos")}</Label>
              <Input
                id="lanc-modelo"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder={nome.trim() ? `${nome.trim()} #{n}` : "Aulão ao vivo #{n}"}
                maxLength={90}
              />
              <p className="text-xs text-muted-foreground">
                {t("Use {n} onde entra o número do grupo.")}{" "}
                {modeloEfetivo ? `${t("O primeiro vai se chamar:")} ${nomeDoGrupo(modeloEfetivo, 1)}` : null}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lanc-descricao">{t("Descrição dos grupos (opcional)")}</Label>
              <Textarea id="lanc-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} maxLength={2000} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lanc-lotacao">{t("Pessoas por grupo")}</Label>
              <Input id="lanc-lotacao" inputMode="numeric" value={lotacao} onChange={(e) => setLotacao(e.target.value.replace(/\D/g, ""))} />
              <p className="text-xs text-muted-foreground">
                {`${t("O WhatsApp aceita até")} ${TETO_DO_WHATSAPP}. ${t("Deixar uma folga evita convite recusado quando o grupo está quase cheio.")}`}
              </p>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="lanc-so-admin">{t("Só administradores falam no grupo")}</Label>
                <p className="text-xs text-muted-foreground">{t("O grupo vira um canal de avisos: os participantes leem, e só você publica.")}</p>
              </div>
              <Switch id="lanc-so-admin" checked={soAdmin} onCheckedChange={setSoAdmin} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lanc-apoio">{t("Número de apoio")}</Label>
              <Input id="lanc-apoio" inputMode="tel" value={apoio} onChange={(e) => setApoio(e.target.value)} placeholder="5511999990000" />
              <p className="text-xs text-muted-foreground">
                {t("Outro WhatsApp seu, com DDI e DDD. O WhatsApp não cria grupo de uma pessoa só: este número entra em cada grupo junto com o número principal.")}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={criar.isPending}>
            {t("Cancelar")}
          </Button>
          <Button onClick={() => criar.mutate()} disabled={!pronto || criar.isPending || conectados.length === 0}>
            {criar.isPending ? t("Criando o grupo…") : t("Criar lançamento")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
