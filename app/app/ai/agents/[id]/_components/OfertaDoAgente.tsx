"use client";
/**
 * A aba "Oferta": o que a empresa vende, em fatos — produtos, o que inclui, para quem, como é entregue,
 * a garantia REAL e o que o agente nunca deve prometer.
 *
 * Segunda das abas ESTRUTURADAS da configuração do agente. O que o agente sabe sobre o que vende costuma
 * estar em prosa nas instruções, e é ali que ele inventa. Aqui o dono declara os fatos, e o sistema os
 * compila num bloco que diz ao agente "use SÓ estes fatos". A coluna da direita mostra esse bloco tal como
 * ele vai.
 *
 * O PREÇO não está aqui, de propósito: tem aba própria e é a única fonte de valor e de desconto.
 *
 * A configuração mora em `ai_agents.config.offer` e vale no PRÓXIMO turno, sem publicar versão. Por isso só
 * admin salva: quem edita o cadastro do agente não muda por aqui o que ele diz que a empresa vende.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { blocoDeOferta } from "@/lib/oferta/bloco-do-prompt";
import {
  MAX_ITENS_INCLUIDOS,
  MAX_NAO_OFERECEMOS,
  MAX_PRODUTOS,
  ofertaSchema,
  type OfertaConfig,
} from "@/lib/oferta/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface ProdutoNaTela {
  nome: string;
  resumo: string;
  paraQuem: string;
  entrega: string;
  inclui: string[];
}

interface Formulario {
  enabled: boolean;
  produtos: ProdutoNaTela[];
  garantia: string;
  naoOferecemos: string[];
}

const PRODUTO_VAZIO: ProdutoNaTela = { nome: "", resumo: "", paraQuem: "", entrega: "", inclui: [] };
const VAZIO: Formulario = { enabled: false, produtos: [], garantia: "", naoOferecemos: [] };

/** Item de lista que o servidor aceita: sem aspas duplas, ponto e vírgula nem quebra de linha. */
const PROIBIDOS_NA_LISTA = ['"', ";", "\n"] as const;

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { offer?: unknown } | null | undefined)?.offer;
  const r = ofertaSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  const c = r.data;
  return {
    enabled: c.enabled,
    produtos: c.produtos.map((p) => ({
      nome: p.nome,
      resumo: p.resumo ?? "",
      paraQuem: p.para_quem ?? "",
      entrega: p.entrega ?? "",
      inclui: p.inclui,
    })),
    garantia: c.garantia ?? "",
    naoOferecemos: c.nao_oferecemos,
  };
}

/** O que o servidor recebe: campo vazio some (é opcional), e o resultado passa no MESMO schema do servidor. */
export function paraCorpo(f: Formulario): { corpo: OfertaConfig } | { erro: string } {
  const texto = (v: string): string | undefined => (v.trim() === "" ? undefined : v.trim());
  if (f.produtos.some((p) => p.nome.trim() === "")) return { erro: "Dê um nome a cada produto." };
  const candidato = {
    enabled: f.enabled,
    produtos: f.produtos.map((p) => ({
      nome: p.nome.trim(),
      ...(texto(p.resumo) !== undefined ? { resumo: texto(p.resumo) } : {}),
      ...(texto(p.paraQuem) !== undefined ? { para_quem: texto(p.paraQuem) } : {}),
      ...(texto(p.entrega) !== undefined ? { entrega: texto(p.entrega) } : {}),
      inclui: p.inclui,
    })),
    ...(texto(f.garantia) !== undefined ? { garantia: texto(f.garantia) } : {}),
    nao_oferecemos: f.naoOferecemos,
  };
  const r = ofertaSchema.safeParse(candidato);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

export function OfertaDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));
  const mudaProduto = (i: number, p: Partial<ProdutoNaTela>) =>
    setForm((f) => ({ ...f, produtos: f.produtos.map((x, j) => (j === i ? { ...x, ...p } : x)) }));

  // A prévia é o bloco REAL: a mesma função que o turno usa, sobre os mesmos campos, com o interruptor
  // ligado (desligada, a pessoa ainda vê o que passaria a valer). Produto sem nome ainda não entra.
  const previa = React.useMemo(() => {
    const r = paraCorpo({ ...form, enabled: true, produtos: form.produtos.filter((p) => p.nome.trim() !== "") });
    return "corpo" in r ? blocoDeOferta(r.corpo).trim() : "";
  }, [form]);

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/oferta`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Oferta salva. Vale a partir da próxima conversa.")
          : t("Oferta desligada. O agente volta a usar só as instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="oferta-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Oferta")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Diga o que a empresa vende, em fatos. O agente usa só o que estiver aqui e não inventa o resto. O valor não vai aqui: ele vem da aba Preço. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar esta oferta")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">{t("Produtos e serviços")}</h3>
            <p className="text-xs text-text-muted">
              {t("Um cartão por produto. Se vocês vendem uma coisa só, preencha um.")}
            </p>
          </div>

          {form.produtos.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-text-muted">
              {t("Nenhum produto ainda. Adicione o primeiro para o agente saber o que vocês vendem.")}
            </p>
          ) : null}

          {form.produtos.map((p, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3" data-testid={`produto-${i}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text">{`${t("Produto")} ${i + 1}`}</span>
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
              <div className="flex flex-col gap-1">
                <Label htmlFor={`oferta-produto-${i}-nome`}>{t("Nome do produto")}</Label>
                <Input
                  id={`oferta-produto-${i}-nome`}
                  maxLength={80}
                  placeholder={t("Como a pessoa o conhece")}
                  value={p.nome}
                  onChange={(e) => mudaProduto(i, { nome: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`oferta-produto-${i}-resumo`}>{t("O que é")}</Label>
                <Textarea
                  id={`oferta-produto-${i}-resumo`}
                  rows={2}
                  maxLength={300}
                  placeholder={t("Em uma ou duas frases.")}
                  value={p.resumo}
                  onChange={(e) => mudaProduto(i, { resumo: e.target.value })}
                  disabled={readOnly}
                />
              </div>
              <ListaDeChips
                id={`oferta-produto-${i}-inclui`}
                rotulo={t("O que inclui")}
                dica={t("Digite cada item e aperte Enter.")}
                placeholder={t("ex.: leitura completa em PDF")}
                itens={p.inclui}
                aoMudar={(inclui) => mudaProduto(i, { inclui })}
                desabilitado={readOnly}
                max={MAX_ITENS_INCLUIDOS}
                tamanhoMax={120}
                proibidos={PROIBIDOS_NA_LISTA}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`oferta-produto-${i}-para-quem`}>{t("Para quem é")}</Label>
                  <Input
                    id={`oferta-produto-${i}-para-quem`}
                    maxLength={200}
                    value={p.paraQuem}
                    onChange={(e) => mudaProduto(i, { paraQuem: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`oferta-produto-${i}-entrega`}>{t("Como é entregue")}</Label>
                  <Input
                    id={`oferta-produto-${i}-entrega`}
                    maxLength={200}
                    placeholder={t("ex.: por e-mail, em até 24 horas")}
                    value={p.entrega}
                    onChange={(e) => mudaProduto(i, { entrega: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>
          ))}

          {form.produtos.length < MAX_PRODUTOS && !readOnly ? (
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

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("Garantia e o que a empresa não faz")}</h3>
          <div className="flex flex-col gap-1">
            <Label htmlFor="oferta-garantia">{t("Garantia e reembolso (opcional)")}</Label>
            <Textarea
              id="oferta-garantia"
              rows={3}
              maxLength={300}
              placeholder={t("A política real da empresa, com as suas palavras.")}
              value={form.garantia}
              onChange={(e) => patch({ garantia: e.target.value })}
              disabled={readOnly}
            />
            <p className="text-xs text-text-muted">
              {t(
                "Quando a pessoa perguntar, o agente diz só isto, sem acrescentar prazo nem condição. Se a empresa não oferece garantia, deixe em branco.",
              )}
            </p>
          </div>
          <ListaDeChips
            id="oferta-nao-oferecemos"
            rotulo={t("O que a empresa não oferece")}
            dica={t("O agente nunca promete nem oferece estas coisas. Digite e aperte Enter.")}
            placeholder={t("ex.: entrega aos domingos")}
            itens={form.naoOferecemos}
            aoMudar={(naoOferecemos) => patch({ naoOferecemos })}
            desabilitado={readOnly}
            max={MAX_NAO_OFERECEMOS}
            tamanhoMax={120}
            proibidos={PROIBIDOS_NA_LISTA}
          />
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar oferta")}
            </Button>
          </div>
        ) : null}
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-da-oferta" />
    </div>
  );
}
