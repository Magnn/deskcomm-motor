"use client";
/**
 * Perfil do WhatsApp de um número OFICIAL: estado na Meta, nome de exibição,
 * perfil comercial, foto e reverificação por SMS — o que antes exigia abrir o
 * Gerenciador do WhatsApp. Tudo é lido e gravado na Meta pela rota
 * `/api/v1/channel-sessions/[id]/perfil-whatsapp`; a tela não guarda nada.
 */
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  useAcaoPerfilWhatsapp,
  usePerfilWhatsapp,
  useSalvarPerfilWhatsapp,
  type AcaoDoPerfil,
} from "@/hooks/channels/usePerfilWhatsapp";
import { useT } from "@/hooks/i18n/useT";
import { ApiError } from "@/lib/api/types";

interface Props {
  channelId: string;
  titulo: string;
  onClose: () => void;
}

const CATEGORIAS: { valor: string; rotulo: string }[] = [
  { valor: "PROF_SERVICES", rotulo: "Serviços profissionais" },
  { valor: "ENTERTAIN", rotulo: "Entretenimento" },
  { valor: "EDU", rotulo: "Educação" },
  { valor: "BEAUTY", rotulo: "Beleza, estética e cuidados pessoais" },
  { valor: "HEALTH", rotulo: "Medicina e saúde" },
  { valor: "RETAIL", rotulo: "Compras e varejo" },
  { valor: "APPAREL", rotulo: "Vestuário" },
  { valor: "RESTAURANT", rotulo: "Restaurante" },
  { valor: "GROCERY", rotulo: "Alimentos e mercearia" },
  { valor: "FINANCE", rotulo: "Finanças e bancos" },
  { valor: "TRAVEL", rotulo: "Viagem e transporte" },
  { valor: "HOTEL", rotulo: "Hotel e hospedagem" },
  { valor: "EVENT_PLAN", rotulo: "Planejamento de eventos" },
  { valor: "AUTO", rotulo: "Automotivo" },
  { valor: "NONPROFIT", rotulo: "Sem fins lucrativos" },
  { valor: "GOVT", rotulo: "Órgão público" },
  { valor: "OTHER", rotulo: "Outro" },
];

const SITUACAO: Record<string, string> = {
  APPROVED: "Aprovado",
  AVAILABLE_WITHOUT_REVIEW: "Aprovado",
  PENDING_REVIEW: "Em análise",
  DECLINED: "Recusado",
  EXPIRED: "Vencido",
  NONE: "—",
};

function erroDe(err: unknown, t: (s: string) => string): string {
  return err instanceof ApiError ? err.message : t("Não foi possível falar com a Meta.");
}

export function PerfilWhatsappSheet({ channelId, titulo, onClose }: Props) {
  const t = useT();
  const { data, isPending, error, refetch } = usePerfilWhatsapp(channelId);
  const salvar = useSalvarPerfilWhatsapp(channelId);
  const acao = useAcaoPerfilWhatsapp(channelId);
  const [form, setForm] = useState({ about: "", description: "", address: "", email: "", site1: "", site2: "", vertical: "" });
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [codigoPedido, setCodigoPedido] = useState(false);

  const perfil = data;
  // O formulário recomeça do que a Meta devolveu a cada leitura nova (ajuste
  // durante a renderização, sem effect).
  const [lidoDe, setLidoDe] = useState<typeof perfil>(undefined);
  if (perfil && perfil !== lidoDe) {
    const p = perfil.perfil;
    setLidoDe(perfil);
    setForm({
      about: p.about ?? "",
      description: p.description ?? "",
      address: p.address ?? "",
      email: p.email ?? "",
      site1: p.websites?.[0] ?? "",
      site2: p.websites?.[1] ?? "",
      vertical: p.vertical ?? "",
    });
  }

  async function executar(corpo: AcaoDoPerfil, sucesso: string) {
    try {
      await acao.mutateAsync(corpo);
      toast.success(sucesso);
      return true;
    } catch (err) {
      toast.error(erroDe(err, t));
      return false;
    }
  }

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault();
    const websites = [form.site1, form.site2].map((s) => s.trim()).filter(Boolean);
    try {
      await salvar.mutateAsync({
        ...(form.about.trim() ? { about: form.about.trim() } : {}),
        description: form.description.trim(),
        address: form.address.trim(),
        email: form.email.trim(),
        websites,
        ...(form.vertical ? { vertical: form.vertical as never } : {}),
      });
      toast.success(t("Perfil salvo na Meta."));
    } catch (err) {
      toast.error(erroDe(err, t));
    }
  }

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.type !== "image/jpeg" && arquivo.type !== "image/png") {
      toast.error(t("Use uma foto JPG ou PNG."));
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      toast.error(t("A foto precisa ter até 5 MB."));
      return;
    }
    const base64 = await new Promise<string>((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result).split(",")[1] ?? "");
      leitor.onerror = () => falha(leitor.error);
      leitor.readAsDataURL(arquivo);
    });
    await executar({ acao: "foto", tipo: arquivo.type, base64 }, t("Foto enviada para a Meta."));
  }

  const estado = perfil?.estado;
  const desconectado = estado?.conexao === "DISCONNECTED" || estado?.verificacao === "EXPIRED";
  const nomeAprovadoParaAtivar =
    estado?.nomePedido &&
    (estado.situacaoDoNomePedido === "APPROVED" || estado.situacaoDoNomePedido === "AVAILABLE_WITHOUT_REVIEW") &&
    estado.nomePedido !== estado.nome;
  const ocupado = acao.isPending || salvar.isPending;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md" data-testid="perfil-whatsapp">
        <SheetHeader>
          <SheetTitle>{t("Perfil do WhatsApp")}</SheetTitle>
          <SheetDescription>
            {titulo} — {t("lido e salvo direto na Meta.")}
          </SheetDescription>
        </SheetHeader>

        {isPending ? (
          <p className="p-4 text-sm text-muted-foreground">{t("Consultando a Meta…")}</p>
        ) : error || !estado || !perfil ? (
          <div className="flex flex-col gap-2 p-4 text-sm" data-testid="perfil-whatsapp-erro">
            <p className="text-destructive">{erroDe(error, t)}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t("Tentar de novo")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-4">
            <section className="flex flex-col gap-2" data-testid="perfil-whatsapp-estado">
              <h3 className="text-sm font-medium">{t("Situação na Meta")}</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono text-xs">{estado.telefone ?? "—"}</span>
                <Badge variant={desconectado ? "destructive" : "outline"}>
                  {estado.conexao === "CONNECTED" ? t("Conectado") : estado.conexao === "DISCONNECTED" ? t("Desconectado") : (estado.conexao ?? "—")}
                </Badge>
                {estado.qualidade ? (
                  <Badge variant="outline">
                    {t("Qualidade")}: {estado.qualidade === "GREEN" ? t("Alta") : estado.qualidade === "YELLOW" ? t("Média") : estado.qualidade === "RED" ? t("Baixa") : estado.qualidade}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm">
                {t("Nome")}: <strong>{estado.nome ?? "—"}</strong>{" "}
                <span className="text-muted-foreground">({t(SITUACAO[estado.situacaoDoNome ?? "NONE"] ?? estado.situacaoDoNome ?? "—")})</span>
              </p>
              {estado.nomePedido && estado.nomePedido !== estado.nome ? (
                <p className="text-sm">
                  {t("Nome pedido")}: <strong>{estado.nomePedido}</strong>{" "}
                  <span className="text-muted-foreground">({t(SITUACAO[estado.situacaoDoNomePedido ?? "NONE"] ?? estado.situacaoDoNomePedido ?? "—")})</span>
                </p>
              ) : null}
              {nomeAprovadoParaAtivar ? (
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={() => void executar({ acao: "registrar" }, t("Nome aprovado ativado."))}
                >
                  {t("Ativar o nome aprovado")}
                </Button>
              ) : null}
            </section>

            {desconectado ? (
              <section className="flex flex-col gap-2 rounded-md border border-destructive/40 p-3" data-testid="perfil-whatsapp-verificacao">
                <h3 className="text-sm font-medium">{t("Verificar o número por SMS")}</h3>
                <p className="text-xs text-muted-foreground">
                  {t("Este número não envia mensagens enquanto não for verificado de novo. A Meta manda um código por SMS para o chip do número.")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={async () => {
                    if (await executar({ acao: "pedir_codigo" }, t("Código enviado por SMS."))) setCodigoPedido(true);
                  }}
                >
                  {codigoPedido ? t("Enviar outro código") : t("Enviar código")}
                </Button>
                {codigoPedido ? (
                  <form
                    className="flex gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await executar({ acao: "conferir_codigo", codigo }, t("Número verificado e ativado."))) setCodigo("");
                    }}
                  >
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="123456"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
                      aria-label={t("Código do SMS")}
                    />
                    <Button type="submit" size="sm" disabled={ocupado || codigo.length !== 6}>
                      {t("Confirmar")}
                    </Button>
                  </form>
                ) : null}
              </section>
            ) : null}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("Nome de exibição")}</h3>
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await executar({ acao: "nome", nome: nome.trim() }, t("Nome enviado para análise da Meta."))) setNome("");
                }}
              >
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={estado.nome ?? ""} aria-label={t("Novo nome de exibição")} />
                <Button type="submit" size="sm" disabled={ocupado || nome.trim().length < 3}>
                  {t("Enviar")}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                {t("A Meta analisa o nome antes de valer (até 10 trocas a cada 30 dias). Quando aprovar, volte aqui e clique em Ativar o nome aprovado.")}
              </p>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("Foto do perfil")}</h3>
              <div className="flex items-center gap-3">
                {perfil.perfil.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária da Meta, fora do otimizador.
                  <img src={perfil.perfil.fotoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted" aria-hidden />
                )}
                <Input
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={ocupado}
                  onChange={(e) => void escolherFoto(e.target.files?.[0])}
                  aria-label={t("Escolher foto")}
                />
              </div>
            </section>

            <form className="flex flex-col gap-3" onSubmit={salvarPerfil} data-testid="perfil-whatsapp-form">
              <h3 className="text-sm font-medium">{t("Perfil comercial")}</h3>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-about">{t("Recado")}</Label>
                <Input id="pw-about" maxLength={139} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-descricao">{t("Descrição")}</Label>
                <Textarea id="pw-descricao" maxLength={512} rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-categoria">{t("Categoria")}</Label>
                <select
                  id="pw-categoria"
                  value={form.vertical}
                  onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="">{t("Não informar")}</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {t(c.rotulo)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-endereco">{t("Endereço")}</Label>
                <Input id="pw-endereco" maxLength={256} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-email">{t("E-mail")}</Label>
                <Input id="pw-email" type="email" maxLength={128} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="pw-site1">{t("Sites (até 2)")}</Label>
                <Input id="pw-site1" type="url" placeholder="https://" value={form.site1} onChange={(e) => setForm({ ...form, site1: e.target.value })} />
                <Input type="url" placeholder="https://" value={form.site2} onChange={(e) => setForm({ ...form, site2: e.target.value })} aria-label={t("Segundo site")} />
              </div>
              <Button type="submit" disabled={ocupado}>
                {salvar.isPending ? t("Salvando…") : t("Salvar perfil")}
              </Button>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
