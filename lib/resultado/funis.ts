/**
 * OS FUNIS DO PAINEL — cada funil com as suas métricas, e "todos" com o geral.
 *
 * Pedido do dono em 27/11/2026: o painel somava o caixa inteiro (a venda do agente de atendimento junto com a de
 * uma página de vendas por outro checkout). Agora cada funil tem leads, passos, vendas, faturamento, gasto e retorno
 * próprios.
 *
 * A lista é DERIVADA, sem cadastro: cada agente vivo (`agente:<id>`), cada quiz (`quiz:<tipo>`) e cada página de
 * vendas (`pagina:<slug>`) com passo recente em `area_quiz_passos`.
 *
 * A VENDA CONTA ONDE FECHOU (decisão do dono), uma venda num funil só — a soma dos funis bate com "todos":
 *   1. produto ligado a um funil na tela (`settings.painel.produtos`) — a escolha explícita vence;
 *   2. cobrança de quiz (`metadata.extra` = `quiz-<tipo>` ou `sinastria-quiz`) — fechou no quiz;
 *   3. contato atendido por agente — o agente da última mensagem até a venda (`fn_painel_agentes_dos_contatos`);
 *      cobre a compra posterior na área do cliente, que conta como do agente;
 *   4. sem contato, produto que está na aba Preço/Catálogo de um agente;
 *   5. nada disso: SEM FUNIL — entra só em "todos", e a tela pede para ligar o produto.
 *
 * O gasto do funil é o das campanhas ligadas a ele (`settings.painel.campanhas`); a tela sugere pelo nome.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { QUIZZES, funilDoQuiz, maiorPerda, passosDoFunil, type LinhaDoFunil, type PassoDoQuiz } from "@/lib/area-do-cliente/passos-do-quiz";
import { catalogoSchema } from "@/lib/catalogo/tipos";
import { lerPricing } from "@/lib/preco/tipos";

export type TipoDeFunil = "agente" | "quiz" | "pagina";

export interface Funil {
  /** `agente:<id>`, `quiz:<tipo>`, `pagina:<slug>`. */
  chave: string;
  tipo: TipoDeFunil;
  /** O id do agente, o tipo do quiz ou o slug da página. */
  id: string;
  nome: string;
}

/** O valor da URL que pede o geral, mesmo havendo funil padrão. */
export const TODOS_OS_FUNIS = "todos";

const chaveDoFunil = z.string().regex(/^(agente|quiz|pagina):[\w-]{1,80}$/);

/** O que a organização grava em `settings.painel`. */
export const painelSchema = z.object({
  funil_padrao: chaveDoFunil.nullable().optional(),
  /** Nome comparável do produto → funil. */
  produtos: z.record(z.string().max(200), chaveDoFunil).optional(),
  /** Id da campanha → funil. */
  campanhas: z.record(z.string().max(40), chaveDoFunil).optional(),
});
export type Painel = z.infer<typeof painelSchema>;

/** Lê `settings.painel`, tolerante: o que não passa no schema vira vazio. Pura. */
export function lerPainel(settings: unknown): Required<Painel> {
  const bruto = settings !== null && typeof settings === "object" ? (settings as Record<string, unknown>).painel : null;
  const r = painelSchema.safeParse(bruto ?? {});
  const p = r.success ? r.data : {};
  return { funil_padrao: p.funil_padrao ?? null, produtos: p.produtos ?? {}, campanhas: p.campanhas ?? {} };
}

/** Nome comparável: sem quantidade na frente, sem acento, minúsculo. Pura. */
export function nomeComparavel(nome: string): string {
  return nome
    .replace(/^\s*\d+\s*[×x]\s*/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Os nomes de produto que o agente cobra (aba Preço e Catálogo), já comparáveis. Pura. */
export function nomesDosProdutosDoAgente(config: unknown): Set<string> {
  const nomes = new Set<string>();
  const add = (n: unknown) => {
    if (typeof n === "string" && n.trim() !== "") nomes.add(nomeComparavel(n));
  };
  const pricing = lerPricing(config);
  if (pricing) {
    for (const l of pricing.list_product_links ?? []) add(l.name);
    for (const d of pricing.steps) for (const l of d.product_links ?? []) add(l.name);
    for (const e of pricing.extras ?? []) add(e.name);
    for (const l of pricing.post_sale?.product_links ?? []) add(l.name);
    for (const o of pricing.post_sale?.next_offers ?? []) for (const l of o.product_links) add(l.name);
  }
  const bruto = config !== null && typeof config === "object" ? (config as Record<string, unknown>).catalog : undefined;
  const catalogo = catalogoSchema.safeParse(bruto);
  if (catalogo.success) for (const p of catalogo.data.produtos) add(p.nome);
  return nomes;
}

/**
 * O quiz de uma cobrança avulsa: `quiz-<tipo>` (`EXTRA_DO_QUIZ`, `lib/area-do-cliente/quizzes.ts`) ou
 * `sinastria-quiz` (`EXTRA_DA_SINASTRIA`). Pura.
 */
export function quizDoExtra(extra: string | null | undefined): string | null {
  if (!extra) return null;
  if (extra === "sinastria-quiz") return "sinastria";
  const m = /^quiz-([a-z]+)$/.exec(extra);
  return m && (QUIZZES as readonly string[]).includes(m[1]!) ? m[1]! : null;
}

const NOMES_DOS_QUIZZES: Record<string, string> = {
  sinastria: "Quiz Sinastria",
  prosperidade: "Quiz Prosperidade",
  caminhos: "Quiz Caminhos",
  par: "Quiz Retrato do Par",
  sombra: "Quiz Sombra",
};

/** A venda do painel, no recorte que a régua lê. */
export interface VendaParaFunil {
  contact_id: string | null;
  /** O nome do produto. */
  notes: string | null;
  created_at: string;
  /** O nome da cobrança avulsa (`metadata.extra`), quando houver. */
  extra_nome?: string | null;
}

export interface ContextoDosFunis {
  produtos: Readonly<Record<string, string>>;
  /** Por contato, cada agente e a última mensagem dele (até o fim do período). */
  agentesDoContato: ReadonlyMap<string, readonly { agentId: string; ultimaEm: string }[]>;
  /** Por agente vivo, os nomes de produto dele. */
  nomesPorAgente: ReadonlyMap<string, ReadonlySet<string>>;
}

/** O funil onde a venda fechou, ou `null` (sem funil). Pura. */
export function funilDaVenda(venda: VendaParaFunil, ctx: ContextoDosFunis): string | null {
  const nome = venda.notes ? nomeComparavel(venda.notes) : null;
  if (nome && ctx.produtos[nome]) return ctx.produtos[nome]!;
  const quiz = quizDoExtra(venda.extra_nome);
  if (quiz) return `quiz:${quiz}`;
  if (venda.contact_id) {
    const agentes = (ctx.agentesDoContato.get(venda.contact_id) ?? []).filter((a) => ctx.nomesPorAgente.has(a.agentId));
    if (agentes.length > 0) {
      // O último agente que falou antes da venda; sem nenhum antes, o mais recente.
      const antes = agentes.filter((a) => a.ultimaEm <= venda.created_at);
      const escolha = (antes.length > 0 ? antes : agentes).reduce((x, y) => (y.ultimaEm > x.ultimaEm ? y : x));
      return `agente:${escolha.agentId}`;
    }
    return null;
  }
  if (nome) for (const [agentId, nomes] of ctx.nomesPorAgente) if (nomes.has(nome)) return `agente:${agentId}`;
  return null;
}

/** O funil do recorte: o da URL, senão o padrão; `todos` ou funil que não existe = geral. Pura. */
export function funilDoPainel(daUrl: string | null, padrao: string | null, funis: readonly Funil[]): Funil | null {
  if (daUrl === TODOS_OS_FUNIS) return null;
  const chave = daUrl ?? padrao;
  return chave ? funis.find((f) => f.chave === chave) ?? null : null;
}

/** Sugere o funil de uma campanha pelo nome (nome do agente, slug da página, tipo do quiz). Pura. */
export function sugerirFunilDaCampanha(nomeDaCampanha: string, funis: readonly Funil[]): string | null {
  const n = nomeComparavel(nomeDaCampanha);
  const candidatos = funis
    .map((f) => {
      const termos =
        f.tipo === "agente"
          ? [nomeComparavel(f.nome).split(/\s+/)[0] ?? ""]
          : f.tipo === "pagina"
            ? [nomeComparavel(f.id).replace(/-/g, " "), nomeComparavel(f.id).split("-")[0] ?? ""]
            : [f.id];
      return { f, ok: termos.some((t) => t.length >= 4 && n.includes(t)) };
    })
    .filter((c) => c.ok);
  return candidatos.length === 1 ? candidatos[0]!.f.chave : null;
}

/** O gasto das campanhas de um funil, em centavos. Pura. */
export function gastoDoFunil(campanhas: readonly { id: string; centavos: number }[], ligacoes: Readonly<Record<string, string>>, chave: string): number {
  return campanhas.filter((c) => ligacoes[c.id] === chave).reduce((s, c) => s + c.centavos, 0);
}

// ─── Leituras ────────────────────────────────────────────────────────────────────────────────

export interface AgenteVivo {
  id: string;
  name: string;
  config: unknown;
}

/** Os funis da organização: agentes vivos, quizzes e páginas com passo nos últimos 90 dias. */
export async function listarFunis(
  db: SupabaseClient,
  organizationId: string,
  /** Funis já ligados a produto ou campanha: aparecem mesmo sem passo recente. */
  jaLigados: readonly string[] = [],
): Promise<{ funis: Funil[]; agentes: AgenteVivo[] }> {
  const desde = new Date(Date.now() - 90 * 864e5).toISOString();
  const [{ data: ag, error: e1 }, ...quizzes] = await Promise.all([
    db.from("ai_agents").select("id, name, config").eq("organization_id", organizationId).is("archived_at", null).order("created_at"),
    ...[...QUIZZES, "pagina" as const].map((q) =>
      db.from("area_quiz_passos").select("pagina").eq("organization_id", organizationId).in("quiz", [q]).gte("created_at", desde).order("created_at", { ascending: false })
        // shortcut: os slugs saem das 1.000 visitas mais recentes; página parada há muito some até ser ligada.
        .limit(q === "pagina" ? 1000 : 1),
    ),
  ]);
  if (e1) throw new Error(`funis: leitura dos agentes falhou: ${e1.message}`);
  const agentes = (ag ?? []) as AgenteVivo[];
  const funis: Funil[] = agentes.map((a) => ({ chave: `agente:${a.id}`, tipo: "agente", id: a.id, nome: a.name }));
  QUIZZES.forEach((q, i) => {
    if ((quizzes[i]?.data ?? []).length > 0) funis.push({ chave: `quiz:${q}`, tipo: "quiz", id: q, nome: NOMES_DOS_QUIZZES[q] ?? q });
  });
  const slugs = new Set(((quizzes[QUIZZES.length]?.data ?? []) as { pagina: string | null }[]).map((p) => p.pagina).filter((s): s is string => !!s));
  for (const c of jaLigados) {
    const [tipo, id] = c.split(":") as [string, string];
    if (tipo === "pagina") slugs.add(id);
    else if (tipo === "quiz" && !funis.some((f) => f.chave === c) && (QUIZZES as readonly string[]).includes(id))
      funis.push({ chave: c, tipo: "quiz", id, nome: NOMES_DOS_QUIZZES[id] ?? id });
  }
  for (const s of [...slugs].sort()) funis.push({ chave: `pagina:${s}`, tipo: "pagina", id: s, nome: `Página ${s}` });
  return { funis, agentes };
}

const LOTE = 200;

/** Por contato, os agentes que enviaram mensagem e a última até `ate` (agrupado no banco, migration 0970). */
export async function agentesDosContatos(
  db: SupabaseClient,
  organizationId: string,
  contactIds: readonly string[],
  ate: Date,
): Promise<Map<string, { agentId: string; ultimaEm: string }[]>> {
  const mapa = new Map<string, { agentId: string; ultimaEm: string }[]>();
  const unicos = [...new Set(contactIds)];
  for (let i = 0; i < unicos.length; i += LOTE) {
    const { data, error } = await db.rpc("fn_painel_agentes_dos_contatos", {
      p_org: organizationId,
      p_contatos: unicos.slice(i, i + LOTE),
      p_ate: ate.toISOString(),
    });
    if (error) throw new Error(`funis: leitura dos agentes dos contatos falhou: ${error.message}`);
    for (const r of (data ?? []) as { contact_id: string; agent_id: string; ultima_em: string }[]) {
      const l = mapa.get(r.contact_id) ?? [];
      l.push({ agentId: r.agent_id, ultimaEm: new Date(r.ultima_em).toISOString() });
      mapa.set(r.contact_id, l);
    }
  }
  return mapa;
}

/** Monta o contexto e separa as vendas por funil (chave → vendas; `null` = sem funil). */
export async function separarVendasPorFunil<V extends VendaParaFunil>(
  db: SupabaseClient,
  organizationId: string,
  agentes: readonly AgenteVivo[],
  produtos: Readonly<Record<string, string>>,
  vendas: readonly V[],
  ate: Date,
): Promise<Map<string | null, V[]>> {
  const contatos = vendas.map((v) => v.contact_id).filter((c): c is string => !!c);
  const ctx: ContextoDosFunis = {
    produtos,
    agentesDoContato: contatos.length > 0 ? await agentesDosContatos(db, organizationId, contatos, ate) : new Map(),
    nomesPorAgente: new Map(agentes.map((a) => [a.id, nomesDosProdutosDoAgente(a.config)])),
  };
  const porFunil = new Map<string | null, V[]>();
  for (const v of vendas) {
    const f = funilDaVenda(v, ctx);
    porFunil.set(f, [...(porFunil.get(f) ?? []), v]);
  }
  return porFunil;
}

/** Os canais ligados ao agente (`ai_agent_numeros`). */
export async function canaisDoAgente(db: SupabaseClient, organizationId: string, agentId: string): Promise<string[]> {
  const { data, error } = await db
    .from("ai_agent_numeros")
    .select("channel_session_id")
    .eq("organization_id", organizationId)
    .eq("agent_id", agentId);
  if (error) throw new Error(`funis: leitura dos canais falhou: ${error.message}`);
  return ((data ?? []) as { channel_session_id: string }[]).map((r) => r.channel_session_id);
}

/** O funil de passos de uma página ou quiz no período, como a aba Quizzes da área mostra. */
export async function lerPassosDoFunil(
  db: SupabaseClient,
  organizationId: string,
  funil: Funil,
  de: Date,
  ate: Date,
): Promise<{ funil: LinhaDoFunil[]; maiorPerda: ReturnType<typeof maiorPerda>; whatsapp: number | null }> {
  const quiz = funil.tipo === "pagina" ? "pagina" : (funil.id as (typeof QUIZZES)[number]);
  const contar = async (passo: PassoDoQuiz): Promise<number> => {
    // `.in` e não `.eq`: "pagina" também é nome de coluna, e a cerca do PostgREST recusa a comparação.
    let q = db
      .from("area_quiz_passos")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("quiz", [quiz])
      .in("passo", [passo])
      .gte("created_at", de.toISOString())
      .lte("created_at", ate.toISOString());
    if (funil.tipo === "pagina") q = q.in("pagina", [funil.id]);
    const { count, error } = await q;
    if (error) throw new Error(`funis: leitura dos passos falhou: ${error.message}`);
    return count ?? 0;
  };
  const passos = passosDoFunil(quiz);
  const contagens = await Promise.all(passos.map(contar));
  const linhas = funilDoQuiz(quiz, Object.fromEntries(passos.map((p, i) => [p, contagens[i]!])));
  return {
    funil: linhas,
    maiorPerda: maiorPerda(linhas),
    whatsapp: funil.tipo === "pagina" ? await contar("whatsapp") : null,
  };
}
