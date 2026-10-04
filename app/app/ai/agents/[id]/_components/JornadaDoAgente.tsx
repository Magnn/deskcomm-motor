"use client";
/**
 * A aba "Jornada": as etapas da conversa, na ordem em que o atendimento anda.
 *
 * O dono escreve cada etapa em linguagem dele (o objetivo), diz o que precisa ser coletado e quando a etapa
 * termina, e marca a partir de onde a oferta, o preço e o link podem aparecer. O CÓDIGO conta em que etapa
 * a conversa está (`lib/jornada/estado.ts`); o prompt recebe só a etapa atual; o envio veta preço e link
 * antes da hora.
 *
 * O simulador da direita é a mesma função do turno: cole uma conversa e veja em que etapa ela estaria e o
 * bloco exato que o agente leria. Sem modelo, sem custo, sem mágica.
 *
 * A configuração mora em `ai_agents.config.journey` e vale no PRÓXIMO turno, sem publicar versão. Por isso
 * só admin salva.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PreviaDoBloco } from "@/components/ai/PreviaDoBloco";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { blocoDaJornada } from "@/lib/jornada/bloco-do-prompt";
import { estadoDaJornada, type EstadoDaJornada } from "@/lib/jornada/estado";
import { MODELOS_DE_JORNADA } from "@/lib/jornada/modelos";
import {
  LIBERACOES,
  MAX_CAMPOS_POR_ETAPA,
  MAX_ETAPAS,
  TAMANHO_NOME,
  TAMANHO_OBJETIVO,
  TAMANHO_ROTULO,
  jornadaSchema,
  type CampoDaEtapa,
  type EtapaDaJornada,
  type JornadaConfig,
  type Liberacao,
  type TipoDeCampo,
} from "@/lib/jornada/tipos";
import { ArrowDown, ArrowUp, Plus, Trash } from "@/lib/ui/icons";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

const ROTULO_DA_LIBERACAO: Record<Liberacao, string> = { oferta: "Oferta", preco: "Preço", link: "Link de pagamento" };
const ROTULO_DO_TIPO: Record<TipoDeCampo, string> = { texto: "Resposta livre", data: "Data", numeros: "Números" };

const VAZIA: JornadaConfig = { enabled: false, etapas: [] };

function jornadaInicial(config: Props["config"]): JornadaConfig {
  // Aqui o `enabled: false` também vale: a tela mostra o que o dono já preencheu mesmo desligada.
  const r = jornadaSchema.safeParse((config as { journey?: unknown } | null | undefined)?.journey);
  return r.success ? r.data : VAZIA;
}

/** Um identificador estável e único, para etapa ou campo novo (o dono nunca o vê). */
function novoId(prefixo: string, usados: readonly string[]): string {
  let n = usados.length + 1;
  while (usados.includes(`${prefixo}${n}`)) n += 1;
  return `${prefixo}${n}`;
}

/** O que o servidor recebe: o MESMO schema do servidor, e o motivo da recusa volta legível. */
export function paraCorpo(j: JornadaConfig): { corpo: JornadaConfig } | { erro: string } {
  const r = jornadaSchema.safeParse(j);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  return { corpo: r.data };
}

const CONVERSA_DE_EXEMPLO = "Lead: oi\nAgente: Seja bem-vinda! Vamos começar?\nLead: sim";

export function JornadaDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [jornada, setJornada] = React.useState<JornadaConfig>(() => jornadaInicial(config));
  const [conversa, setConversa] = React.useState(CONVERSA_DE_EXEMPLO);
  const [salvando, setSalvando] = React.useState(false);

  const mudarEtapa = (i: number, p: Partial<EtapaDaJornada>) =>
    setJornada((j) => ({ ...j, etapas: j.etapas.map((e, k) => (k === i ? { ...e, ...p } : e)) }));
  const mudarCampo = (i: number, c: number, p: Partial<CampoDaEtapa>) =>
    mudarEtapa(i, { campos: jornada.etapas[i]!.campos.map((x, k) => (k === c ? { ...x, ...p } : x)) });
  const mover = (i: number, d: -1 | 1) =>
    setJornada((j) => {
      const etapas = [...j.etapas];
      const [e] = etapas.splice(i, 1);
      etapas.splice(i + d, 0, e!);
      return { ...j, etapas };
    });
  const todasAsChaves = jornada.etapas.flatMap((e) => e.campos.map((c) => c.chave));

  const adicionarEtapa = () =>
    setJornada((j) => ({
      ...j,
      etapas: [
        ...j.etapas,
        { id: novoId("etapa_", j.etapas.map((e) => e.id)), nome: "", objetivo: "", campos: [], saida: "resposta", libera: [] },
      ],
    }));
  const adicionarCampo = (i: number) =>
    mudarEtapa(i, {
      campos: [...jornada.etapas[i]!.campos, { chave: novoId("campo_", todasAsChaves), rotulo: "", tipo: "texto" }],
    });
  const mudarTipo = (i: number, c: number, tipo: TipoDeCampo) =>
    mudarCampo(i, c, tipo === "numeros" ? { tipo, quantidade: 3, minimo: 1, maximo: 10 } : { tipo, quantidade: undefined, minimo: undefined, maximo: undefined });
  const alternarLiberacao = (i: number, l: Liberacao) => {
    const atual = jornada.etapas[i]!.libera;
    mudarEtapa(i, { libera: atual.includes(l) ? atual.filter((x) => x !== l) : [...atual, l] });
  };
  /** A partir de que etapa cada item já está liberado (para a tela dizer "liberado desde a etapa N"). */
  const liberadoDesde = (l: Liberacao): number => jornada.etapas.findIndex((e) => e.libera.includes(l));

  const usarModelo = (chave: string) => {
    const m = MODELOS_DE_JORNADA.find((x) => x.chave === chave);
    if (!m) return;
    if (jornada.etapas.length > 0 && !window.confirm(t("Trocar as etapas atuais pelas do modelo?"))) return;
    setJornada({ ...m.jornada, enabled: jornada.enabled });
  };

  // O simulador: a MESMA função do turno, sobre a conversa colada (uma fala por linha, "Lead:" ou "Agente:").
  const simulacao = React.useMemo((): { erro: string } | { estado: EstadoDaJornada; bloco: string } => {
    const r = paraCorpo({ ...jornada, enabled: true });
    if ("erro" in r) return { erro: r.erro };
    const estado = estadoDaJornada(r.corpo, conversa.trim() === "" ? [] : [{ direction: "inbound", body: conversa }]);
    return { estado, bloco: blocoDaJornada(r.corpo, estado).trim() };
  }, [jornada, conversa]);

  const salvar = async () => {
    const r = paraCorpo(jornada);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/jornada`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        jornada.enabled
          ? t("Jornada salva. Vale a partir da próxima conversa.")
          : t("Jornada desligada. O agente volta a conduzir só pelas instruções dele."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]" data-testid="jornada-do-agente">
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-medium">{t("Jornada")}</h2>
              <p className="max-w-2xl text-sm text-text-muted">
                {t(
                  "As etapas do atendimento, na ordem. O sistema conta em que etapa cada conversa está, mostra ao agente só a etapa atual e não deixa o preço nem o link saírem antes da etapa que os libera. Vale a partir da próxima conversa, sem publicar versão.",
                )}
              </p>
            </div>
            <Switch
              checked={jornada.enabled}
              onCheckedChange={(v) => setJornada((j) => ({ ...j, enabled: v }))}
              disabled={readOnly}
              aria-label={t("Usar esta jornada")}
            />
          </div>
          {!readOnly ? (
            <div className="flex flex-col gap-2" data-testid="modelos-de-jornada">
              <span className="text-xs text-text-muted">{t("Começar de um modelo (dá para editar tudo depois):")}</span>
              <div className="flex flex-wrap gap-2">
                {MODELOS_DE_JORNADA.map((m) => (
                  <Button key={m.chave} type="button" size="sm" variant="outline" onClick={() => usarModelo(m.chave)} title={t(m.descricao)}>
                    {t(m.nome)}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        {jornada.etapas.map((etapa, i) => (
          <Card key={etapa.id} className="flex flex-col gap-3 p-4" data-testid={`etapa-${i + 1}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {i + 1}
              </span>
              <Input
                value={etapa.nome}
                onChange={(e) => mudarEtapa(i, { nome: e.target.value })}
                placeholder={t("Nome da etapa (ex.: Acolhida)")}
                maxLength={TAMANHO_NOME}
                disabled={readOnly}
                aria-label={t("Nome da etapa")}
              />
              {!readOnly ? (
                <div className="flex shrink-0 gap-1">
                  <Button type="button" size="sm" variant="ghost" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={t("Subir etapa")}>
                    <ArrowUp size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={i === jornada.etapas.length - 1}
                    onClick={() => mover(i, 1)}
                    aria-label={t("Descer etapa")}
                  >
                    <ArrowDown size={14} />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setJornada((j) => ({ ...j, etapas: j.etapas.filter((_, k) => k !== i) }))}
                    aria-label={t("Remover etapa")}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              ) : null}
            </div>

            <Textarea
              value={etapa.objetivo}
              onChange={(e) => mudarEtapa(i, { objetivo: e.target.value.replace(/\n/g, " ") })}
              placeholder={t("O que esta etapa precisa conseguir, em uma ou duas frases.")}
              maxLength={TAMANHO_OBJETIVO}
              rows={2}
              disabled={readOnly}
              aria-label={t("Objetivo da etapa")}
            />

            {etapa.campos.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium">{t("O que coletar")}</span>
                {etapa.campos.map((campo, c) => (
                  <div key={campo.chave} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="min-w-40 flex-1"
                      value={campo.rotulo}
                      onChange={(e) => mudarCampo(i, c, { rotulo: e.target.value })}
                      placeholder={t("ex.: Data de nascimento")}
                      maxLength={TAMANHO_ROTULO}
                      disabled={readOnly}
                      aria-label={t("Nome do campo")}
                    />
                    <div className="flex gap-1" role="group" aria-label={t("Tipo do campo")}>
                      {(Object.keys(ROTULO_DO_TIPO) as TipoDeCampo[]).map((tipo) => (
                        <Button
                          key={tipo}
                          type="button"
                          size="sm"
                          variant={campo.tipo === tipo ? "default" : "outline"}
                          disabled={readOnly}
                          onClick={() => mudarTipo(i, c, tipo)}
                        >
                          {t(ROTULO_DO_TIPO[tipo])}
                        </Button>
                      ))}
                    </div>
                    {campo.tipo === "numeros" ? (
                      <div className="flex items-center gap-1 text-xs text-text-muted">
                        <Input
                          type="number"
                          className="w-16"
                          value={campo.quantidade ?? ""}
                          onChange={(e) => mudarCampo(i, c, { quantidade: Number(e.target.value) })}
                          disabled={readOnly}
                          aria-label={t("Quantos números")}
                        />
                        {t("números de")}
                        <Input
                          type="number"
                          className="w-16"
                          value={campo.minimo ?? ""}
                          onChange={(e) => mudarCampo(i, c, { minimo: Number(e.target.value) })}
                          disabled={readOnly}
                          aria-label={t("Menor número")}
                        />
                        {t("a")}
                        <Input
                          type="number"
                          className="w-16"
                          value={campo.maximo ?? ""}
                          onChange={(e) => mudarCampo(i, c, { maximo: Number(e.target.value) })}
                          disabled={readOnly}
                          aria-label={t("Maior número")}
                        />
                      </div>
                    ) : null}
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => mudarEtapa(i, { campos: etapa.campos.filter((_, k) => k !== c) })}
                        aria-label={t("Remover campo")}
                      >
                        <Trash size={14} />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {!readOnly && etapa.campos.length < MAX_CAMPOS_POR_ETAPA ? (
                <Button type="button" size="sm" variant="outline" onClick={() => adicionarCampo(i)}>
                  <Plus size={14} /> {t("Coletar um dado")}
                </Button>
              ) : null}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-muted">{t("Termina quando")}</span>
                <div className="flex gap-1" role="group" aria-label={t("Quando a etapa termina")}>
                  <Button
                    type="button"
                    size="sm"
                    variant={etapa.saida === "resposta" ? "default" : "outline"}
                    disabled={readOnly}
                    onClick={() => mudarEtapa(i, { saida: "resposta" })}
                  >
                    {t("a pessoa responde")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={etapa.saida === "campos" ? "default" : "outline"}
                    disabled={readOnly || etapa.campos.length === 0}
                    onClick={() => mudarEtapa(i, { saida: "campos" })}
                  >
                    {t("os dados chegam")}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-text-muted">{t("A partir daqui pode falar de")}</span>
              {LIBERACOES.map((l) => {
                const desde = liberadoDesde(l);
                const herdado = desde !== -1 && desde < i;
                return (
                  <Button
                    key={l}
                    type="button"
                    size="sm"
                    variant={etapa.libera.includes(l) || herdado ? "default" : "outline"}
                    disabled={readOnly || herdado}
                    onClick={() => alternarLiberacao(i, l)}
                    title={herdado ? `${t("Já liberado na etapa")} ${desde + 1}` : undefined}
                  >
                    {t(ROTULO_DA_LIBERACAO[l])}
                  </Button>
                );
              })}
            </div>
          </Card>
        ))}

        {!readOnly ? (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={adicionarEtapa} disabled={jornada.etapas.length >= MAX_ETAPAS}>
              <Plus size={14} /> {t("Adicionar etapa")}
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={salvando || jornada.etapas.length === 0}>
              {salvando ? t("Salvando…") : t("Salvar jornada")}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-2 p-4" data-testid="simulador-da-jornada">
          <h3 className="text-sm font-medium">{t("Simular uma conversa")}</h3>
          <p className="text-xs text-text-muted">
            {t("Uma fala por linha, começando com Lead: ou Agente:. O sistema mostra em que etapa a conversa estaria.")}
          </p>
          <Textarea value={conversa} onChange={(e) => setConversa(e.target.value)} rows={7} aria-label={t("Conversa para simular")} />
          {"erro" in simulacao ? (
            <p className="text-xs text-text-muted">{t(simulacao.erro)}</p>
          ) : (
            <div className="space-y-1 text-sm" data-testid="etapa-simulada">
              <p>
                <span className="font-medium">
                  {t("Etapa")} {simulacao.estado.indice + 1} {t("de")} {simulacao.estado.total}:
                </span>{" "}
                {simulacao.estado.etapa.nome}
              </p>
              {simulacao.estado.faltam.length > 0 ? (
                <p className="text-xs text-text-muted">
                  {t("Falta:")} {simulacao.estado.faltam.map((c) => c.rotulo).join(", ")}
                </p>
              ) : null}
            </div>
          )}
        </Card>
        <PreviaDoBloco texto={"erro" in simulacao ? "" : simulacao.bloco} ligada={jornada.enabled} testId="previa-da-jornada" />
      </div>
    </div>
  );
}
