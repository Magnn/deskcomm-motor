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
): Promise<{ contaId: string; status: string | null }> {
  const r = await chamar<{ account_id?: string; status?: string }>(buscar, "leitura", encodeURIComponent(campanhaId), {
    method: "GET",
    fields: "account_id,status",
    access_token: token,
  });
  if (!r.account_id) throw new VeiculacaoError("leitura", "a campanha veio sem conta", 100);
  return { contaId: String(r.account_id).replace(/^act_/, ""), status: r.status ?? null };
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
  lerCampanha(campanhaId: string): Promise<{ contaId: string; status: string | null }>;
  gravarStatus(campanhaId: string, status: NovaVeiculacao): Promise<void>;
}

/** 10 e a faixa 200–299 são as recusas por permissão da Graph. */
const PERMISSAO = (codigo: number | null) => codigo === 10 || (codigo !== null && codigo >= 200 && codigo < 300);

export async function mudarVeiculacaoDaCampanha(
  deps: DepsDaVeiculacao,
  input: { campanhaId: string; status: NovaVeiculacao },
): Promise<DesfechoDaVeiculacao> {
  const inspecao = await deps.inspecionar();
  if (!inspecao.escopos.includes("ads_management")) return { ok: false, motivo: "sem_permissao_de_gerenciar" };

  let campanha: { contaId: string; status: string | null };
  try {
    campanha = await deps.lerCampanha(input.campanhaId);
  } catch (err) {
    if (err instanceof VeiculacaoError && err.codigo === 100) return { ok: false, motivo: "campanha_nao_encontrada" };
    if (err instanceof VeiculacaoError && PERMISSAO(err.codigo)) return { ok: false, motivo: "campanha_de_outra_conta" };
    throw err;
  }

  const permitidas = inspecao.contasConcedidas.length > 0 ? inspecao.contasConcedidas : await deps.contasAlcancadas();
  if (!permitidas.map((c) => c.replace(/^act_/, "")).includes(campanha.contaId)) {
    return { ok: false, motivo: "campanha_de_outra_conta" };
  }

  try {
    await deps.gravarStatus(input.campanhaId, input.status);
  } catch (err) {
    if (err instanceof VeiculacaoError && PERMISSAO(err.codigo)) return { ok: false, motivo: "sem_permissao_de_gerenciar", detalhe: err.detalhe };
    if (err instanceof VeiculacaoError) return { ok: false, motivo: "recusado", detalhe: err.detalhe };
    throw err;
  }
  return { ok: true, campanhaId: input.campanhaId, status: input.status, contaId: campanha.contaId };
}
