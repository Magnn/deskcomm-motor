/**
 * O RELATÓRIO DO DIA da meta de receita: o texto do aviso que abre na Central toda manhã
 * (`app/api/v1/cron/relatorio-da-meta`). Ontem contra a meta de ontem, o ritmo do mês, da semana e
 * do trimestre, o que falta por dia e o funil do mês. Puro.
 */
import type { PainelDeEscala } from "./painel-de-escala";
import { conversaoDe, porCompradoraDe, metaDoDia, somarDias, type Ritmo } from "./meta-de-receita";

export const TITULO_DO_RELATORIO = "Meta do dia";

const NOME_DO_RITMO: Record<Ritmo, string> = { adiantada: "adiantada", no_ritmo: "no ritmo", atrasada: "atrasada" };
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export function textoDoRelatorioDoDia(
  painel: PainelDeEscala,
  reais: (centavos: number) => string,
): { titulo: string; corpo: string; severidade: "info" | "warn" } | null {
  const { plano, metas } = painel;
  if (!plano || !metas) return null;
  const ontem = somarDias(painel.hoje, -1);
  const feitoOntem = painel.porDia.find((d) => d.dia === ontem)?.receita ?? 0;
  const metaOntem = Math.round(metaDoDia(ontem, metas.receita_mensal_cents, painel.pesos));
  const f = painel.funil.mes;
  const linhas = [
    `Ontem: ${reais(feitoOntem)} de ${reais(metaOntem)} (${pct(feitoOntem, metaOntem)}).`,
    `Mês: ${reais(plano.mes.feito)} de ${reais(plano.mes.meta)} — ${NOME_DO_RITMO[plano.mes.ritmo]} (${pct(plano.mes.feito, plano.mes.previsto)} do previsto até agora). Se continuar assim, fecha em ${reais(plano.mes.projecao)}.`,
    `Para fechar o mês: ${reais(plano.faltaPorDia)} por dia nos ${plano.diasQueFaltam} dias que faltam.`,
    `Semana: ${reais(plano.semana.feito)} de ${reais(plano.semana.meta)} — ${NOME_DO_RITMO[plano.semana.ritmo]}.`,
    `Trimestre: ${reais(plano.trimestre.feito)} de ${reais(plano.trimestre.meta)} — ${NOME_DO_RITMO[plano.trimestre.ritmo]}.`,
    `Funil do mês: ${f.contatos} contatos novos, ${f.compradoras} compradoras (${(conversaoDe(f) * 100).toFixed(1)}%), ${reais(Math.round(porCompradoraDe(f)))} por compradora.`,
    painel.alavanca === "receita"
      ? "Ofertas automáticas: com o mês atrasado, quem ainda não ouviu uma oferta recebe primeiro a que mais rende por envio. O cuidado com cada pessoa e o espaço entre ofertas não mudam."
      : "Ofertas automáticas: no ritmo, as ofertas se espalham pelo catálogo para cada produto chegar à sua meta.",
    "O painel completo está em Escalar.",
  ];
  const [d, m] = [painel.hoje.slice(8, 10), painel.hoje.slice(5, 7)];
  return { titulo: `${TITULO_DO_RELATORIO} — ${d}/${m}`, corpo: linhas.join("\n"), severidade: plano.mes.ritmo === "atrasada" ? "warn" : "info" };
}
