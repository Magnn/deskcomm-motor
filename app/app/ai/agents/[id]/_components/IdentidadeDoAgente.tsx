"use client";
/**
 * A aba "Identidade": como o agente se chama, de que empresa fala e com que tom.
 *
 * Primeira das abas ESTRUTURADAS da configuração do agente. Em vez de pedir ao dono do negócio que
 * escreva tudo em prosa nas instruções, a tela pede campos — nome, empresa, público, tom — e o sistema os
 * compila num bloco literal que o agente lê a cada turno. A coluna da direita mostra esse bloco tal como
 * ele vai: sem mágica, o que está escrito ali é o que o agente recebe.
 *
 * O tom, o tratamento, os emojis e o tamanho são ESCOLHAS (não texto livre): cada uma tem uma frase
 * revisada uma vez, e é ela que vai ao prompt. O que o dono digita entra como dado, numa linha só.
 *
 * A configuração mora em `ai_agents.config.identity` e vale no PRÓXIMO turno, sem publicar versão. Por
 * isso só admin salva: quem edita o cadastro do agente não muda por aqui como ele fala com os clientes.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ListaDeChips } from "@/components/ai/ListaDeChips";
import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { RascunhoComIA } from "@/components/ai/RascunhoComIA";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDeIdentidade } from "@/lib/identidade/bloco-do-prompt";
import {
  DESCRICAO_DO_TOM,
  FRASE_DO_EMOJI,
  FRASE_DO_TAMANHO,
  FRASE_DO_TRATAMENTO,
  MAX_PALAVRAS,
  TAMANHOS,
  TONS,
  TRATAMENTOS,
  USOS_DE_EMOJI,
  identidadeSchema,
  type IdentidadeConfig,
  type Tamanho,
  type Tom,
  type Tratamento,
  type UsoDeEmoji,
} from "@/lib/identidade/tipos";
import { cn } from "@/lib/utils";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface Formulario {
  enabled: boolean;
  nome: string;
  empresa: string;
  oQueFaz: string;
  publico: string;
  apresentacao: string;
  tom: Tom | null;
  tratamento: Tratamento | null;
  emojis: UsoDeEmoji | null;
  mensagens: Tamanho | null;
  palavrasDaCasa: string[];
  palavrasAEvitar: string[];
}

const VAZIO: Formulario = {
  enabled: false,
  nome: "",
  empresa: "",
  oQueFaz: "",
  publico: "",
  apresentacao: "",
  tom: null,
  tratamento: null,
  emojis: null,
  mensagens: null,
  palavrasDaCasa: [],
  palavrasAEvitar: [],
};

function formularioInicial(config: Props["config"]): Formulario {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const bruto = (config as { identity?: unknown } | null | undefined)?.identity;
  const r = identidadeSchema.safeParse(bruto);
  if (!r.success) return VAZIO;
  const c = r.data;
  return {
    enabled: c.enabled,
    nome: c.nome ?? "",
    empresa: c.empresa ?? "",
    oQueFaz: c.o_que_a_empresa_faz ?? "",
    publico: c.publico ?? "",
    apresentacao: c.apresentacao ?? "",
    tom: c.tom ?? null,
    tratamento: c.tratamento ?? null,
    emojis: c.emojis ?? null,
    mensagens: c.mensagens ?? null,
    palavrasDaCasa: c.palavras_da_casa,
    palavrasAEvitar: c.palavras_a_evitar,
  };
}

/** O que o servidor recebe: campo vazio some (é opcional), e o resultado passa no MESMO schema do servidor. */
export function paraCorpo(f: Formulario): { corpo: IdentidadeConfig } | { erro: string } {
  const texto = (v: string): string | undefined => (v.trim() === "" ? undefined : v.trim());
  const candidato = {
    enabled: f.enabled,
    ...(texto(f.nome) !== undefined ? { nome: texto(f.nome) } : {}),
    ...(texto(f.empresa) !== undefined ? { empresa: texto(f.empresa) } : {}),
    ...(texto(f.oQueFaz) !== undefined ? { o_que_a_empresa_faz: texto(f.oQueFaz) } : {}),
    ...(texto(f.publico) !== undefined ? { publico: texto(f.publico) } : {}),
    ...(texto(f.apresentacao) !== undefined ? { apresentacao: texto(f.apresentacao) } : {}),
    ...(f.tom !== null ? { tom: f.tom } : {}),
    ...(f.tratamento !== null ? { tratamento: f.tratamento } : {}),
    ...(f.emojis !== null ? { emojis: f.emojis } : {}),
    ...(f.mensagens !== null ? { mensagens: f.mensagens } : {}),
    palavras_da_casa: f.palavrasDaCasa,
    palavras_a_evitar: f.palavrasAEvitar,
  };
  const r = identidadeSchema.safeParse(candidato);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

interface OpcaoDeEscolha<T extends string> {
  valor: T;
  rotulo: string;
  dica?: string;
}

/** Uma escolha entre poucas opções, como botões — o cliente escolhe, não digita. */
function Escolha<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  desabilitado,
  className,
}: {
  rotulo: string;
  valor: T | null;
  opcoes: OpcaoDeEscolha<T>[];
  aoMudar: (v: T | null) => void;
  desabilitado?: boolean;
  className?: string;
}) {
  const nomeDoGrupo = React.useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span id={nomeDoGrupo} className="text-sm font-medium text-text">
        {rotulo}
      </span>
      <div role="radiogroup" aria-labelledby={nomeDoGrupo} className="flex flex-wrap gap-2">
        {opcoes.map((o) => {
          const ativa = valor === o.valor;
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={ativa}
              disabled={desabilitado}
              // Clicar de novo na escolha atual a desfaz: "não definir" também é uma resposta.
              onClick={() => aoMudar(ativa ? null : o.valor)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                ativa
                  ? "border-accent-500 bg-accent-soft text-accent"
                  : "border-border bg-surface text-text hover:bg-surface-elevated",
              )}
              title={o.dica}
            >
              {o.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function IdentidadeDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));

  /**
   * O que o rascunho por IA propõe é MAIS SOLTO que `identidadeSchema` (ver
   * `lib/rascunho-ia/tipos.ts`) — quem aterrissa o texto no formulário é quem aplica o
   * mesmo teto de caractere que os campos abaixo já mostram na tela (`maxLength`), e quem
   * tira aspas/quebra de linha das palavras é a mesma regra que `identidadeSchema` cobraria
   * no Salvar. Nada disto substitui a validação do servidor; só evita um rascunho torto
   * demais para editar.
   */
  const aoRascunho = (dados: Record<string, unknown>) => {
    const texto = (v: unknown, max: number): string | undefined =>
      typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : undefined;
    const lista = (v: unknown, max: number): string[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const limpo = v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.replace(/["\n\r]/g, "").trim())
        .filter((s) => s !== "" && s.length <= 40)
        .slice(0, max);
      return limpo.length > 0 ? limpo : undefined;
    };

    const nome = texto(dados.nome, 60);
    const empresa = texto(dados.empresa, 80);
    const oQueFaz = texto(dados.o_que_a_empresa_faz, 400);
    const publico = texto(dados.publico, 300);
    const apresentacao = texto(dados.apresentacao, 200);
    const palavrasDaCasa = lista(dados.palavras_da_casa, MAX_PALAVRAS);
    const palavrasAEvitar = lista(dados.palavras_a_evitar, MAX_PALAVRAS);

    patch({
      ...(nome !== undefined ? { nome } : {}),
      ...(empresa !== undefined ? { empresa } : {}),
      ...(oQueFaz !== undefined ? { oQueFaz } : {}),
      ...(publico !== undefined ? { publico } : {}),
      ...(apresentacao !== undefined ? { apresentacao } : {}),
      ...(palavrasDaCasa !== undefined ? { palavrasDaCasa } : {}),
      ...(palavrasAEvitar !== undefined ? { palavrasAEvitar } : {}),
    });
  };

  // A prévia é o bloco REAL: a mesma função que o turno usa, sobre os mesmos campos, com o interruptor
  // ligado (desligada, a pessoa ainda vê o que passaria a valer).
  const previa = React.useMemo(() => {
    const r = paraCorpo({ ...form, enabled: true });
    return "corpo" in r ? blocoDeIdentidade(r.corpo).trim() : "";
  }, [form]);

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/identidade`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Identidade salva. Vale a partir da próxima conversa.")
          : t("Identidade desligada. O agente volta a usar só as instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="identidade-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Identidade e tom")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "Diga quem é o agente e como ele fala. Você escolhe e preenche campos, e o sistema os transforma na instrução que o agente lê a cada conversa. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
              disabled={readOnly}
              aria-label={t("Usar esta identidade")}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-sm font-medium">{t("Quem é o agente")}</h3>
            {!readOnly ? (
              <RascunhoComIA agentId={agentId} campo="identidade" onRascunho={aoRascunho} />
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="identidade-nome">{t("Como ele se chama")}</Label>
              <Input
                id="identidade-nome"
                placeholder="Ana"
                maxLength={60}
                value={form.nome}
                onChange={(e) => patch({ nome: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="identidade-empresa">{t("Nome da empresa")}</Label>
              <Input
                id="identidade-empresa"
                placeholder={t("Clínica Bem-Estar")}
                maxLength={80}
                value={form.empresa}
                onChange={(e) => patch({ empresa: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="identidade-o-que-faz">{t("O que a empresa faz")}</Label>
            <Textarea
              id="identidade-o-que-faz"
              rows={2}
              maxLength={400}
              placeholder={t("Em poucas palavras: o que vocês vendem ou oferecem.")}
              value={form.oQueFaz}
              onChange={(e) => patch({ oQueFaz: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="identidade-publico">{t("Quem vocês atendem")}</Label>
            <Textarea
              id="identidade-publico"
              rows={2}
              maxLength={300}
              placeholder={t("O perfil de quem costuma chegar até vocês.")}
              value={form.publico}
              onChange={(e) => patch({ publico: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="identidade-apresentacao">{t("Como ele se apresenta")}</Label>
            <Textarea
              id="identidade-apresentacao"
              rows={2}
              maxLength={200}
              placeholder={t("Oi! Aqui é a Ana, da Clínica Bem-Estar. Como posso te chamar?")}
              value={form.apresentacao}
              onChange={(e) => patch({ apresentacao: e.target.value })}
              disabled={readOnly}
            />
            <p className="text-xs text-text-muted">
              {t("A primeira mensagem do agente usa exatamente estas palavras.")}
            </p>
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("Como ele fala")}</h3>

          <div className="flex flex-col gap-1.5">
            <span id="identidade-tom-rotulo" className="text-sm font-medium text-text">
              {t("Tom de voz")}
            </span>
            <div role="radiogroup" aria-labelledby="identidade-tom-rotulo" className="grid gap-2 sm:grid-cols-2">
              {TONS.map((tom) => {
                const ativo = form.tom === tom;
                return (
                  <button
                    key={tom}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={readOnly}
                    onClick={() => patch({ tom: ativo ? null : tom })}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      ativo
                        ? "border-accent-500 bg-accent-soft ring-1 ring-accent-500"
                        : "border-border bg-surface hover:bg-surface-elevated",
                    )}
                  >
                    <span className={cn("text-sm font-medium", ativo ? "text-accent" : "text-text")}>
                      {t(DESCRICAO_DO_TOM[tom].rotulo)}
                    </span>
                    <span className="text-xs text-text-muted">{t(DESCRICAO_DO_TOM[tom].tela)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Escolha
              rotulo={t("Tratamento")}
              valor={form.tratamento}
              aoMudar={(tratamento) => patch({ tratamento })}
              desabilitado={readOnly}
              opcoes={TRATAMENTOS.map((v) => ({
                valor: v,
                rotulo: v === "voce" ? t("Você") : t("O senhor / a senhora"),
                dica: FRASE_DO_TRATAMENTO[v],
              }))}
            />
            <Escolha
              rotulo={t("Tamanho das mensagens")}
              valor={form.mensagens}
              aoMudar={(mensagens) => patch({ mensagens })}
              desabilitado={readOnly}
              opcoes={TAMANHOS.map((v) => ({
                valor: v,
                rotulo: v === "curto" ? t("Curtas") : t("Médias"),
                dica: FRASE_DO_TAMANHO[v],
              }))}
            />
            <Escolha
              rotulo={t("Emojis")}
              valor={form.emojis}
              aoMudar={(emojis) => patch({ emojis })}
              desabilitado={readOnly}
              className="md:col-span-2"
              opcoes={USOS_DE_EMOJI.map((v) => ({
                valor: v,
                rotulo: v === "nenhum" ? t("Nenhum") : v === "parcimonia" ? t("Com parcimônia") : t("À vontade"),
                dica: FRASE_DO_EMOJI[v],
              }))}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-medium">{t("O vocabulário da casa")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <ListaDeChips
              id="identidade-palavras-da-casa"
              rotulo={t("Palavras que a casa usa")}
              dica={t("Digite e aperte Enter. O agente as usa quando couber.")}
              placeholder={t("ex.: bem-vinda")}
              itens={form.palavrasDaCasa}
              aoMudar={(palavrasDaCasa) => patch({ palavrasDaCasa })}
              desabilitado={readOnly}
            />
            <ListaDeChips
              id="identidade-palavras-a-evitar"
              rotulo={t("Palavras que ele nunca usa")}
              dica={t("Digite e aperte Enter. O agente evita estas palavras.")}
              placeholder={t("ex.: problema")}
              itens={form.palavrasAEvitar}
              aoMudar={(palavrasAEvitar) => patch({ palavrasAEvitar })}
              desabilitado={readOnly}
            />
          </div>
        </Card>

        {!readOnly ? (
          <div className="flex justify-end">
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar identidade")}
            </Button>
          </div>
        ) : null}
      </div>

      <PreviaDoBloco texto={previa} ligada={form.enabled} testId="previa-da-identidade" />
    </div>
  );
}
