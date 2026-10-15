/**
 * O PAINEL da área do cliente: onde as pessoas param, o que mais abrem, o que
 * desejam e o que compram depois de ver.
 *
 * Tudo em pessoas (contatos distintos), não em cliques: dez visitas da mesma
 * cliente são uma pessoa que voltou, não dez clientes.
 *
 * A COMPRA não é evento da área: vem do ledger de receita. Ela conta para a
 * área quando acontece depois de um clique em "comprar" da mesma pessoa, dentro
 * de `JANELA_DE_ATRIBUICAO_DIAS`. Para o serviço, conta se o nome do produto
 * pago casa com o do serviço clicado; sem nome no pagamento, conta para o
 * último serviço clicado antes dele.
 *
 * A regra é pura (`calcularPainel`) e testada; `lerPainel` só busca as linhas.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { slugDoProduto } from "@/lib/preco/pos-venda";

import { JANELA_DE_ATRIBUICAO_DIAS, type TipoDeEventoDaArea } from "./vocabulario";

export interface LinhaDeEvento {
  contact_id: string;
  tipo: TipoDeEventoDaArea;
  servico_id: string | null;
  ref: string | null;
  props: Record<string, unknown> | null;
  created_at: string;
}

export interface LinhaDeCompra {
  contact_id: string;
  produto: string | null;
  amount_cents: number;
  occurred_at: string;
}

export interface ServicoDoPainel {
  id: string;
  nome: string;
  preco_cents: number;
}

export interface EtapaDoFunil {
  etapa: "convidados" | "entraram" | "voltaram" | "viram_servicos" | "clicaram_comprar" | "compraram";
  pessoas: number;
}

export interface LinhaDoServico {
  id: string;
  nome: string;
  viram: number;
  clicaram: number;
  compraram: number;
  receita_cents: number;
}

export interface Painel {
  funil: EtapaDoFunil[];
  servicos: LinhaDoServico[];
  /** Onde cada pessoa que entrou parou: o evento mais avançado que ela fez. */
  ondeParam: Array<{ etapa: EtapaOndeParam; pessoas: number }>;
  materiaisAbertos: { aberturas: number; pessoas: number };
  desejos: Array<{ texto: string; pessoas: number }>;
  receitaAtribuida_cents: number;
  /** Os motivos para voltar, em pessoas: revelaram a carta, escreveram no diário, contaram o aniversário. */
  engajamento: { cartaDoDia: number; diario: number; aniversarios: number };
  /** O Círculo no período, em pessoas: abriram o pagamento, pagaram, fizeram a pergunta do mês. */
  circulo: { abriramPagamento: number; pagaram: number; perguntaram: number };
  /** Presentes e Ano Pessoal no período: quem comprou e quantos presentes já foram usados. */
  ofertas: { presentesComprados: number; presentesUsados: number; anoPessoalComprado: number };
}

const ORDEM_DO_AVANCO: Record<string, number> = {
  entrou: 1,
  visitou: 1,
  material_aberto: 2,
  servico_visto: 3,
  checkout_clicado: 4,
};
/** O passo mais avançado de cada pessoa. A tela dá o nome; aqui só o código. */
export const ETAPAS_ONDE_PARAM = ["so_entrou", "abriu_material", "viu_servico", "clicou_comprar", "comprou"] as const;
export type EtapaOndeParam = (typeof ETAPAS_ONDE_PARAM)[number];

const JANELA_MS = JANELA_DE_ATRIBUICAO_DIAS * 86_400_000;

export function calcularPainel(
  eventos: readonly LinhaDeEvento[],
  compras: readonly LinhaDeCompra[],
  servicos: readonly ServicoDoPainel[],
): Painel {
  const pessoasCom = (tipo: TipoDeEventoDaArea) => new Set(eventos.filter((e) => e.tipo === tipo).map((e) => e.contact_id));

  const convidados = pessoasCom("convite_criado");
  const entraram = pessoasCom("entrou");
  const visitasPorPessoa = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (e.tipo !== "visitou") continue;
    const dias = visitasPorPessoa.get(e.contact_id) ?? new Set<string>();
    dias.add(e.created_at.slice(0, 10));
    visitasPorPessoa.set(e.contact_id, dias);
  }
  const voltaram = [...visitasPorPessoa.values()].filter((d) => d.size >= 2).length;

  // Atribuição: cada compra vai para o clique mais recente da mesma pessoa,
  // anterior a ela e dentro da janela — no serviço de mesmo nome, se houver.
  const cliques = eventos
    .filter((e) => e.tipo === "checkout_clicado")
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const nomePorServico = new Map(servicos.map((s) => [s.id, slugDoProduto(s.nome)]));
  const compraramPorServico = new Map<string, Set<string>>();
  const receitaPorServico = new Map<string, number>();
  const compradores = new Set<string>();
  let receitaAtribuida = 0;
  for (const c of compras) {
    const t = new Date(c.occurred_at).getTime();
    const daPessoa = cliques.filter((k) => {
      if (k.contact_id !== c.contact_id) return false;
      const tk = new Date(k.created_at).getTime();
      return tk <= t && t - tk <= JANELA_MS;
    });
    if (daPessoa.length === 0) continue;
    const slug = c.produto ? slugDoProduto(c.produto) : "";
    const mesmoNome = slug ? daPessoa.filter((k) => k.servico_id && nomePorServico.get(k.servico_id) === slug) : [];
    const escolhido = (mesmoNome.length ? mesmoNome : slug ? [] : daPessoa).at(-1);
    compradores.add(c.contact_id);
    receitaAtribuida += c.amount_cents;
    if (escolhido?.servico_id) {
      const quem = compraramPorServico.get(escolhido.servico_id) ?? new Set<string>();
      quem.add(c.contact_id);
      compraramPorServico.set(escolhido.servico_id, quem);
      receitaPorServico.set(escolhido.servico_id, (receitaPorServico.get(escolhido.servico_id) ?? 0) + c.amount_cents);
    }
  }

  const porServico = (tipo: TipoDeEventoDaArea, id: string) =>
    new Set(eventos.filter((e) => e.tipo === tipo && e.servico_id === id).map((e) => e.contact_id)).size;
  const linhas: LinhaDoServico[] = servicos
    .map((s) => ({
      id: s.id,
      nome: s.nome,
      viram: porServico("servico_visto", s.id),
      clicaram: porServico("checkout_clicado", s.id),
      compraram: compraramPorServico.get(s.id)?.size ?? 0,
      receita_cents: receitaPorServico.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.compraram - a.compraram || b.clicaram - a.clicaram || b.viram - a.viram);

  // Onde param: o passo mais avançado de cada pessoa que entrou.
  const avanco = new Map<string, number>();
  for (const e of eventos) {
    const n = ORDEM_DO_AVANCO[e.tipo];
    if (n === undefined) continue;
    avanco.set(e.contact_id, Math.max(avanco.get(e.contact_id) ?? 0, n));
  }
  for (const quem of compradores) avanco.set(quem, 5);
  const contagem = new Map<number, number>();
  for (const n of avanco.values()) contagem.set(n, (contagem.get(n) ?? 0) + 1);
  const ondeParam = ETAPAS_ONDE_PARAM.map((etapa, i) => ({ etapa, pessoas: contagem.get(i + 1) ?? 0 }));

  const aberturas = eventos.filter((e) => e.tipo === "material_aberto");

  const desejoPorTexto = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (e.tipo !== "desejo") continue;
    const texto = String(e.props?.opcao ?? e.props?.texto ?? "").trim();
    if (!texto) continue;
    const chave = texto.toLocaleLowerCase("pt-BR");
    const quem = desejoPorTexto.get(chave) ?? new Set<string>();
    quem.add(e.contact_id);
    desejoPorTexto.set(chave, quem);
  }
  const desejos = [...desejoPorTexto.entries()]
    .map(([texto, quem]) => ({ texto, pessoas: quem.size }))
    .sort((a, b) => b.pessoas - a.pessoas)
    .slice(0, 30);

  return {
    funil: [
      { etapa: "convidados", pessoas: convidados.size },
      { etapa: "entraram", pessoas: entraram.size },
      { etapa: "voltaram", pessoas: voltaram },
      { etapa: "viram_servicos", pessoas: pessoasCom("servico_visto").size },
      { etapa: "clicaram_comprar", pessoas: pessoasCom("checkout_clicado").size },
      { etapa: "compraram", pessoas: compradores.size },
    ],
    servicos: linhas,
    ondeParam,
    materiaisAbertos: { aberturas: aberturas.length, pessoas: new Set(aberturas.map((e) => e.contact_id)).size },
    desejos,
    receitaAtribuida_cents: receitaAtribuida,
    engajamento: {
      cartaDoDia: pessoasCom("carta_do_dia").size,
      diario: pessoasCom("diario_escrito").size,
      aniversarios: pessoasCom("aniversario_salvo").size,
    },
    circulo: {
      abriramPagamento: pessoasCom("circulo_checkout").size,
      pagaram: pessoasCom("circulo_ativado").size,
      perguntaram: pessoasCom("pergunta_enviada").size,
    },
    ofertas: {
      presentesComprados: eventos.filter((e) => e.tipo === "presente_pago").length,
      presentesUsados: eventos.filter((e) => e.tipo === "presente_usado").length,
      anoPessoalComprado: pessoasCom("ano_pessoal_pago").size,
    },
  };
}

const MAX_LINHAS = 20_000;
/** O PostgREST desta instalação devolve no máximo 1.000 linhas por pedido (medido em 10/10/2026). */
const PAGINA = 1000;

/** Busca página a página até acabar ou chegar ao teto — o corte de 1.000 não pode virar número menor calado. */
async function todas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ linhas: T[]; truncado: boolean }> {
  const linhas: T[] = [];
  for (let de = 0; de < MAX_LINHAS; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA) return { linhas, truncado: false };
  }
  return { linhas, truncado: true };
}

export async function lerPainel(
  db: SupabaseClient,
  orgId: string,
  desde: Date,
): Promise<Painel & { truncado: boolean; assinantesAtivos: number }> {
  const [eventosR, comprasR, servicosR] = await Promise.all([
    todas<LinhaDeEvento>((de, ate) =>
      db
        .from("area_eventos")
        .select("contact_id, tipo, servico_id, ref, props, created_at")
        .eq("organization_id", orgId)
        .gte("created_at", desde.toISOString())
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(de, ate),
    ),
    todas<{ contact_id: string; amount_cents: number; occurred_at: string; metadata: Record<string, unknown> | null }>(
      (de, ate) =>
        db
          .from("revenue_ledger")
          .select("contact_id, amount_cents, occurred_at, metadata")
          .eq("organization_id", orgId)
          .eq("event_type", "charge")
          .not("contact_id", "is", null)
          .gte("occurred_at", desde.toISOString())
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(de, ate),
    ),
    db.from("area_servicos").select("id, nome, preco_cents").eq("organization_id", orgId),
  ]);
  const { count: assinantesAtivos } = await db
    .from("area_assinaturas")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gt("valido_ate", new Date().toISOString());
  if (servicosR.error) throw new Error(servicosR.error.message);
  const compras = comprasR.linhas.map((c) => ({
    contact_id: c.contact_id,
    amount_cents: c.amount_cents,
    occurred_at: c.occurred_at,
    produto: typeof c.metadata?.produto === "string" ? c.metadata.produto : null,
  }));
  return {
    ...calcularPainel(eventosR.linhas, compras, (servicosR.data ?? []) as ServicoDoPainel[]),
    truncado: eventosR.truncado || comprasR.truncado,
    assinantesAtivos: assinantesAtivos ?? 0,
  };
}
