"use client";

/**
 * O painel "Escalar": como a operação está hoje, a meta de receita em cascata (dia, semana, mês,
 * trimestre) com o ritmo de cada recorte, o simulador da conta (contatos × conversão × gasto por
 * compradora) e o plano que sai dela. Dados de `GET /api/v1/escalar`; meta gravada por
 * `PUT /api/v1/settings/metas`. A régua mora em `lib/venda/meta-de-receita.ts`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { useT } from "@/hooks/i18n/useT";
import { contatosParaAMeta, conversaoDe, porCompradoraDe, projetarMes, type Recorte, type Ritmo } from "@/lib/venda/meta-de-receita";
import type { PainelDeEscala } from "@/lib/venda/painel-de-escala";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const reais = (centavos: number) => moeda.format(Math.round(centavos / 100));
const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct = (x: number, casas = 1) => `${(x * 100).toFixed(casas).replace(".", ",")}%`;

const CARTAO = "bg-surface p-4 rounded-2xl border border-border shadow-sm";

function SeloDoRitmo({ ritmo }: { ritmo: Ritmo }) {
  const t = useT();
  const estilo: Record<Ritmo, string> = {
    adiantada: "bg-success/15 text-success",
    no_ritmo: "bg-accent/15 text-accent",
    atrasada: "bg-warning/15 text-warning",
  };
  const nome: Record<Ritmo, string> = { adiantada: t("Adiantada"), no_ritmo: t("No ritmo"), atrasada: t("Atrasada") };
  const icone: Record<Ritmo, string> = { adiantada: "▲", no_ritmo: "●", atrasada: "▼" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${estilo[ritmo]}`}>
      <span aria-hidden>{icone[ritmo]}</span>
      {nome[ritmo]}
    </span>
  );
}

function CartaoDoRecorte({ titulo, r, testid }: { titulo: string; r: Recorte; testid: string }) {
  const t = useT();
  const feito = r.meta > 0 ? Math.min(1, r.feito / r.meta) : 0;
  const previsto = r.meta > 0 ? Math.min(1, r.previsto / r.meta) : 0;
  return (
    <div className={`${CARTAO} space-y-3`} data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text">{titulo}</span>
        <SeloDoRitmo ritmo={r.ritmo} />
      </div>
      <div>
        <div className="text-2xl font-bold text-text tabular-nums">{reais(r.feito)}</div>
        <div className="text-xs text-text-muted tabular-nums">
          {t("de")} {reais(r.meta)} · {r.meta > 0 ? pct(r.feito / r.meta, 0) : "—"}
        </div>
      </div>
      <div className="relative h-2 rounded-full bg-surface-elevated" title={t("A marca é onde devia estar agora")}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(feito * 100))}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-text" style={{ left: `${Math.round(previsto * 100)}%` }} aria-hidden />
      </div>
      <div className="flex justify-between text-[11px] text-text-muted tabular-nums">
        <span>
          {t("Previsto até agora")}: {reais(r.previsto)}
        </span>
        <span>
          {t("Fecha em")}: {reais(r.projecao)}
        </span>
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{rotulo}</div>
      <div className="text-lg font-bold text-text tabular-nums">{valor}</div>
      {detalhe ? <div className="text-[11px] text-text-muted tabular-nums">{detalhe}</div> : null}
    </div>
  );
}

function Deslizante(props: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  passo: number;
  mostrar: (v: number) => string;
  aoMudar: (v: number) => void;
  testid: string;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-text">{props.rotulo}</span>
        <span className="font-semibold text-text tabular-nums">{props.mostrar(props.valor)}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.passo}
        value={props.valor}
        onChange={(e) => props.aoMudar(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
        data-testid={props.testid}
      />
    </label>
  );
}

interface FormDaMeta {
  mensal: string;
  trimestral: string;
  conversao: string;
  porCompradora: string;
  planejados: string;
}

export function EscalarClient() {
  const t = useT();
  const [dados, setDados] = useState<PainelDeEscala | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<FormDaMeta>({ mensal: "", trimestral: "", conversao: "", porCompradora: "", planejados: "" });
  // O simulador: começa nos alvos gravados (ou nos números de hoje) e não grava nada.
  const [simMexido, setSimMexido] = useState<{ contatos: number; conversao: number; porCompradora: number } | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/v1/escalar", { cache: "no-store" });
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      setErro(json?.error?.message ?? t("Não foi possível ler o painel."));
      return;
    }
    setErro(null);
    setDados(json.data as PainelDeEscala);
  }, [t]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const conta = useMemo(() => {
    if (!dados) return null;
    const projetado = projetarMes(dados.funil.mes, dados.diasCorridos, dados.diasDoMes);
    const conversaoHoje = conversaoDe(projetado);
    const porCompradoraHoje = porCompradoraDe(projetado);
    const m = dados.metas;
    const alvoConversao = m?.alvo_conversao_pct ? m.alvo_conversao_pct / 100 : conversaoHoje;
    const alvoPorCompradora = m?.alvo_por_compradora_cents ?? porCompradoraHoje;
    const meta = m?.receita_mensal_cents ?? 0;
    const contatosNecessarios = meta > 0 ? contatosParaAMeta(meta, alvoConversao, alvoPorCompradora) : null;
    const ativos = dados.numeros.filter((n) => (n.status ?? "").toUpperCase() === "WORKING").length;
    const planejados = m?.numeros_planejados ?? 0;
    const custoPorContato =
      dados.anuncios.gastoDoMes !== null && dados.funil.mes.contatos > 0 ? dados.anuncios.gastoDoMes / dados.funil.mes.contatos : null;
    const acimaDe200 = dados.faixas.filter((f) => f.faixa.startsWith("R$ 200") || f.faixa.startsWith("R$ 500")).reduce((s, f) => s + f.vendas, 0);
    return {
      projetado,
      conversaoHoje,
      porCompradoraHoje,
      alvoConversao,
      alvoPorCompradora,
      meta,
      contatosNecessarios,
      ativos,
      planejados,
      custoPorContato,
      acimaDe200,
    };
  }, [dados]);


  const abrirEdicao = () => {
    const m = dados?.metas;
    setForm({
      mensal: m ? String(m.receita_mensal_cents / 100) : "",
      trimestral: m?.receita_trimestral_cents ? String(m.receita_trimestral_cents / 100) : "",
      conversao: m?.alvo_conversao_pct ? String(m.alvo_conversao_pct) : "",
      porCompradora: m?.alvo_por_compradora_cents ? String(m.alvo_por_compradora_cents / 100) : "",
      planejados: m?.numeros_planejados !== undefined ? String(m.numeros_planejados) : "",
    });
    setEditando(true);
  };

  const salvar = async () => {
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(/\./g, "").replace(",", ".")));
    const mensal = num(form.mensal);
    if (mensal === undefined || !Number.isFinite(mensal) || mensal < 1) {
      setErro(t("Informe a meta do mês em reais."));
      return;
    }
    const trimestral = num(form.trimestral);
    const conversao = num(form.conversao);
    const porCompradora = num(form.porCompradora);
    const planejados = num(form.planejados);
    const metas = {
      receita_mensal_cents: Math.round(mensal * 100),
      ...(trimestral ? { receita_trimestral_cents: Math.round(trimestral * 100) } : {}),
      ...(conversao ? { alvo_conversao_pct: conversao } : {}),
      ...(porCompradora ? { alvo_por_compradora_cents: Math.round(porCompradora * 100) } : {}),
      ...(planejados !== undefined ? { numeros_planejados: Math.round(planejados) } : {}),
    };
    setSalvando(true);
    const r = await fetch("/api/v1/settings/metas", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ metas }),
    });
    setSalvando(false);
    if (!r.ok) {
      const json = await r.json().catch(() => null);
      setErro(json?.error?.message ?? t("Não foi possível salvar a meta."));
      return;
    }
    setEditando(false);
    setSimMexido(null);
    await carregar();
  };

  if (erro && !dados) return <div className="p-6 text-sm text-warning">{erro}</div>;
  if (!dados || !conta) return <div className="p-6 text-sm text-text-muted">{t("Carregando…")}</div>;

  // Sem mexer no simulador, ele mostra os alvos gravados (ou os números de hoje).
  const sim = simMexido ?? {
    contatos: conta.contatosNecessarios ?? conta.projetado.contatos,
    conversao: Math.round(conta.alvoConversao * 1000) / 10,
    porCompradora: Math.round(conta.alvoPorCompradora / 100),
  };
  const setSim = setSimMexido;
  const f = dados.funil;
  const fp = conta.projetado;
  const receitaSimulada = sim.contatos * (sim.conversao / 100) * sim.porCompradora * 100;
  const totalDeNumeros = conta.ativos + conta.planejados;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-6" data-testid="escalar">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">{t("Escalar")}</h1>
          <p className="text-sm text-text-muted">{t("Como estamos hoje, a meta e o plano para chegar nela.")}</p>
        </div>
        <button
          onClick={abrirEdicao}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          data-testid="escalar-editar-meta"
        >
          {dados.metas ? t("Editar meta") : t("Definir meta")}
        </button>
      </div>

      {erro ? <div className="text-sm text-warning">{erro}</div> : null}

      {editando ? (
        <div className={`${CARTAO} grid gap-3 md:grid-cols-5`} data-testid="escalar-form-meta">
          {(
            [
              ["mensal", t("Meta do mês (R$)"), "100000"],
              ["trimestral", t("Meta do trimestre (R$, opcional)"), "300000"],
              ["conversao", t("Alvo de conversão (%)"), "10"],
              ["porCompradora", t("Alvo por compradora (R$)"), "165"],
              ["planejados", t("Números novos planejados"), "3"],
            ] as [keyof FormDaMeta, string, string][]
          ).map(([campo, rotulo, exemplo]) => (
            <label key={campo} className="space-y-1 text-xs">
              <span className="text-text">{rotulo}</span>
              <input
                inputMode="decimal"
                value={form[campo]}
                placeholder={exemplo}
                onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text"
                data-testid={`escalar-campo-${campo}`}
              />
            </label>
          ))}
          <div className="flex gap-2 md:col-span-5">
            <button
              onClick={() => void salvar()}
              disabled={salvando}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              data-testid="escalar-salvar-meta"
            >
              {salvando ? t("Salvando…") : t("Salvar meta")}
            </button>
            <button onClick={() => setEditando(false)} className="rounded-lg px-4 py-2 text-sm text-text-muted">
              {t("Cancelar")}
            </button>
          </div>
        </div>
      ) : null}

      {/* O termômetro: dia, semana, mês e trimestre */}
      {dados.plano ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <CartaoDoRecorte titulo={t("Hoje")} r={dados.plano.dia} testid="escalar-dia" />
            <CartaoDoRecorte titulo={t("Semana")} r={dados.plano.semana} testid="escalar-semana" />
            <CartaoDoRecorte titulo={t("Mês")} r={dados.plano.mes} testid="escalar-mes" />
            <CartaoDoRecorte titulo={t("Trimestre")} r={dados.plano.trimestre} testid="escalar-trimestre" />
          </div>
          <div className={`${CARTAO} text-sm text-text`} data-testid="escalar-falta-por-dia">
            {t("Para fechar o mês")}: <strong className="tabular-nums">{reais(dados.plano.faltaPorDia)}</strong> {t("por dia nos")}{" "}
            <strong className="tabular-nums">{dados.plano.diasQueFaltam}</strong> {t("dias que faltam")}.
          </div>
        </>
      ) : (
        <div className={`${CARTAO} text-sm text-text-muted`}>{t("Defina a meta do mês para ver o ritmo de hoje, da semana, do mês e do trimestre.")}</div>
      )}

      {/* Receita por dia contra a meta do dia */}
      <div className={`${CARTAO} space-y-2`} data-testid="escalar-grafico">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">{t("Receita por dia")}</span>
          <span className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm bg-accent" aria-hidden /> {t("Receita")}
            </span>
            {dados.metas ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3 bg-text-muted" aria-hidden /> {t("Meta do dia")}
              </span>
            ) : null}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={dados.porDia.map((d) => ({ ...d, receita: d.receita / 100, meta: d.meta === null ? null : d.meta / 100 }))} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.5} />
            <XAxis dataKey="dia" tickFormatter={(v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tickFormatter={(v: number) => moeda.format(v)} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} tickLine={false} axisLine={false} width={72} />
            <Tooltip
              formatter={(v, nome) => [moeda.format(Number(v)), nome === "meta" ? t("Meta do dia") : t("Receita")]}
              labelFormatter={(l) => `${String(l).slice(8, 10)}/${String(l).slice(5, 7)}`}
              contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--color-border)", background: "var(--color-surface)" }}
            />
            <Bar dataKey="receita" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
            {dados.metas ? <Line dataKey="meta" stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray="4 3" dot={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Como estamos hoje */}
      <div className={`${CARTAO} space-y-3`} data-testid="escalar-hoje">
        <div className="text-sm font-semibold text-text">{t("Como estamos hoje")}</div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Numero rotulo={t("Receita do mês")} valor={reais(f.mes.receita)} detalhe={`${t("mês passado")}: ${reais(f.mesPassado.receita)}`} />
          <Numero rotulo={t("Contatos novos")} valor={inteiro(f.mes.contatos)} detalhe={`${t("mês passado")}: ${inteiro(f.mesPassado.contatos)}`} />
          <Numero rotulo={t("Compradoras")} valor={inteiro(f.mes.compradoras)} detalhe={`${t("mês passado")}: ${inteiro(f.mesPassado.compradoras)}`} />
          <Numero rotulo={t("Conversão")} valor={pct(conversaoDe(f.mes))} detalhe={`${t("mês passado")}: ${pct(conversaoDe(f.mesPassado))}`} />
          <Numero rotulo={t("Por compradora")} valor={reais(porCompradoraDe(f.mes))} detalhe={`${t("mês passado")}: ${reais(porCompradoraDe(f.mesPassado))}`} />
          <Numero rotulo={t("Projeção do mês")} valor={reais(fp.receita)} detalhe={`${inteiro(fp.contatos)} ${t("contatos")}`} />
        </div>
        <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <Numero
            rotulo={t("Gasto com anúncio no mês")}
            valor={dados.anuncios.gastoDoMes !== null ? reais(dados.anuncios.gastoDoMes) : "—"}
            detalhe={dados.anuncios.gastoDoMes === null ? t("Conta de anúncios sem leitura") : undefined}
          />
          <Numero rotulo={t("Custo por contato")} valor={conta.custoPorContato !== null ? reais(conta.custoPorContato) : "—"} />
          <Numero
            rotulo={t("Receita por real anunciado")}
            valor={dados.anuncios.gastoDoMes ? `${(f.mes.receita / dados.anuncios.gastoDoMes).toFixed(1).replace(".", ",")}×` : "—"}
          />
          <Numero
            rotulo={t("Recompraram (30 dias)")}
            valor={inteiro(dados.recompra.recompraram)}
            detalhe={`${t("de")} ${inteiro(dados.recompra.compradoras)} ${t("compradoras")}`}
          />
          <Numero rotulo={t("Maior gasto de uma cliente")} valor={reais(dados.recompra.maiorGasto)} detalhe={t("últimos 30 dias")} />
          <Numero rotulo={t("Assinaturas ativas")} valor={inteiro(dados.assinaturasAtivas)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Simulador da conta */}
        {(
          <div className={`${CARTAO} space-y-4`} data-testid="escalar-simulador">
            <div>
              <div className="text-sm font-semibold text-text">{t("A conta da meta")}</div>
              <div className="text-xs text-text-muted">{t("Receita = contatos novos × % que compra × gasto por compradora. Mexa para simular; nada é gravado.")}</div>
            </div>
            <Deslizante rotulo={t("Contatos novos por mês")} valor={sim.contatos} min={500} max={30000} passo={100} mostrar={inteiro} aoMudar={(v) => setSim({ ...sim, contatos: v })} testid="escalar-sim-contatos" />
            <Deslizante rotulo={t("% que compra")} valor={sim.conversao} min={1} max={30} passo={0.5} mostrar={(v) => `${v.toFixed(1).replace(".", ",")}%`} aoMudar={(v) => setSim({ ...sim, conversao: v })} testid="escalar-sim-conversao" />
            <Deslizante rotulo={t("Gasto por compradora")} valor={sim.porCompradora} min={20} max={600} passo={5} mostrar={(v) => moeda.format(v)} aoMudar={(v) => setSim({ ...sim, porCompradora: v })} testid="escalar-sim-ticket" />
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-text">{t("Receita no mês")}</span>
              <span className="text-xl font-bold tabular-nums text-text" data-testid="escalar-sim-receita">
                {reais(receitaSimulada)}
              </span>
            </div>
            {conta.meta > 0 ? (
              <div className="text-xs text-text-muted tabular-nums">
                {pct(receitaSimulada / conta.meta, 0)} {t("da meta")} · {inteiro(sim.contatos / dados.diasDoMes)} {t("contatos por dia")}
                {totalDeNumeros > 0 ? ` · ${inteiro(sim.contatos / dados.diasDoMes / totalDeNumeros)} ${t("por número por dia")}` : ""}
              </div>
            ) : null}
          </div>
        )}

        {/* Faixas de valor */}
        <div className={`${CARTAO} space-y-3`} data-testid="escalar-faixas">
          <div>
            <div className="text-sm font-semibold text-text">{t("Vendas por faixa de valor")}</div>
            <div className="text-xs text-text-muted">{t("últimos 30 dias")}</div>
          </div>
          {(() => {
            const maior = Math.max(1, ...dados.faixas.map((x) => x.receita));
            return dados.faixas.map((x) => (
              <div key={x.faixa} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-text">{x.faixa}</span>
                  <span className="text-text-muted tabular-nums">
                    {x.vendas} {t("vendas")} · {reais(x.receita)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-elevated">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${x.receita > 0 ? Math.max(2, Math.round((x.receita / maior) * 100)) : 0}%` }} />
                </div>
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Números */}
      <div className={`${CARTAO} space-y-3`} data-testid="escalar-numeros">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-text">{t("Números")}</div>
          <div className="text-xs text-text-muted tabular-nums">
            {conta.ativos} {t("conectados")} · {conta.planejados} {t("planejados")}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-text-muted">
                <th className="py-1 pr-3 font-medium">{t("Número")}</th>
                <th className="py-1 pr-3 font-medium">{t("Estado")}</th>
                <th className="py-1 pr-3 text-right font-medium">{t("Contatos (30 dias)")}</th>
                <th className="py-1 pr-3 text-right font-medium">{t("Por dia")}</th>
                <th className="py-1 text-right font-medium">{t("Receita (30 dias)")}</th>
              </tr>
            </thead>
            <tbody>
              {dados.numeros.map((n) => (
                <tr key={n.id} className="border-t border-border text-text">
                  <td className="py-1.5 pr-3">{n.nome ?? n.telefone ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-text-muted">{n.status ?? "—"}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{inteiro(n.contatos30d)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{inteiro(n.contatos30d / 30)}</td>
                  <td className="py-1.5 text-right tabular-nums">{reais(n.receita30d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* O plano */}
      {conta.meta > 0 ? (
        <div className={`${CARTAO} space-y-3`} data-testid="escalar-plano">
          <div>
            <div className="text-sm font-semibold text-text">{t("Plano para chegar na meta")}</div>
            <div className="text-xs text-text-muted">{t("Com os alvos gravados na meta. Hoje → alvo.")}</div>
          </div>
          <ol className="space-y-3 text-sm">
            <li className="space-y-0.5">
              <div className="font-semibold text-text">1. {t("Mais contatos novos")}</div>
              <div className="text-text-muted tabular-nums">
                {inteiro(fp.contatos)} → {conta.contatosNecessarios !== null ? inteiro(conta.contatosNecessarios) : "—"} {t("por mês")} (
                {conta.contatosNecessarios !== null ? inteiro(conta.contatosNecessarios / dados.diasDoMes) : "—"} {t("por dia")})
                {totalDeNumeros > 0 && conta.contatosNecessarios !== null
                  ? ` · ${inteiro(conta.contatosNecessarios / dados.diasDoMes / totalDeNumeros)} ${t("por número por dia com")} ${totalDeNumeros} ${t("números")}`
                  : ""}
              </div>
            </li>
            <li className="space-y-0.5">
              <div className="font-semibold text-text">2. {t("Mais gente comprando")}</div>
              <div className="text-text-muted tabular-nums">
                {pct(conta.conversaoHoje)} → {pct(conta.alvoConversao)} {t("dos contatos novos viram compradoras")}
              </div>
            </li>
            <li className="space-y-0.5">
              <div className="font-semibold text-text">3. {t("Mais valor por compradora")}</div>
              <div className="text-text-muted tabular-nums">
                {reais(conta.porCompradoraHoje)} → {reais(conta.alvoPorCompradora)} · {conta.acimaDe200} {t("vendas de R$ 200 ou mais nos últimos 30 dias")}
              </div>
            </li>
            <li className="space-y-0.5">
              <div className="font-semibold text-text">4. {t("Receita que se repete")}</div>
              <div className="text-text-muted tabular-nums">
                {inteiro(dados.assinaturasAtivas)} {t("assinaturas ativas")} · {inteiro(dados.recompra.recompraram)} {t("clientes recompraram em 30 dias")}
              </div>
            </li>
            <li className="space-y-0.5">
              <div className="font-semibold text-text">5. {t("Verba de anúncio")}</div>
              <div className="text-text-muted tabular-nums">
                {conta.custoPorContato !== null && conta.contatosNecessarios !== null
                  ? `${reais(conta.custoPorContato * conta.contatosNecessarios)} ${t("por mês, se o custo por contato de hoje se mantiver (estimativa)")}`
                  : t("Ligue a conta de anúncios para estimar a verba.")}
              </div>
            </li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
