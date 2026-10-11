"use client";
/**
 * A aba "Catálogo": o que o agente vende a quem JÁ comprou, um cartão por produto.
 *
 * Cada produto é um registro com os mesmos campos — o que é, o que a pessoa recebe, quanto custa, por
 * onde paga, como é entregue, o que precisa ser pedido a ela e depois de qual compra ele é oferecido. O
 * agente nunca vê a lista: o sistema escolhe UM produto por vez, pelo que a pessoa já comprou, na ordem
 * dos cartões. A coluna da direita mostra a instrução que ele recebe quando o primeiro produto está na vez.
 *
 * O produto da PRIMEIRA venda não está aqui: valor e negociação dele continuam na aba Preço. Com o
 * catálogo ligado, a oferta de pós-venda da aba Preço deixa de valer.
 *
 * O selo "Falta o fluxo de entrega" vem do servidor e é a MESMA regra do turno: um produto de material
 * pronto sem fluxo que o entregue não é oferecido, porque a pessoa pagaria e não receberia.
 *
 * A configuração mora em `ai_agents.config.catalog` e vale no PRÓXIMO turno, sem publicar versão. Por isso
 * só admin salva.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ListaDeChips } from "@/components/ai/ListaDeChips";
import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDaEntregaNaConversa, blocoDaOfertaDoCatalogo } from "@/lib/catalogo/bloco-do-prompt";
import type { FaltaNoProduto } from "@/lib/catalogo/oferta-da-vez";
import {
  ESPERA_PADRAO_DO_CATALOGO_H,
  MAX_DADOS_A_PEDIR,
  MAX_PRODUTOS_DO_CATALOGO,
  catalogoSchema,
  type CatalogoConfig,
  type TipoDeEntrega,
} from "@/lib/catalogo/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface ProdutoNaTela {
  nome: string;
  descricao: string;
  recebe: string;
  preco: string;
  link: string;
  entrega: TipoDeEntrega;
  pede: string[];
  depoisDe: string;
  horas: string;
  ativo: boolean;
}

interface Formulario {
  enabled: boolean;
  produtos: ProdutoNaTela[];
}

const PRODUTO_VAZIO: ProdutoNaTela = {
  nome: "",
  descricao: "",
  recebe: "",
  preco: "",
  link: "",
  entrega: "material",
  pede: [],
  depoisDe: "",
  horas: String(ESPERA_PADRAO_DO_CATALOGO_H),
  ativo: true,
};
const VAZIO: Formulario = { enabled: false, produtos: [] };

/** Item de lista que o servidor aceita: sem aspas duplas, ponto e vírgula nem quebra de linha. */
const PROIBIDOS_NA_LISTA = ['"', ";", "\n"] as const;

const ENTREGAS: ReadonlyArray<{ valor: TipoDeEntrega; rotulo: string; dica: string }> = [
  { valor: "material", rotulo: "Material pronto", dica: "Um arquivo ou sequência igual para todos, enviado por um fluxo de entrega." },
  { valor: "conversa", rotulo: "Na conversa", dica: "O agente conduz a entrega na própria conversa, depois de pedir o que precisa." },
];

const emCentavos = (texto: string): number | null => {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const emTexto = (centavos: number): string => (centavos / 100).toFixed(2).replace(".", ",");

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { catalog?: unknown } | null | undefined)?.catalog;
  const r = catalogoSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  return {
    enabled: r.data.enabled,
    produtos: r.data.produtos.map((p) => ({
      nome: p.nome,
      descricao: p.descricao ?? "",
      recebe: p.recebe ?? "",
      preco: emTexto(p.preco_cents),
      link: p.link,
      entrega: p.entrega,
      pede: p.pede,
      depoisDe: p.depois_de ?? "",
      horas: String(p.espera_horas),
      ativo: p.ativo,
    })),
  };
}

/** O que o servidor recebe: campo vazio some (é opcional), e o resultado passa no MESMO schema do servidor. */
export function paraCorpo(f: Formulario): { corpo: CatalogoConfig } | { erro: string } {
  const texto = (v: string): string | undefined => (v.trim() === "" ? undefined : v.trim());
  const produtos: unknown[] = [];
  for (const p of f.produtos) {
    if (p.nome.trim() === "") return { erro: "Dê um nome a cada produto." };
    const preco = emCentavos(p.preco);
    if (preco === null) return { erro: "Informe o valor de cada produto." };
    if (p.link.trim() === "") return { erro: "Informe o link de pagamento de cada produto." };
    const horas = Number(p.horas.trim() === "" ? ESPERA_PADRAO_DO_CATALOGO_H : p.horas);
    if (!Number.isInteger(horas) || horas < 0) return { erro: "A espera é um número inteiro de horas." };
    produtos.push({
      nome: p.nome.trim(),
      ...(texto(p.descricao) !== undefined ? { descricao: texto(p.descricao) } : {}),
      ...(texto(p.recebe) !== undefined ? { recebe: texto(p.recebe) } : {}),
      preco_cents: preco,
      link: p.link.trim(),
      entrega: p.entrega,
      pede: p.pede,
      ...(texto(p.depoisDe) !== undefined ? { depois_de: texto(p.depoisDe) } : {}),
      espera_horas: horas,
      ativo: p.ativo,
    });
  }
  const r = catalogoSchema.safeParse({ enabled: f.enabled, produtos });
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

interface RespostaDoCatalogo {
  data: { catalog: CatalogoConfig | null; faltas: (FaltaNoProduto | null)[] };
}

export function CatalogoDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));
  const mudaProduto = (i: number, p: Partial<ProdutoNaTela>) =>
    setForm((f) => ({ ...f, produtos: f.produtos.map((x, j) => (j === i ? { ...x, ...p } : x)) }));
  const sobe = (i: number) =>
    setForm((f) => {
      if (i === 0) return f;
      const produtos = [...f.produtos];
      [produtos[i - 1], produtos[i]] = [produtos[i]!, produtos[i - 1]!];
      return { ...f, produtos };
    });

  // O que falta em cada produto SALVO, na ordem em que foi salvo. Vale enquanto a lista não muda de
  // tamanho nem de ordem; depois de editar, o selo volta quando a pessoa salva.
  const queryKey = React.useMemo(() => ["ai", "agents", agentId, "catalogo"], [agentId]);
  const faltasSalvas = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.get<RespostaDoCatalogo>(`/api/v1/ai/agents/${agentId}/catalogo`);
      return {
        nomes: (res.data.catalog?.produtos ?? []).map((p) => p.nome),
        faltas: res.data.faltas,
      };
    },
  });
  const faltaDo = (nome: string): FaltaNoProduto | null => {
    const i = faltasSalvas.data?.nomes.indexOf(nome.trim()) ?? -1;
    return i === -1 ? null : (faltasSalvas.data?.faltas[i] ?? null);
  };

  // A prévia é o bloco REAL: a mesma função que o turno usa, para o primeiro produto ativo e preenchido.
  const previa = React.useMemo(() => {
    const r = paraCorpo({ ...form, enabled: true });
    if (!("corpo" in r)) return "";
    const primeiro = r.corpo.produtos.find((p) => p.ativo);
    if (!primeiro) return "";
    return `${blocoDaOfertaDoCatalogo({ produto: primeiro, jaOferecida: false })}${blocoDaEntregaNaConversa(primeiro)}`.trim();
  }, [form]);

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/catalogo`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Catálogo salvo. Vale a partir da próxima conversa.")
          : t("Catálogo desligado. Volta a valer a oferta de pós-venda da aba Preço."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="catalogo-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Catálogo")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Os produtos que o agente pode oferecer a quem já comprou. Ele oferece um por vez, na ordem dos cartões, e só o que a pessoa ainda não tem. O produto da primeira venda continua na aba Preço. Com o catálogo ligado, a oferta de pós-venda da aba Preço deixa de valer.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar este catálogo")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          {form.produtos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-text-muted">
              {t("Nenhum produto ainda. Adicione o primeiro que o agente pode oferecer depois da compra.")}
            </p>
          ) : null}

          {form.produtos.map((p, i) => {
            const falta = faltaDo(p.nome);
            return (
              <div key={i} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3" data-testid={`catalogo-produto-${i}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text">{`${t("Produto")} ${i + 1}`}</span>
                    {!p.ativo ? (
                      <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-text-muted">{t("Rascunho")}</span>
                    ) : null}
                    {falta === "sem_fluxo_de_entrega" ? (
                      <span
                        className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning-fg"
                        data-testid={`catalogo-produto-${i}-falta`}
                      >
                        {t("Falta o fluxo de entrega — não é oferecido")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="ghost" disabled={readOnly || i === 0} onClick={() => sobe(i)}>
                      {t("Subir")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={readOnly}
                      onClick={() => patch({ produtos: form.produtos.filter((_, j) => j !== i) })}
                    >
                      {t("Remover")}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`catalogo-${i}-nome`}>{t("Nome do produto")}</Label>
                    <Input
                      id={`catalogo-${i}-nome`}
                      maxLength={80}
                      placeholder={t("O mesmo nome que ele tem no checkout")}
                      value={p.nome}
                      onChange={(e) => mudaProduto(i, { nome: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`catalogo-${i}-preco`}>{t("Valor (R$)")}</Label>
                    <Input
                      id={`catalogo-${i}-preco`}
                      inputMode="decimal"
                      placeholder="45,00"
                      value={p.preco}
                      onChange={(e) => mudaProduto(i, { preco: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`catalogo-${i}-link`}>{t("Link de pagamento")}</Label>
                  <Input
                    id={`catalogo-${i}-link`}
                    type="url"
                    maxLength={300}
                    placeholder="https://"
                    value={p.link}
                    onChange={(e) => mudaProduto(i, { link: e.target.value })}
                    disabled={readOnly}
                  />
                  <p className="text-xs text-text-muted">{t("O link precisa cobrar exatamente o valor ao lado.")}</p>
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`catalogo-${i}-descricao`}>{t("O que é")}</Label>
                  <Textarea
                    id={`catalogo-${i}-descricao`}
                    rows={2}
                    maxLength={300}
                    placeholder={t("Em uma ou duas frases.")}
                    value={p.descricao}
                    onChange={(e) => mudaProduto(i, { descricao: e.target.value })}
                    disabled={readOnly}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <Label htmlFor={`catalogo-${i}-recebe`}>{t("O que a pessoa recebe")}</Label>
                  <Input
                    id={`catalogo-${i}-recebe`}
                    maxLength={200}
                    placeholder={t("ex.: dois áudios e o passo a passo por escrito")}
                    value={p.recebe}
                    onChange={(e) => mudaProduto(i, { recebe: e.target.value })}
                    disabled={readOnly}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-text">{t("Como é entregue")}</span>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Como é entregue")}>
                    {ENTREGAS.map((e) => (
                      <Button
                        key={e.valor}
                        type="button"
                        size="sm"
                        role="radio"
                        aria-checked={p.entrega === e.valor}
                        variant={p.entrega === e.valor ? "default" : "outline"}
                        disabled={readOnly}
                        onClick={() => mudaProduto(i, { entrega: e.valor })}
                      >
                        {t(e.rotulo)}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-text-muted">{t(ENTREGAS.find((e) => e.valor === p.entrega)?.dica ?? "")}</p>
                </div>

                <ListaDeChips
                  id={`catalogo-${i}-pede`}
                  rotulo={t("O que pedir à pessoa antes de entregar")}
                  dica={t("Digite cada dado e aperte Enter. Deixe vazio se não precisa de nada.")}
                  placeholder={t("ex.: data de nascimento")}
                  itens={p.pede}
                  aoMudar={(pede) => mudaProduto(i, { pede })}
                  desabilitado={readOnly}
                  max={MAX_DADOS_A_PEDIR}
                  tamanhoMax={80}
                  proibidos={PROIBIDOS_NA_LISTA}
                />

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`catalogo-${i}-depois-de`}>{t("Oferecer depois da compra de")}</Label>
                    <Input
                      id={`catalogo-${i}-depois-de`}
                      maxLength={80}
                      placeholder={t("Em branco = depois de qualquer compra")}
                      value={p.depoisDe}
                      onChange={(e) => mudaProduto(i, { depoisDe: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`catalogo-${i}-horas`}>{t("Espera (horas)")}</Label>
                    <Input
                      id={`catalogo-${i}-horas`}
                      inputMode="numeric"
                      value={p.horas}
                      onChange={(e) => mudaProduto(i, { horas: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor={`catalogo-${i}-ativo`} className="text-sm text-text-muted">
                    {t("O agente pode oferecer este produto")}
                  </Label>
                  <Switch
                    id={`catalogo-${i}-ativo`}
                    checked={p.ativo}
                    onCheckedChange={(v) => mudaProduto(i, { ativo: v })}
                    disabled={readOnly}
                  />
                </div>
              </div>
            );
          })}

          {form.produtos.length < MAX_PRODUTOS_DO_CATALOGO && !readOnly ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => patch({ produtos: [...form.produtos, { ...PRODUTO_VAZIO }] })}
              >
                {t("Adicionar produto")}
              </Button>
            </div>
          ) : null}
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar catálogo")}
            </Button>
          </div>
        ) : null}
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-do-catalogo" />
    </div>
  );
}
