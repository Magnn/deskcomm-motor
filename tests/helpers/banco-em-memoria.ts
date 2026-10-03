/**
 * Um banco em memória com a MESMA forma de encadeamento do cliente do Supabase,
 * só com o que os módulos testados usam: select/insert/update/delete/upsert,
 * filtros eq/neq/is/in/lte/lt/like, order, limit, single/maybeSingle e contagem `head`.
 *
 * Existe para testar ORQUESTRAÇÃO (o que é gravado, em que ordem, sob qual
 * condição) sem Postgres. Não imita RLS, tipos de coluna nem transação — quem
 * precisa disso é `tests/invariants/`.
 *
 * `unicos` declara os índices únicos por tabela: um INSERT que os viola devolve
 * `23505`, como o Postgres — é o que as reservas por unicidade testam.
 */
type Linha = Record<string, unknown>;
type Filtro = (l: Linha) => boolean;
type Erro = { message: string; code?: string };

export interface BancoEmMemoria {
  tabelas: Record<string, Linha[]>;
  cliente: { from(tabela: string): Consulta; storage: unknown };
  /** Faz a PRÓXIMA operação desta tabela falhar com a mensagem dada. */
  falharProxima(tabela: string, mensagem: string): void;
}

interface Consulta extends PromiseLike<{ data: unknown; error: Erro | null; count?: number | null }> {
  select(colunas?: string, opts?: { count?: string; head?: boolean }): Consulta;
  insert(valor: Linha | Linha[]): Consulta;
  update(patch: Linha): Consulta;
  delete(): Consulta;
  upsert(valor: Linha | Linha[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  neq(coluna: string, valor: unknown): Consulta;
  is(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  /** Só as formas que o PostgREST aceita aqui: `is` null e `in` com lista `(a,b)`. */
  not(coluna: string, operador: "is" | "in", valor: unknown): Consulta;
  lte(coluna: string, valor: string): Consulta;
  gte(coluna: string, valor: string): Consulta;
  lt(coluna: string, valor: string): Consulta;
  like(coluna: string, padrao: string): Consulta;
  order(coluna: string, opts?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  single(): Promise<{ data: unknown; error: Erro | null }>;
  maybeSingle(): Promise<{ data: unknown; error: Erro | null }>;
}

let sequencia = 0;
const novoId = () => `00000000-0000-4000-8000-${String(++sequencia).padStart(12, "0")}`;

export function criarBancoEmMemoria(
  // `object`, e não `Linha`: quem monta o cenário passa os tipos do próprio módulo,
  // que não têm assinatura de índice.
  inicial: Record<string, readonly object[]> = {},
  unicos: Record<string, string[][]> = {},
): BancoEmMemoria {
  const tabelas: Record<string, Linha[]> = {};
  for (const [nome, linhas] of Object.entries(inicial)) tabelas[nome] = linhas.map((l) => ({ ...(l as Linha) }));
  const falhas = new Map<string, string>();

  const viola = (tabela: string, nova: Linha, ignorar?: Linha): boolean =>
    (unicos[tabela] ?? []).some((colunas) =>
      // Coluna ausente na linha = NULL, como o default do Postgres faz no insert.
      (tabelas[tabela] ?? []).some((l) => l !== ignorar && colunas.every((c) => (l[c] ?? null) === (nova[c] ?? null))),
    );

  function from(tabela: string): Consulta {
    tabelas[tabela] ??= [];
    const filtros: Filtro[] = [];
    let operacao: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let carga: Linha[] = [];
    let patch: Linha = {};
    let opcoesDoUpsert: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let ordem: { coluna: string; asc: boolean } | null = null;
    let limite: number | null = null;
    let contar = false;
    let soCabeca = false;

    const executar = (): { data: Linha[]; error: Erro | null; count: number | null } => {
      const falha = falhas.get(tabela);
      if (falha !== undefined) {
        falhas.delete(tabela);
        return { data: [], error: { message: falha }, count: null };
      }
      const agora = new Date().toISOString();
      const casa = (l: Linha) => filtros.every((f) => f(l));
      let saida: Linha[] = [];

      if (operacao === "insert") {
        for (const item of carga) {
          const nova = { id: novoId(), created_at: agora, updated_at: agora, ...item };
          if (viola(tabela, nova)) return { data: [], error: { message: "duplicate key value", code: "23505" }, count: null };
          tabelas[tabela]!.push(nova);
          saida.push(nova);
        }
      } else if (operacao === "upsert") {
        const chaves = (opcoesDoUpsert.onConflict ?? "id").split(",").map((c) => c.trim());
        for (const item of carga) {
          const existente = tabelas[tabela]!.find((l) => chaves.every((c) => l[c] === item[c]));
          if (existente) {
            if (!opcoesDoUpsert.ignoreDuplicates) Object.assign(existente, item, { updated_at: agora });
            saida.push(existente);
          } else {
            const nova = { id: novoId(), created_at: agora, updated_at: agora, ...item };
            tabelas[tabela]!.push(nova);
            saida.push(nova);
          }
        }
      } else if (operacao === "update") {
        for (const l of tabelas[tabela]!.filter(casa)) {
          Object.assign(l, patch, { updated_at: agora });
          saida.push(l);
        }
      } else if (operacao === "delete") {
        saida = tabelas[tabela]!.filter(casa);
        tabelas[tabela] = tabelas[tabela]!.filter((l) => !casa(l));
      } else {
        saida = tabelas[tabela]!.filter(casa);
      }

      if (ordem) {
        const { coluna, asc } = ordem;
        saida = [...saida].sort((a, b) => {
          const x = a[coluna] as string | number;
          const y = b[coluna] as string | number;
          return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      const total = saida.length;
      if (limite !== null) saida = saida.slice(0, limite);
      return { data: soCabeca ? [] : saida.map((l) => ({ ...l })), error: null, count: contar ? total : null };
    };

    const q: Consulta = {
      select(_colunas, opts) {
        if (opts?.count) contar = true;
        if (opts?.head) soCabeca = true;
        return q;
      },
      insert(valor) {
        operacao = "insert";
        carga = Array.isArray(valor) ? valor : [valor];
        return q;
      },
      update(p) {
        operacao = "update";
        patch = p;
        return q;
      },
      delete() {
        operacao = "delete";
        return q;
      },
      upsert(valor, opts) {
        operacao = "upsert";
        carga = Array.isArray(valor) ? valor : [valor];
        opcoesDoUpsert = opts ?? {};
        return q;
      },
      eq(coluna, valor) {
        filtros.push((l) => l[coluna] === valor);
        return q;
      },
      neq(coluna, valor) {
        filtros.push((l) => l[coluna] !== valor);
        return q;
      },
      is(coluna, valor) {
        filtros.push((l) => (l[coluna] ?? null) === valor);
        return q;
      },
      in(coluna, valores) {
        filtros.push((l) => valores.includes(l[coluna]));
        return q;
      },
      not(coluna, operador, valor) {
        if (operador === "is") {
          filtros.push((l) => (l[coluna] ?? null) !== valor);
        } else {
          const lista = String(valor).replace(/^\(|\)$/g, "").split(",").map((v) => v.trim());
          filtros.push((l) => !lista.includes(String(l[coluna])));
        }
        return q;
      },
      gte(coluna, valor) {
        filtros.push((l) => String(l[coluna]) >= valor);
        return q;
      },
      lte(coluna, valor) {
        filtros.push((l) => String(l[coluna]) <= valor);
        return q;
      },
      lt(coluna, valor) {
        filtros.push((l) => String(l[coluna]) < valor);
        return q;
      },
      like(coluna, padrao) {
        // Só o caso usado: prefixo seguido de `%`.
        const prefixo = padrao.replace(/%$/, "");
        filtros.push((l) => String(l[coluna] ?? "").startsWith(prefixo));
        return q;
      },
      order(coluna, opts) {
        ordem = { coluna, asc: opts?.ascending !== false };
        return q;
      },
      limit(n) {
        limite = n;
        return q;
      },
      async single() {
        const r = executar();
        if (r.error) return { data: null, error: r.error };
        return r.data.length === 1 ? { data: r.data[0], error: null } : { data: null, error: { message: "esperava uma linha" } };
      },
      async maybeSingle() {
        const r = executar();
        if (r.error) return { data: null, error: r.error };
        return { data: r.data[0] ?? null, error: null };
      },
      then(resolver, rejeitar) {
        return Promise.resolve(executar()).then(resolver, rejeitar);
      },
    };
    return q;
  }

  return {
    tabelas,
    cliente: { from, storage: {} },
    falharProxima: (tabela, mensagem) => void falhas.set(tabela, mensagem),
  };
}
