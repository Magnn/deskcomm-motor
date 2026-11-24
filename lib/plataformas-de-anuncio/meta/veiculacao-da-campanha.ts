/**
 * PAUSAR E REATIVAR UMA CAMPANHA — a única escrita que esta instalação faz na
 * conta de anúncios do cliente.
 *
 * A tela de Meta Ads etiqueta cada campanha rodando (Escalar / Segurar / Cortar).
 * Quem lê "Cortar" precisava abrir o Gerenciador para agir; agora pausa ali
 * mesmo, e reativa do mesmo jeito. É o uso de `ads_management`: nada é criado,
 * editado ou gasto além do que a própria pessoa já tinha configurado.
 *
 * ─── A ordem, e por que ela importa ─────────────────────────────────────────
 *   1. o token PRECISA ter `ads_management` — o de leitura (`ads_read`) não
 *      escreve, e a Meta responderia (#200) depois de a tela prometer a ação;
 *   2. a campanha PRECISA ser de uma conta que a organização conectou: o id
 *      vem do navegador, e um token que alcança várias contas (o de quem
 *      administra várias empresas) não pode virar porta para pausar a campanha
 *      de outra empresa;
 *   3. só então muda o status.
 * As pontas entram por `DepsDaVeiculacao`: é a ordem que erra calada, e assim
 * ela se testa sem rede.
 *
 * Token e segredo vão no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12).
 */
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 15_000;

export type NovaVeiculacao = "ACTIVE" | "PAUSED";

export type DesfechoDaVeiculacao =
  | { ok: true; campanhaId: string; status: NovaVeiculacao; contaId: string }
  | { ok: false; motivo: "sem_permissao_de_gerenciar" | "campanha_de_outra_conta" | "campanha_nao_encontrada" | "recusado"; detalhe?: string };

export class VeiculacaoError extends Error {
  constructor(
    public readonly onde: string,
    public readonly detalhe: string,
    /** `error.code` da Graph: 10/200 = permissão; 100 = objeto que não existe para este token. */
    public readonly codigo: number | null,
  ) {
    super(`veiculacao_${onde}: ${detalhe}`);
  }
}

type Buscar = typeof fetch;

async function chamar<T>(buscar: Buscar, onde: string, caminho: string, parametros: Record<string, string>): Promise<T> {
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${caminho}`, {
      method: "POST",
      body: new URLSearchParams(parametros),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    throw new VeiculacaoError(onde, err instanceof Error ? err.message : String(err), null);
  }
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  if (!res.ok) {
    const erro = (corpo as { error?: { message?: string; code?: number } } | null)?.error;
    throw new VeiculacaoError(onde, erro?.message ?? texto.slice(0, 200), typeof erro?.code === "number" ? erro.code : null);
  }
  return corpo as T;
}

/** A conta (sem `act_`) e o status atual da campanha, como o token a enxerga. */
export async function lerCampanha(
  token: string,
  campanhaId: string,
  buscar: Buscar = fetch,
): Promise<CampanhaLida> {
  const r = await chamar<{ account_id?: string; status?: string; daily_budget?: string }>(buscar, "leitura", encodeURIComponent(campanhaId), {
    method: "GET",
    fields: "account_id,status,daily_budget",
    access_token: token,
  });
  if (!r.account_id) throw new VeiculacaoError("leitura", "a campanha veio sem conta", 100);
  const orcamento = Number(r.daily_budget);
  return {
    contaId: String(r.account_id).replace(/^act_/, ""),
    status: r.status ?? null,
    orcamentoDiarioCents: Number.isFinite(orcamento) && orcamento > 0 ? orcamento : null,
  };
}

/** A campanha como o token a enxerga. `orcamentoDiarioCents` só existe quando o orçamento é DA CAMPANHA. */
export interface CampanhaLida {
  contaId: string;
  status: string | null;
  orcamentoDiarioCents?: number | null;
}

/** Muda o orçamento diário da campanha (centavos, a unidade da Graph para BRL). */
export async function gravarOrcamentoDaCampanha(
  token: string,
  campanhaId: string,
  orcamentoDiarioCents: number,
  buscar: Buscar = fetch,
): Promise<void> {
  const r = await chamar<{ success?: boolean }>(buscar, "escrita", encodeURIComponent(campanhaId), {
    daily_budget: String(Math.round(orcamentoDiarioCents)),
    access_token: token,
  });
  if (r.success !== true) throw new VeiculacaoError("escrita", "a Meta não confirmou a mudança", null);
}

/** Muda o status da campanha. A Meta devolve `{ success: true }`. */
export async function gravarStatusDaCampanha(
  token: string,
  campanhaId: string,
  status: NovaVeiculacao,
  buscar: Buscar = fetch,
): Promise<void> {
  const r = await chamar<{ success?: boolean }>(buscar, "escrita", encodeURIComponent(campanhaId), { status, access_token: token });
  if (r.success !== true) throw new VeiculacaoError("escrita", "a Meta não confirmou a mudança", null);
}

export interface DepsDaVeiculacao {
  /** As permissões do token e as contas concedidas a ele (sem `act_`). */
  inspecionar(): Promise<{ escopos: string[]; contasConcedidas: string[] }>;
  /** As contas que o token alcança, para quando a Meta não listou concedidas (token de pessoa antigo). */
  contasAlcancadas(): Promise<string[]>;
  lerCampanha(campanhaId: string): Promise<CampanhaLida>;
  gravarStatus(campanhaId: string, status: NovaVeiculacao): Promise<void>;
}

/** 10 e a faixa 200–299 são as recusas por permissão da Graph. */
const PERMISSAO = (codigo: number | null) => codigo === 10 || (codigo !== null && codigo >= 200 && codigo < 300);

type Recusa = Extract<DesfechoDaVeiculacao, { ok: false }>;

/** Permissão de gerenciar → campanha de conta conectada. Devolve a campanha lida, ou a recusa. */
async function autorizar(
  deps: Omit<DepsDaVeiculacao, "gravarStatus">,
  campanhaId: string,
): Promise<{ ok: true; campanha: CampanhaLida } | Recusa> {
  const inspecao = await deps.inspecionar();
  if (!inspecao.escopos.includes("ads_management")) return { ok: false, motivo: "sem_permissao_de_gerenciar" };

  let campanha: CampanhaLida;
  try {
    campanha = await deps.lerCampanha(campanhaId);
  } catch (err) {
    if (err instanceof VeiculacaoError && err.codigo === 100) return { ok: false, motivo: "campanha_nao_encontrada" };
    if (err instanceof VeiculacaoError && PERMISSAO(err.codigo)) return { ok: false, motivo: "campanha_de_outra_conta" };
    throw err;
  }

  const permitidas = inspecao.contasConcedidas.length > 0 ? inspecao.contasConcedidas : await deps.contasAlcancadas();
  if (!permitidas.map((c) => c.replace(/^act_/, "")).includes(campanha.contaId)) {
    return { ok: false, motivo: "campanha_de_outra_conta" };
  }
  return { ok: true, campanha };
}

/** A escrita em si, com as recusas da Graph traduzidas. */
async function gravar(escrever: () => Promise<void>): Promise<Recusa | null> {
  try {
    await escrever();
    return null;
  } catch (err) {
    if (err instanceof VeiculacaoError && PERMISSAO(err.codigo)) return { ok: false, motivo: "sem_permissao_de_gerenciar", detalhe: err.detalhe };
    if (err instanceof VeiculacaoError) return { ok: false, motivo: "recusado", detalhe: err.detalhe };
    throw err;
  }
}

export async function mudarVeiculacaoDaCampanha(
  deps: DepsDaVeiculacao,
  input: { campanhaId: string; status: NovaVeiculacao },
): Promise<DesfechoDaVeiculacao> {
  const autorizada = await autorizar(deps, input.campanhaId);
  if (!autorizada.ok) return autorizada;
  const recusa = await gravar(() => deps.gravarStatus(input.campanhaId, input.status));
  if (recusa) return recusa;
  return { ok: true, campanhaId: input.campanhaId, status: input.status, contaId: autorizada.campanha.contaId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento diário — o "Subir 20%" e o desfazer do painel de tráfego
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Teto de cada subida: 20% sobre o orçamento ATUAL. Subir mais que isso de uma vez joga a campanha
 * de volta ao aprendizado da Meta; descer não tem teto (é o desfazer, e cortar gasto nunca é o risco).
 */
export const SUBIDA_MAXIMA = 0.2;
/** Piso de orçamento diário aceito daqui. A Meta tem o dela por moeda; este só barra o engano grosseiro. */
export const ORCAMENTO_MINIMO_CENTS = 600;

export type DesfechoDoOrcamento =
  | { ok: true; campanhaId: string; contaId: string; antesCents: number; depoisCents: number }
  | Recusa
  | { ok: false; motivo: "orcamento_no_conjunto" | "orcamento_mudou" | "subida_acima_do_teto" | "orcamento_abaixo_do_minimo"; detalhe?: string };

export interface DepsDoOrcamento extends Omit<DepsDaVeiculacao, "gravarStatus"> {
  gravarOrcamento(campanhaId: string, orcamentoDiarioCents: number): Promise<void>;
}

/**
 * Troca o orçamento diário da campanha. `antesCents` é o valor que a TELA mostrava: se a campanha já
 * está com outro (alguém mudou no Gerenciador, ou o clique foi duplo), recusa em vez de subir em cima
 * de um valor que a pessoa não viu.
 */
export async function mudarOrcamentoDaCampanha(
  deps: DepsDoOrcamento,
  input: { campanhaId: string; antesCents: number; depoisCents: number },
): Promise<DesfechoDoOrcamento> {
  if (input.depoisCents < ORCAMENTO_MINIMO_CENTS) return { ok: false, motivo: "orcamento_abaixo_do_minimo" };
  const autorizada = await autorizar(deps, input.campanhaId);
  if (!autorizada.ok) return autorizada;

  const atual = autorizada.campanha.orcamentoDiarioCents ?? null;
  if (atual === null) return { ok: false, motivo: "orcamento_no_conjunto" };
  if (atual !== input.antesCents) return { ok: false, motivo: "orcamento_mudou", detalhe: String(atual) };
  if (input.depoisCents > Math.round(atual * (1 + SUBIDA_MAXIMA))) return { ok: false, motivo: "subida_acima_do_teto" };

  const recusa = await gravar(() => deps.gravarOrcamento(input.campanhaId, input.depoisCents));
  if (recusa) return recusa;
  return { ok: true, campanhaId: input.campanhaId, contaId: autorizada.campanha.contaId, antesCents: atual, depoisCents: input.depoisCents };
}
