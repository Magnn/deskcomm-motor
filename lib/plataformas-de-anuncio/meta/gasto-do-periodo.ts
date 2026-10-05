/**
 * QUANTO A CONTA DE ANÚNCIOS GASTOU NO PERÍODO — o número que o dashboard mostrava como zero fixo.
 *
 * Usa a MESMA credencial de leitura e a MESMA leitura de insights da tela de anúncios
 * (`insights.ts`): uma verdade só para o gasto. O que muda é a soma e o recorte de datas.
 *
 * ─── Quatro desfechos, e nenhum deles é "R$ 0,00" por omissão ─────────────────────────────────────
 *   - `ok`            — a plataforma respondeu; zero aqui é zero de verdade;
 *   - `sem_conexao`   — ninguém conectou a conta (ou a cifra não abre);
 *   - `sem_conta`     — conectou e não escolheu a conta padrão;
 *   - `indisponivel`  — token vencido, permissão, cota ou rede.
 * A tela precisa distinguir os quatro: "não gastei nada" e "não sei quanto gastei" são frases diferentes,
 * e mostrar a segunda como a primeira é o erro que este arquivo existe para tirar.
 *
 * ─── Moeda ────────────────────────────────────────────────────────────────────────────────────────
 * A conta pode não ser em real. O gasto volta com a moeda da conta; quem calcula ROAS e lucro só o faz
 * quando ela bate com a do faturamento (`BRL`). Somar dólar com real daria um número errado com
 * aparência de certo.
 *
 * ─── Datas ────────────────────────────────────────────────────────────────────────────────────────
 * A plataforma recorta por DIA, no fuso da conta; o dashboard recorta por instante. O intervalo vira
 * `AAAA-MM-DD` do início ao fim: nas bordas do dia o gasto pode incluir horas que o resto do painel não
 * conta. É a mesma granularidade da tela de anúncios.
 *
 * ─── Cota ─────────────────────────────────────────────────────────────────────────────────────────
 * O dashboard é aberto e atualizado muito mais vezes que a tela de anúncios. Cada resposta fica 5 minutos
 * em memória por (organização, conta, período) — sucesso ou falha, para um token vencido não virar uma
 * chamada por clique.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerCredencialDeLeitura } from "../credenciais-de-leitura";
import type { ContaDeAnuncio, ResultadoDeLeitura } from "../types";
import { lerInsights, listarContas, type LinhaDeInsightCrua } from "./insights";

export type GastoDeAnuncios =
  | { estado: "ok"; centavos: number; moeda: string }
  | { estado: "sem_conexao" | "sem_conta" | "indisponivel" };

/** A soma do `spend` das campanhas, em centavos. Linha sem número conta zero. Pura. */
export function somarGastoEmCentavos(linhas: readonly LinhaDeInsightCrua[]): number {
  let centavos = 0;
  for (const l of linhas) {
    const v = Number(l.spend);
    if (Number.isFinite(v) && v > 0) centavos += Math.round(v * 100);
  }
  return centavos;
}

/** `AAAA-MM-DD` (UTC), o formato do `time_range`. */
export function diaDoRecorte(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface DepsDoGasto {
  lerCredencial: typeof lerCredencialDeLeitura;
  lerInsights: (token: string, conta: string, de: string, ate: string) => Promise<ResultadoDeLeitura<LinhaDeInsightCrua[]>>;
  listarContas: (token: string) => Promise<ResultadoDeLeitura<ContaDeAnuncio[]>>;
  agora: () => number;
}

const DEPS_REAIS: DepsDoGasto = { lerCredencial: lerCredencialDeLeitura, lerInsights, listarContas, agora: () => Date.now() };

const VALIDADE_MS = 5 * 60 * 1000;
const cache = new Map<string, { ate: number; valor: GastoDeAnuncios }>();

/** Só para os testes: o cache é do processo. */
export function limparCacheDoGasto(): void {
  cache.clear();
}

export async function lerGastoDeAnuncios(
  admin: SupabaseClient,
  organizationId: string,
  de: Date,
  ate: Date,
  deps: DepsDoGasto = DEPS_REAIS,
): Promise<GastoDeAnuncios> {
  const credencial = await deps.lerCredencial(admin, organizationId, "meta_ads");
  if (!credencial.ok) return { estado: "sem_conexao" };
  const conta = credencial.credencial.contaPadrao;
  if (!conta) return { estado: "sem_conta" };

  const inicio = diaDoRecorte(de);
  const fim = diaDoRecorte(ate);
  const chave = `${organizationId}|${conta}|${inicio}|${fim}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.ate > deps.agora()) return guardado.valor;

  const token = credencial.credencial.accessToken;
  const [insights, contas] = await Promise.all([deps.lerInsights(token, conta, inicio, fim), deps.listarContas(token)]);
  let valor: GastoDeAnuncios;
  if (!insights.ok) {
    valor = { estado: "indisponivel" };
  } else {
    // Sem a lista de contas a moeda é desconhecida, e gasto sem moeda não entra em conta nenhuma: a moeda
    // "?" faz ROAS e lucro ficarem de fora, mas o valor gasto continua visível.
    const moeda = contas.ok ? (contas.dados.find((c) => c.id === conta)?.moeda ?? "?") : "?";
    valor = { estado: "ok", centavos: somarGastoEmCentavos(insights.dados), moeda };
  }
  cache.set(chave, { ate: deps.agora() + VALIDADE_MS, valor });
  return valor;
}
