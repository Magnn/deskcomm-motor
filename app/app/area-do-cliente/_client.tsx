"use client";
/**
 * A tela da EQUIPE para a área do cliente: o painel (onde os clientes param, o
 * que abrem, o que desejam, o que compram), a vitrine de serviços, a lista de
 * compradores com o link de acesso de cada um, e a configuração.
 */
import { useMemo, useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import type { ConfigDaArea } from "@/lib/area-do-cliente/config";
import { MAXIMO_DE_ETAPAS } from "@/lib/area-do-cliente/etapas";
import type { Painel } from "@/lib/area-do-cliente/metricas";
import { Copy, PencilSimple, Plus, Trash, WhatsappLogo } from "@/lib/ui/icons";

interface Servico {
  id: string;
  nome: string;
  descricao: string | null;
  recebe: string | null;
  preco_cents: number;
  currency: string;
  link_checkout: string;
  destaque: boolean;
  ativo: boolean;
  posicao: number;
  etapas?: Array<{ titulo: string; orientacao?: string }>;
}

interface ConversaDaArea {
  contact_id: string;
  nome: string;
  ultima: string;
  ultima_de: "cliente" | "equipe";
  quando: string;
  pendentes: number;
}

interface MensagemDaArea {
  id: string;
  contact_id: string;
  autor: "cliente" | "equipe";
  texto: string;
  created_at: string;
}

interface Comprador {
  contact_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  compras: number;
  total_cents: number;
  ultima_compra: string;
  convidado_em: string | null;
  ultimo_acesso: string | null;
}

const reais = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
const data = (iso: string, tag: string) => new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit" }).format(new Date(iso));

export function PainelDaAreaDoCliente() {
  const t = useT();
  const config = useQuery({
    queryKey: ["area", "config"],
    queryFn: () => apiClient.get<{ data: { config: ConfigDaArea; endereco: string } }>("/api/v1/area/config"),
  });
  const ativa = config.data?.data.config.ativo ?? false;
  const conversas = useQuery({
    queryKey: ["area", "mensagens"],
    queryFn: () => apiClient.get<{ data: ConversaDaArea[] }>("/api/v1/area/mensagens"),
    refetchInterval: 30_000,
  });
  const pendentes = (conversas.data?.data ?? []).reduce((n, c) => n + c.pendentes, 0);

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Área do cliente")}</h1>
          {config.data ? (
            <Badge variant={ativa ? "success" : "neutral"}>{ativa ? t("No ar") : t("Desligada")}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("Onde quem já comprou vê o que é seu e compra outro serviço, fora do WhatsApp. Aqui você mede onde as pessoas param, o que abrem e o que desejam.")}
        </p>
        {config.data && ativa ? (
          <p className="text-xs text-muted-foreground" data-testid="area-endereco">
            {t("Endereço:")} <span className="font-mono">{config.data.data.endereco}</span>
          </p>
        ) : null}
      </header>

      <Tabs defaultValue="painel">
        <TabsList>
          <TabsTrigger value="painel">{t("Painel")}</TabsTrigger>
          <TabsTrigger value="servicos">{t("Serviços")}</TabsTrigger>
          <TabsTrigger value="mensagens">
            {t("Mensagens")}
            {pendentes > 0 ? (
              <span className="ml-1.5 rounded-full bg-error-bg px-1.5 text-xs font-semibold text-error-fg" data-testid="area-mensagens-pendentes">
                {pendentes}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="compradores">{t("Compradores")}</TabsTrigger>
          <TabsTrigger value="config">{t("Configuração")}</TabsTrigger>
        </TabsList>
        <TabsContent value="painel">
          <AbaPainel />
        </TabsContent>
        <TabsContent value="servicos">
          <AbaServicos />
        </TabsContent>
        <TabsContent value="mensagens">
          <AbaMensagens />
        </TabsContent>
        <TabsContent value="compradores">
          <AbaCompradores ativa={ativa} />
        </TabsContent>
        <TabsContent value="config">
          {config.data ? <AbaConfig inicial={config.data.data.config} /> : <Skeleton className="h-64 w-full" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Painel ─────────────────────────────────────────────────────────────────

function AbaPainel() {
  const t = useT();
  const [dias, setDias] = useState(30);
  const q = useQuery({
    queryKey: ["area", "painel", dias],
    queryFn: () =>
      apiClient.get<{ data: Painel & { dias: number; truncado: boolean; assinantesAtivos: number } }>(`/api/v1/area/painel?dias=${dias}`),
  });
  const p = q.data?.data;
  const rotulo: Record<string, string> = {
    convidados: t("Receberam o link"),
    entraram: t("Entraram"),
    voltaram: t("Voltaram outro dia"),
    viram_servicos: t("Viram um serviço"),
    clicaram_comprar: t("Clicaram em comprar"),
    compraram: t("Compraram"),
  };
  const ondeParou: Record<string, string> = {
    so_entrou: t("Entrou e não abriu nada"),
    abriu_material: t("Abriu material, não olhou serviços"),
    viu_servico: t("Olhou serviços, não clicou em comprar"),
    clicou_comprar: t("Clicou em comprar, não pagou"),
    comprou: t("Comprou"),
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex gap-2">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={dias === d ? "default" : "outline"} onClick={() => setDias(d)}>
            {d} {t("dias")}
          </Button>
        ))}
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError || !p ? (
        <Card className="p-6 text-sm text-error-fg">{t("Erro ao carregar o painel.")}</Card>
      ) : (
        <>
          {p.truncado ? (
            <Card className="p-3 text-sm text-warning-fg">{t("Período grande demais: o painel leu só parte dos eventos. Escolha um período menor.")}</Card>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4" data-testid="area-funil">
              <h2 className="font-semibold">{t("Funil")}</h2>
              <ol className="mt-3 space-y-2">
                {p.funil.map((e, i) => {
                  const base = p.funil[0]?.pessoas || 1;
                  const anterior = i === 0 ? null : p.funil[i - 1]?.pessoas ?? 0;
                  const largura = Math.max(2, Math.round((e.pessoas / base) * 100));
                  return (
                    <li key={e.etapa}>
                      <div className="flex justify-between text-sm">
                        <span>{rotulo[e.etapa]}</span>
                        <span className="tabular-nums">
                          {e.pessoas}
                          {anterior ? (
                            <span className="ml-2 text-xs text-muted-foreground">{Math.round((e.pessoas / anterior) * 100)}%</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-surface-elevated">
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${largura}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Receita depois de um clique em comprar (até 7 dias):")} {reais(p.receitaAtribuida_cents)}
              </p>
            </Card>

            <Card className="p-4" data-testid="area-onde-param">
              <h2 className="font-semibold">{t("Onde as pessoas param")}</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {p.ondeParam.map((o) => (
                  <li key={o.etapa} className="flex justify-between">
                    <span>{ondeParou[o.etapa]}</span>
                    <span className="tabular-nums">{o.pessoas}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("Materiais abertos:")} {p.materiaisAbertos.aberturas} ({p.materiaisAbertos.pessoas} {t("pessoas")})
              </p>
              <ul className="mt-3 space-y-1 border-t border-border pt-3 text-sm" data-testid="area-engajamento">
                <li className="flex justify-between">
                  <span>{t("Revelaram a carta do dia")}</span>
                  <span className="tabular-nums">{p.engajamento.cartaDoDia}</span>
                </li>
                <li className="flex justify-between">
                  <span>{t("Escreveram no diário")}</span>
                  <span className="tabular-nums">{p.engajamento.diario}</span>
                </li>
                <li className="flex justify-between">
                  <span>{t("Contaram o aniversário")}</span>
                  <span className="tabular-nums">{p.engajamento.aniversarios}</span>
                </li>
              </ul>
            </Card>
          </div>

          <Card className="p-4" data-testid="area-servicos-desempenho">
            <h2 className="font-semibold">{t("Serviços")}</h2>
            {p.servicos.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("Cadastre serviços na aba Serviços para ver o desempenho de cada um.")}</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1 font-normal">{t("Serviço")}</th>
                    <th className="py-1 text-right font-normal">{t("Viram")}</th>
                    <th className="py-1 text-right font-normal">{t("Clicaram")}</th>
                    <th className="py-1 text-right font-normal">{t("Compraram")}</th>
                    <th className="py-1 text-right font-normal">{t("Receita")}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.servicos.map((s) => (
                    <tr key={s.id} className="border-t border-border">
                      <td className="py-2">{s.nome}</td>
                      <td className="py-2 text-right tabular-nums">{s.viram}</td>
                      <td className="py-2 text-right tabular-nums">{s.clicaram}</td>
                      <td className="py-2 text-right tabular-nums">{s.compraram}</td>
                      <td className="py-2 text-right tabular-nums">{reais(s.receita_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-4" data-testid="area-circulo-painel">
            <h2 className="font-semibold">{t("Círculo")}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Assinantes ativos agora")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.assinantesAtivos}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Abriram o pagamento")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.circulo.abriramPagamento}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Pagaram")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.circulo.pagaram}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Fizeram a pergunta do mês")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.circulo.perguntaram}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Presentes comprados")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.ofertas.presentesComprados}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Presentes usados")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.ofertas.presentesUsados}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t("Compraram o Ano Pessoal")}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.ofertas.anoPessoalComprado}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-4" data-testid="area-desejos">
            <h2 className="font-semibold">{t("O que os clientes disseram que gostariam de receber")}</h2>
            {p.desejos.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("Ninguém respondeu ainda.")}</p>
            ) : (
              <ul className="mt-3 space-y-1 text-sm">
                {p.desejos.map((d) => (
                  <li key={d.texto} className="flex justify-between gap-4">
                    <span className="min-w-0">{d.texto}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{d.pessoas}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Serviços ───────────────────────────────────────────────────────────────

function AbaServicos() {
  const t = useT();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Servico | "novo" | null>(null);
  const q = useQuery({
    queryKey: ["area", "servicos"],
    queryFn: () => apiClient.get<{ data: Servico[] }>("/api/v1/area/servicos"),
  });
  const remover = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/v1/area/servicos/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area"] });
      toast.success(t("Serviço removido."));
    },
    onError: showApiError,
  });
  const servicos = q.data?.data ?? [];

  return (
    <div className="space-y-3 pt-2">
      <div className="flex justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("O que aparece em \"Para você\" na área. Use o mesmo nome do produto no checkout: é por ele que a compra é ligada ao serviço.")}
        </p>
        <Button onClick={() => setEditando("novo")} data-testid="area-novo-servico">
          <Plus size={16} weight="bold" aria-hidden />
          <span>{t("Novo serviço")}</span>
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : servicos.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{t("Nenhum serviço ainda.")}</Card>
      ) : (
        servicos.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium">{s.nome}</span>
                {s.destaque ? <Badge variant="info">{t("Destaque")}</Badge> : null}
                {!s.ativo ? <Badge variant="neutral">{t("Escondido")}</Badge> : null}
                {s.etapas && s.etapas.length > 0 ? (
                  <Badge variant="neutral">
                    {s.etapas.length} {t("etapas")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{reais(s.preco_cents, s.currency)}</p>
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
                  if (window.confirm(t("Remover este serviço da vitrine?"))) remover.mutate(s.id);
                }}
              >
                <Trash size={16} aria-hidden />
              </Button>
            </div>
          </Card>
        ))
      )}
      {editando ? <EditorDeServico servico={editando === "novo" ? null : editando} onClose={() => setEditando(null)} /> : null}
    </div>
  );
}

function EditorDeServico({ servico, onClose }: { servico: Servico | null; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [descricao, setDescricao] = useState(servico?.descricao ?? "");
  const [recebe, setRecebe] = useState(servico?.recebe ?? "");
  const [preco, setPreco] = useState(servico ? (servico.preco_cents / 100).toFixed(2).replace(".", ",") : "");
  const [link, setLink] = useState(servico?.link_checkout ?? "");
  const [destaque, setDestaque] = useState(servico?.destaque ?? false);
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  const [etapas, setEtapas] = useState<Array<{ titulo: string; orientacao: string }>>(
    (servico?.etapas ?? []).map((e) => ({ titulo: e.titulo, orientacao: e.orientacao ?? "" })),
  );
  const mudarEtapa = (i: number, campo: "titulo" | "orientacao", valor: string) =>
    setEtapas((lista) => lista.map((e, j) => (j === i ? { ...e, [campo]: valor } : e)));

  const precoCents = Math.round(Number(preco.replace(/\./g, "").replace(",", ".")) * 100);
  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        recebe: recebe.trim() || null,
        preco_cents: precoCents,
        link_checkout: link.trim(),
        destaque,
        ativo,
        etapas: etapas
          .filter((e) => e.titulo.trim())
          .map((e) => (e.orientacao.trim() ? { titulo: e.titulo.trim(), orientacao: e.orientacao.trim() } : { titulo: e.titulo.trim() })),
      };
      return servico
        ? apiClient.patch(`/api/v1/area/servicos/${servico.id}`, corpo)
        : apiClient.post("/api/v1/area/servicos", corpo);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area"] });
      toast.success(t("Serviço salvo."));
      onClose();
    },
    onError: showApiError,
  });

  return (
    <Dialog open onOpenChange={(aberto) => (!aberto ? onClose() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{servico ? t("Editar serviço") : t("Novo serviço")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="srv-nome">{t("Nome (o mesmo do checkout)")}</Label>
            <Input id="srv-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="srv-desc">{t("Descrição")}</Label>
            <Textarea id="srv-desc" value={descricao} maxLength={600} rows={3} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="srv-recebe">{t("O que a pessoa recebe")}</Label>
            <Input id="srv-recebe" value={recebe} maxLength={300} onChange={(e) => setRecebe(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="srv-preco">{t("Preço (R$)")}</Label>
              <Input id="srv-preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="srv-link">{t("Link de pagamento")}</Label>
              <Input id="srv-link" value={link} placeholder="https://" onChange={(e) => setLink(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="srv-destaque">{t("Destacar na vitrine")}</Label>
            <Switch id="srv-destaque" checked={destaque} onCheckedChange={setDestaque} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="srv-ativo">{t("Aparece para os clientes")}</Label>
            <Switch id="srv-ativo" checked={ativo} onCheckedChange={setAtivo} />
          </div>
          <div className="space-y-2 border-t pt-3" data-testid="area-etapas-do-servico">
            <div>
              <p className="text-sm font-medium">{t("Etapas do trabalho")}</p>
              <p className="text-xs text-muted-foreground">
                {t("Aparecem na área de quem comprou este serviço, em ordem; a pessoa marca cada uma que fez. Valem mesmo com o serviço escondido da vitrine.")}
              </p>
            </div>
            {etapas.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-right text-sm text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    aria-label={`${t("Etapa")} ${i + 1}`}
                    value={e.titulo}
                    maxLength={80}
                    placeholder={t("Ex.: 1ª noite")}
                    onChange={(ev) => mudarEtapa(i, "titulo", ev.target.value)}
                  />
                  <Input
                    aria-label={`${t("Orientação da etapa")} ${i + 1}`}
                    value={e.orientacao}
                    maxLength={300}
                    placeholder={t("Ex.: acenda a vela branca às 21h e respire fundo 3 vezes")}
                    onChange={(ev) => mudarEtapa(i, "orientacao", ev.target.value)}
                  />
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`${t("Remover etapa")} ${i + 1}`}
                  onClick={() => setEtapas((lista) => lista.filter((_, j) => j !== i))}
                >
                  <Trash size={16} aria-hidden />
                </Button>
              </div>
            ))}
            {etapas.length < MAXIMO_DE_ETAPAS ? (
              <Button variant="outline" size="sm" onClick={() => setEtapas((lista) => [...lista, { titulo: "", orientacao: "" }])}>
                <Plus size={14} weight="bold" aria-hidden />
                <span>{t("Adicionar etapa")}</span>
              </Button>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("Cancelar")}
          </Button>
          <Button
            onClick={() => salvar.mutate()}
            disabled={salvar.isPending || !nome.trim() || !(precoCents >= 100) || !link.trim().startsWith("https://")}
          >
            {t("Salvar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mensagens ──────────────────────────────────────────────────────────────

function AbaMensagens() {
  const t = useT();
  const tag = useTagDeIdioma();
  const qc = useQueryClient();
  const [aberta, setAberta] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const conversas = useQuery({
    queryKey: ["area", "mensagens"],
    queryFn: () => apiClient.get<{ data: ConversaDaArea[] }>("/api/v1/area/mensagens"),
    refetchInterval: 30_000,
  });
  const fio = useQuery({
    queryKey: ["area", "mensagens", aberta],
    queryFn: () => apiClient.get<{ data: MensagemDaArea[] }>(`/api/v1/area/mensagens?contato=${aberta}`),
    enabled: aberta !== null,
    refetchInterval: 15_000,
  });
  const responder = useMutation({
    mutationFn: () => apiClient.post("/api/v1/area/mensagens", { contact_id: aberta, texto: texto.trim() }),
    onSuccess: () => {
      setTexto("");
      void qc.invalidateQueries({ queryKey: ["area", "mensagens"] });
    },
    onError: showApiError,
  });
  const lista = conversas.data?.data ?? [];

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[320px_1fr]">
      <Card className="p-2">
        {conversas.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : lista.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Ninguém escreveu pela área ainda.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((c) => (
              <li key={c.contact_id}>
                <button
                  type="button"
                  onClick={() => setAberta(c.contact_id)}
                  className={`w-full p-3 text-left text-sm ${aberta === c.contact_id ? "bg-surface-elevated" : ""}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.nome}</span>
                    {c.pendentes > 0 ? <Badge variant="error">{c.pendentes}</Badge> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.ultima_de === "equipe" ? `${t("Você")}: ` : ""}
                    {c.ultima}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="flex min-h-[320px] flex-col p-4">
        {aberta === null ? (
          <p className="text-sm text-muted-foreground">{t("Escolha uma conversa para ler e responder.")}</p>
        ) : (
          <>
            <ul className="flex-1 space-y-2 overflow-y-auto">
              {(fio.data?.data ?? []).map((m) => (
                <li key={m.id} className={m.autor === "equipe" ? "flex justify-end" : "flex justify-start"}>
                  <span
                    className={`max-w-[80%] whitespace-pre-line rounded-lg px-3 py-2 text-sm ${
                      m.autor === "equipe" ? "bg-accent text-white" : "bg-surface-elevated"
                    }`}
                  >
                    {m.texto}
                    <span className="mt-0.5 block text-[10px] opacity-70">
                      {new Intl.DateTimeFormat(tag, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(
                        new Date(m.created_at),
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (texto.trim()) responder.mutate();
              }}
            >
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} maxLength={2000} placeholder={t("Escreva a resposta…")} />
              <Button type="submit" disabled={responder.isPending || !texto.trim()}>
                {t("Responder")}
              </Button>
            </form>
            <p className="mt-1 text-xs text-muted-foreground">{t("A resposta aparece na área do cliente, em \"Fale com a gente\".")}</p>
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Compradores ────────────────────────────────────────────────────────────

function AbaCompradores({ ativa }: { ativa: boolean }) {
  const t = useT();
  const tag = useTagDeIdioma();
  const qc = useQueryClient();
  const [links, setLinks] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const q = useQuery({
    queryKey: ["area", "compradores"],
    queryFn: () => apiClient.get<{ data: Comprador[] }>("/api/v1/area/compradores?dias=120"),
  });
  const gerar = useMutation({
    mutationFn: (contactId: string) =>
      apiClient.post<{ data: { link: string } }>("/api/v1/area/convites", { contact_id: contactId }),
    onSuccess: (r, contactId) => {
      setLinks((l) => ({ ...l, [contactId]: r.data.link }));
      void qc.invalidateQueries({ queryKey: ["area", "compradores"] });
    },
    onError: showApiError,
  });

  const lote = useMutation({
    mutationFn: () =>
      apiClient.post<{ data: { links: Array<{ nome: string; telefone: string | null; link: string }> } }>("/api/v1/area/convites/lote", {
        dias: 120,
      }),
    onSuccess: (r) => {
      // Planilha simples (CSV) para mandar pelo canal que estiver de pé.
      const linhas = [["nome", "telefone", "link"], ...r.data.links.map((l) => [l.nome, l.telefone ?? "", l.link])];
      const csv = linhas.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
      const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "links-da-area-do-cliente.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${r.data.links.length} ${t("links gerados.")}`);
      void qc.invalidateQueries({ queryKey: ["area", "compradores"] });
    },
    onError: showApiError,
  });

  const lista = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    const todos = q.data?.data ?? [];
    return termo ? todos.filter((c) => `${c.nome} ${c.telefone ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo)) : todos;
  }, [q.data, busca]);

  const copiar = async (link: string) => {
    if (await copyToClipboard(link)) toast.success(t("Link copiado."));
    else toast.error(t("Não foi possível copiar. Selecione o link e copie."));
  };

  if (!ativa) {
    return <Card className="mt-2 p-6 text-sm text-muted-foreground">{t("Ligue a área na aba Configuração para gerar os links de acesso.")}</Card>;
  }
  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input placeholder={t("Buscar por nome ou telefone")} value={busca} onChange={(e) => setBusca(e.target.value)} />
        <Button variant="outline" disabled={lote.isPending} onClick={() => lote.mutate()} data-testid="area-links-de-todos">
          {lote.isPending ? t("Gerando…") : t("Gerar links de todos (planilha)")}
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : lista.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">{t("Ninguém comprou nos últimos 120 dias.")}</Card>
      ) : (
        lista.map((c) => {
          const link = links[c.contact_id];
          const status = c.ultimo_acesso
            ? { v: "success" as const, txt: `${t("Entrou")} ${data(c.ultimo_acesso, tag)}` }
            : c.convidado_em
              ? { v: "warning" as const, txt: t("Recebeu o link, não entrou") }
              : { v: "neutral" as const, txt: t("Sem acesso ainda") };
          const mensagem = link
            ? `${t("Olá! Sua área de cliente está pronta. Lá ficam suas compras e seus materiais:")} ${link}`
            : "";
          return (
            <Card key={c.contact_id} className="space-y-2 p-4" data-testid="area-comprador">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.telefone ?? "—"} · {c.compras} {c.compras === 1 ? t("compra") : t("compras")} · {reais(c.total_cents)} ·{" "}
                    {t("última em")} {data(c.ultima_compra, tag)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={status.v}>{status.txt}</Badge>
                  <Button size="sm" variant="outline" disabled={gerar.isPending} onClick={() => gerar.mutate(c.contact_id)}>
                    {t("Gerar link")}
                  </Button>
                </div>
              </div>
              {link ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-elevated p-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{link}</span>
                  <Button size="sm" variant="ghost" onClick={() => void copiar(link)}>
                    <Copy size={14} aria-hidden />
                    <span>{t("Copiar")}</span>
                  </Button>
                  {c.telefone ? (
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`https://wa.me/${c.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <WhatsappLogo size={14} aria-hidden />
                        <span>{t("Mandar pelo WhatsApp")}</span>
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })
      )}
    </div>
  );
}

// ─── Configuração ───────────────────────────────────────────────────────────

/** "29,90" → 2990; vazio ou lixo → o padrão. */
function centavos(texto: string, padrao: number): number {
  const n = Math.round(Number(texto.replace(/\./g, "").replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 100 ? n : padrao;
}

function AbaConfig({ inicial }: { inicial: ConfigDaArea }) {
  const t = useT();
  const qc = useQueryClient();
  const [ativo, setAtivo] = useState(inicial.ativo);
  const [titulo, setTitulo] = useState(inicial.titulo ?? "");
  const [boasVindas, setBoasVindas] = useState(inicial.boas_vindas ?? "");
  const [whatsapp, setWhatsapp] = useState(inicial.whatsapp ?? "");
  const [cor, setCor] = useState(inicial.cor ?? "");
  const [cartaDoDia, setCartaDoDia] = useState(inicial.carta_do_dia ?? false);
  const [circuloAtivo, setCirculoAtivo] = useState(inicial.circulo?.ativo ?? false);
  const [circuloNome, setCirculoNome] = useState(inicial.circulo?.nome ?? "Círculo");
  const [presenteAtivo, setPresenteAtivo] = useState(inicial.presente?.ativo ?? false);
  const [presentePreco, setPresentePreco] = useState(((inicial.presente?.preco_cents ?? 1700) / 100).toFixed(2).replace(".", ","));
  const [anoAtivo, setAnoAtivo] = useState(inicial.ano_pessoal?.ativo ?? false);
  const [anoPreco, setAnoPreco] = useState(((inicial.ano_pessoal?.preco_cents ?? 4700) / 100).toFixed(2).replace(".", ","));
  const [mesaAtiva, setMesaAtiva] = useState(inicial.leituras?.ativo ?? false);
  const [mesaPrimeira, setMesaPrimeira] = useState(((inicial.leituras?.preco_primeira_cents ?? 500) / 100).toFixed(2).replace(".", ","));
  const [mesaPreco, setMesaPreco] = useState(((inicial.leituras?.preco_cents ?? 1490) / 100).toFixed(2).replace(".", ","));
  const [mesaLimite, setMesaLimite] = useState(String(inicial.leituras?.limite_por_dia ?? 3));
  const [circuloPreco, setCirculoPreco] = useState(((inicial.circulo?.preco_cents ?? 2900) / 100).toFixed(2).replace(".", ","));
  const salvar = useMutation({
    mutationFn: () =>
      apiClient.put("/api/v1/area/config", {
        ativo,
        carta_do_dia: cartaDoDia,
        presente: { ativo: presenteAtivo, preco_cents: centavos(presentePreco, 1700) },
        ano_pessoal: { ativo: anoAtivo, preco_cents: centavos(anoPreco, 4700) },
        leituras: {
          ativo: mesaAtiva,
          preco_primeira_cents: centavos(mesaPrimeira, 500),
          preco_cents: centavos(mesaPreco, 1490),
          limite_por_dia: Math.min(20, Math.max(1, Math.round(Number(mesaLimite)) || 3)),
        },
        circulo: {
          ativo: circuloAtivo,
          nome: circuloNome.trim() || "Círculo",
          preco_cents: Math.round(Number(circuloPreco.replace(/\./g, "").replace(",", ".")) * 100) || 2900,
        },
        ...(titulo.trim() ? { titulo: titulo.trim() } : {}),
        ...(boasVindas.trim() ? { boas_vindas: boasVindas.trim() } : {}),
        ...(whatsapp.replace(/\D/g, "") ? { whatsapp: whatsapp.replace(/\D/g, "") } : {}),
        ...(cor.trim() ? { cor: cor.trim() } : {}),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["area"] });
      toast.success(t("Configuração salva."));
    },
    onError: showApiError,
  });

  return (
    <Card className="mt-2 max-w-xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="area-ativo">{t("Área no ar")}</Label>
          <p className="text-xs text-muted-foreground">{t("Desligada, o endereço responde \"página não encontrada\".")}</p>
        </div>
        <Switch id="area-ativo" checked={ativo} onCheckedChange={setAtivo} />
      </div>
      <div>
        <Label htmlFor="area-titulo">{t("Título")}</Label>
        <Input id="area-titulo" value={titulo} maxLength={60} placeholder={t("Vazio = o nome da empresa")} onChange={(e) => setTitulo(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="area-boas-vindas">{t("Frase de boas-vindas")}</Label>
        <Input id="area-boas-vindas" value={boasVindas} maxLength={200} onChange={(e) => setBoasVindas(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="area-whatsapp">{t("WhatsApp do botão \"Falar com a gente\"")}</Label>
        <Input
          id="area-whatsapp"
          inputMode="tel"
          value={whatsapp}
          placeholder="5569999999999"
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">{t("Se o número mudar, troque só aqui: nenhum cliente fica sem contato.")}</p>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="area-carta">{t("Carta do dia")}</Label>
          <p className="text-xs text-muted-foreground">{t("Usa as fotos do baralho da leitura. Ligue só se elas estiverem cadastradas.")}</p>
        </div>
        <Switch id="area-carta" checked={cartaDoDia} onCheckedChange={setCartaDoDia} />
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="area-circulo">{t("Círculo (assinatura mensal)")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Conteúdo do mês e uma pergunta por mês, escritos pela IA. Cobra pela Stripe: Pix ou cartão, 30 dias por pagamento.")}
            </p>
          </div>
          <Switch id="area-circulo" checked={circuloAtivo} onCheckedChange={setCirculoAtivo} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="area-circulo-nome">{t("Nome")}</Label>
            <Input id="area-circulo-nome" value={circuloNome} maxLength={40} onChange={(e) => setCirculoNome(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="area-circulo-preco">{t("Preço por 30 dias (R$)")}</Label>
            <Input id="area-circulo-preco" inputMode="decimal" value={circuloPreco} onChange={(e) => setCirculoPreco(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="area-presente">{t("Presente (pergunta de tarô)")}</Label>
            <p className="text-xs text-muted-foreground">{t("O cliente compra uma pergunta para dar a alguém; quem recebe pergunta pelo link e a IA responde.")}</p>
          </div>
          <Switch id="area-presente" checked={presenteAtivo} onCheckedChange={setPresenteAtivo} />
        </div>
        <div>
          <Label htmlFor="area-presente-preco">{t("Preço (R$)")}</Label>
          <Input id="area-presente-preco" inputMode="decimal" value={presentePreco} onChange={(e) => setPresentePreco(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="area-ano">{t("Ano Pessoal")}</Label>
            <p className="text-xs text-muted-foreground">{t("Aparece de 15 dias antes a 30 dias depois do aniversário de quem contou a data. A IA escreve a leitura depois do pagamento.")}</p>
          </div>
          <Switch id="area-ano" checked={anoAtivo} onCheckedChange={setAnoAtivo} />
        </div>
        <div>
          <Label htmlFor="area-ano-preco">{t("Preço (R$)")}</Label>
          <Input id="area-ano-preco" inputMode="decimal" value={anoPreco} onChange={(e) => setAnoPreco(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="area-mesa">{t("Mesa de leituras")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Tarot e Baralho Cigano na área: a pessoa pergunta, paga ali mesmo, escolhe três cartas e a IA escreve a leitura na hora. A tela avisa que a leitura é automática.")}
            </p>
          </div>
          <Switch id="area-mesa" checked={mesaAtiva} onCheckedChange={setMesaAtiva} data-testid="area-mesa-ativa" />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label htmlFor="area-mesa-primeira">{t("Primeira de cada modalidade (R$)")}</Label>
            <Input id="area-mesa-primeira" inputMode="decimal" value={mesaPrimeira} onChange={(e) => setMesaPrimeira(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="area-mesa-preco">{t("Seguintes (R$)")}</Label>
            <Input id="area-mesa-preco" inputMode="decimal" value={mesaPreco} onChange={(e) => setMesaPreco(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="area-mesa-limite">{t("Leituras por dia")}</Label>
            <Input id="area-mesa-limite" inputMode="numeric" value={mesaLimite} onChange={(e) => setMesaLimite(e.target.value)} />
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="area-cor">{t("Cor principal")}</Label>
        <Input id="area-cor" value={cor} placeholder="#7c3aed" onChange={(e) => setCor(e.target.value)} />
      </div>
      <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} data-testid="area-salvar-config">
        {t("Salvar")}
      </Button>
    </Card>
  );
}
