import { type NextRequest } from "next/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";
import { lerGastoDeAnuncios } from "@/lib/plataformas-de-anuncio/meta/gasto-do-periodo";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { roleAtLeast } from "@/lib/auth/types";
import { contasDoAnuncio, type GastoDoPeriodo } from "@/lib/resultado/contas-do-anuncio";
import { calcularDelta, calcularIntervalo, gastoTemComparacao, lerFusoDaOrganizacao, paraParede } from "@/lib/resultado/periodo";
import { custoDeIaPorVenda, lerConsumoDeIa } from "@/lib/resultado/custo-de-ia";
import { descontarIa, lerCotacaoDoDolar } from "@/lib/resultado/cotacao-do-dolar";
import { lerTodasAsLinhas } from "@/lib/resultado/ler-todas-as-linhas";
import { lerVendasDoPagamento, type VendaDoPainel } from "@/lib/resultado/vendas-do-pagamento";
import {
  canaisDoAgente,
  funilDoPainel,
  gastoDoFunil,
  lerPainel,
  lerPassosDoFunil,
  listarFunis,
  nomesDeExibicaoDoAgente,
  separarVendasPorFunil,
  sugerirFunilDaCampanha,
} from "@/lib/resultado/funis";
import { instanteDe, partesNoFuso } from "@/lib/agenda/fuso";
import { lerPricing } from "@/lib/preco/tipos";
import { progressoDaMeta, type LinhaDaMeta } from "@/lib/venda/meta-do-mes";

interface ConversaDoPainel {
  id: string;
  contact_id: string | null;
  status: string | null;
  assigned_to_user_id: string | null;
  channel_session_id: string | null;
  last_outbound_at: string | null;
  created_at: string;
  service_closed_at: string | null;
}

export const dynamic = "force-dynamic";

const RESTRITO: GastoDoPeriodo = { estado: "restrito" };
const SEM_CANAL = "00000000-0000-0000-0000-000000000000";

// Mapeamento de DDDs para Estados Brasileiros (UFs)
const DDD_TO_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA"
};

function extrairUfDoTelefone(telefone?: string | null): string {
  if (!telefone) return "Outros";
  const limpo = telefone.replace(/\D/g, "");
  // Telefone BR: +55 (DD) 9XXXX-XXXX
  let ddd = "";
  if (limpo.startsWith("55") && limpo.length >= 4) {
    ddd = limpo.slice(2, 4);
  } else if (limpo.length >= 2) {
    ddd = limpo.slice(0, 2);
  }
  return DDD_TO_UF[ddd] ?? "Outros";
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const org = await resolveActiveOrg(user);
    if (!org) return fail("unauthorized", "Organização ativa não encontrada", 401);
    const orgId = org.orgId;

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "vendas";
    const period = searchParams.get("period") || "today";
    const _channelSessionId = searchParams.get("channelSessionId") || null;
    const _productId = searchParams.get("productId") || null;

    const now = new Date();
    const admin = createAdminClient();
    const fuso = await lerFusoDaOrganizacao(admin, orgId);
    const { start, end, prevStart, prevEnd } = calcularIntervalo(period, now, fuso);

    // O recorte por funil (`lib/resultado/funis.ts`): sem `funil` na URL vale o padrão da organização
    // (`settings.painel.funil_padrao`); `funil=todos` mostra o geral.
    const { data: orgData } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const painel = lerPainel((orgData as { settings?: unknown } | null)?.settings);
    const { funis, agentes } = await listarFunis(admin, orgId, [...Object.values(painel.produtos), ...Object.values(painel.campanhas)]);
    const funil = funilDoPainel(searchParams.get("funil"), painel.funil_padrao, funis);
    // Funil de agente: os canais dele. Página/quiz não tem conversa: nenhum canal (id que não existe), nunca o geral.
    const canaisDoRecorte = !funil
      ? null
      : funil.tipo === "agente"
        ? await canaisDoAgente(admin, orgId, funil.id).then((c) => (c.length > 0 ? c : [SEM_CANAL]))
        : [SEM_CANAL];
    // Lead do agente = contato com conversa num canal dele (o lead novo ainda não ouviu o agente).
    // Lead de página/quiz = visita que abriu (`area_quiz_passos`, passo `abriu`).
    const contarLeads = (de: Date, ate: Date) => {
      if (funil && funil.tipo !== "agente") {
        let q = admin
          .from("area_quiz_passos")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .in("quiz", [funil.tipo === "pagina" ? "pagina" : funil.id])
          .in("passo", ["abriu"]);
        if (funil.tipo === "pagina") q = q.in("pagina", [funil.id]);
        return q.gte("created_at", de.toISOString()).lte("created_at", ate.toISOString());
      }
      const q = canaisDoRecorte
        ? admin
            .from("contacts")
            .select("id, conversations!inner(channel_session_id)", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .in("conversations.channel_session_id", canaisDoRecorte)
        : admin.from("contacts").select("*", { count: "exact", head: true }).eq("organization_id", orgId);
      return q.gte("created_at", de.toISOString()).lte("created_at", ate.toISOString());
    };
    const listaDeFunis = funis.map((f) => ({ chave: f.chave, tipo: f.tipo, nome: f.nome }));

    // Buscar conexões e canais da organização
    const { data: canais } = await admin
      .from("channel_sessions")
      // `name:display_name`: a coluna se chama `display_name`. Pedindo `name`, o banco recusava a
      // consulta inteira (medido em produção em 09/10/2026: 583 recusas por dia) — a lista de
      // conexões do painel vinha vazia e toda venda aparecia em "Canal Padrão".
      .select("id, name:display_name, phone_number, status")
      .eq("organization_id", orgId)
      .is("archived_at", null);

    // Contagem total de leads acumulados da organização
    // Fica na organização inteira: pelo canal o acumulado perde quem chegou por número que já saiu do agente.
    const { count: totalLeadsAcumulados } = await admin
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);

    if (tab === "vendas") {
      // 1. Leads novos no período
      const [{ count: leadsNovosCount }, { count: prevLeadsNovosCount }] = await Promise.all([
        contarLeads(start, end),
        contarLeads(prevStart, prevEnd),
      ]);

      // 2. Vendas e Faturamento no período
      const salesQuery = admin
        .from("sales")
        .select("id, number, contact_id, status, total_cents, created_at, attendant_user_id, notes")
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        // Só a comanda fechada é venda: a aberta ainda não recebeu nada (medido: uma aberta desde 05/10 somava).
        .eq("status", "finalized");

      const prevSalesQuery = admin
        .from("sales")
        .select("id, contact_id, total_cents")
        .eq("organization_id", orgId)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())
        .eq("status", "finalized");

      const [{ data: salesData }, { data: prevSalesData }] = await Promise.all([
        salesQuery.order("created_at", { ascending: false }),
        prevSalesQuery,
      ]);

      // A comanda interna (`sales`) e o gateway de pagamento (`revenue_ledger`) são os dois caminhos de
      // venda: quem vende pelo link nunca passa pela comanda. As vendas do gateway entram na MESMA lista,
      // já sem as estornadas, e todo o resto do painel (gráficos, estado, histórico) as soma junto.
      const podeVerGasto = user.is_platform_admin || roleAtLeast(org.role, "manager");
      const [vendasDoGateway, vendasDoGatewayAntes, gastoDoPeriodoGeral, gastoAnteriorGeral, consumoDeIa, consumoDeIaAntes] = await Promise.all([
        lerVendasDoPagamento(admin, orgId, start, end),
        lerVendasDoPagamento(admin, orgId, prevStart, prevEnd),
        // Gasto de anúncio é dado de gerente para cima, como a tela de anúncios (`requireRole("manager")`).
        podeVerGasto ? lerGastoDeAnuncios(admin, orgId, start, end, fuso) : RESTRITO,
        podeVerGasto ? lerGastoDeAnuncios(admin, orgId, prevStart, prevEnd, fuso) : RESTRITO,
        // Custo de IA é dado de gerente para cima, como a tela Uso de IA (`requireRole("manager")`).
        podeVerGasto ? lerConsumoDeIa(admin, orgId, start, end) : null,
        podeVerGasto ? lerConsumoDeIa(admin, orgId, prevStart, prevEnd) : null,
      ]);
      let todas: VendaDoPainel[] = [...((salesData ?? []) as VendaDoPainel[]), ...vendasDoGateway];
      let prevSales: VendaDoPainel[] = [...((prevSalesData ?? []) as VendaDoPainel[]), ...vendasDoGatewayAntes];
      // Cada venda num funil só, onde fechou. As sem funil viram pendência na tela ("ligar a um funil").
      const [porFunil, porFunilAntes] = await Promise.all([
        separarVendasPorFunil(admin, orgId, agentes, painel.produtos, todas, end),
        separarVendasPorFunil(admin, orgId, agentes, painel.produtos, prevSales, prevEnd),
      ]);
      const produtosSemFunil = new Map<string, { nome: string; vendas: number; valor: number }>();
      for (const v of porFunil.get(null) ?? []) {
        const nome = v.notes?.trim() || "(sem nome)";
        const p = produtosSemFunil.get(nome) ?? { nome, vendas: 0, valor: 0 };
        p.vendas++;
        p.valor += v.total_cents / 100;
        produtosSemFunil.set(nome, p);
      }
      if (funil) {
        todas = porFunil.get(funil.chave) ?? [];
        prevSales = porFunilAntes.get(funil.chave) ?? [];
      }
      const sales = todas.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      // O gasto do funil é o das campanhas ligadas a ele; o custo de IA segue sendo o da organização.
      const doFunil = (g: GastoDoPeriodo): GastoDoPeriodo =>
        funil && g.estado === "ok" ? { ...g, centavos: gastoDoFunil(g.campanhas ?? [], painel.campanhas, funil.chave) } : g;
      const gastoDoPeriodo = doFunil(gastoDoPeriodoGeral);
      const gastoAnterior = doFunil(gastoAnteriorGeral);
      const campanhasSemFunil =
        gastoDoPeriodoGeral.estado === "ok"
          ? (gastoDoPeriodoGeral.campanhas ?? [])
              .filter((c) => c.centavos > 0 && !painel.campanhas[c.id])
              .map((c) => ({ id: c.id, nome: c.nome, gasto: c.centavos / 100, sugestao: sugerirFunilDaCampanha(c.nome, funis) }))
          : [];
      const passos = funil && funil.tipo !== "agente" ? await lerPassosDoFunil(admin, orgId, funil, start, end) : null;
      // META DO MÊS (`lib/venda/meta-do-mes.ts`): no funil de um agente com meta, cada produto dele contra a meta,
      // no mês do relógio da organização — o mesmo número que ordena as ofertas da agente.
      let metaDoMes: LinhaDaMeta[] | null = null;
      const agenteDoFunil = funil?.tipo === "agente" ? agentes.find((a) => a.id === funil.id) : undefined;
      const pricingDoFunil = agenteDoFunil ? lerPricing(agenteDoFunil.config) : null;
      if (agenteDoFunil && pricingDoFunil?.meta_mensal_por_produto) {
        const agoraMeta = new Date();
        const hoje = partesNoFuso(agoraMeta, fuso);
        const inicioDoMes = instanteDe({ ano: hoje.ano, mes: hoje.mes, dia: 1, hora: 0, minuto: 0 }, fuso);
        const diasNoMes = new Date(Date.UTC(hoje.ano, hoje.mes, 0)).getUTCDate();
        const doMes = await lerVendasDoPagamento(admin, orgId, inicioDoMes, agoraMeta);
        const doMesPorFunil = await separarVendasPorFunil(admin, orgId, agentes, painel.produtos, doMes, agoraMeta);
        metaDoMes = progressoDaMeta(
          nomesDeExibicaoDoAgente(agenteDoFunil.config),
          doMesPorFunil.get(funil!.chave) ?? [],
          pricingDoFunil,
          hoje.dia,
          diasNoMes,
        );
      }

      // Venda é produto principal; extra é receita, com contagem à parte. Medido em outubro: 55 das 130 "vendas"
      // eram cobranças avulsas, quase todas de R$ 5, o que dobrava a conversão aparente.
      const ehVenda = (s: { id: string; extra?: boolean }): boolean => s.extra !== true;
      const vendasCount = sales.filter(ehVenda).length;
      const prevVendasCount = prevSales.filter(ehVenda).length;
      const extrasCount = sales.length - vendasCount;
      // Quem pagou, uma vez só por pessoa. Cobrança sem contato conta como uma pessoa.
      const clientes = (lista: readonly { id: string; contact_id?: string | null }[]): number =>
        new Set(lista.map((s) => s.contact_id ?? s.id)).size;
      const clientesCount = clientes(sales);
      const prevClientesCount = clientes(prevSales);

      const faturamentoCents = sales.reduce((acc, s) => acc + (Number(s.total_cents) || 0), 0);
      const prevFaturamentoCents = prevSales.reduce((acc, s) => acc + (Number(s.total_cents) || 0), 0);

      const faturamentoReais = faturamentoCents / 100;
      const prevFaturamentoReais = prevFaturamentoCents / 100;

      const ticketMedio = clientesCount > 0 ? faturamentoReais / clientesCount : 0;
      const prevTicketMedio = prevClientesCount > 0 ? prevFaturamentoReais / prevClientesCount : 0;

      const leadsCount = leadsNovosCount ?? 0;
      const taxaConversao = leadsCount > 0 ? Number(((clientesCount / leadsCount) * 100).toFixed(2)) : 0;
      const prevTaxaConversao = (prevLeadsNovosCount ?? 0) > 0 ? Number(((prevClientesCount / (prevLeadsNovosCount ?? 1)) * 100).toFixed(2)) : 0;

      // O gasto LIDO da conta de anúncios (era um zero fixo). Desconhecido não vira zero: ROAS fica nulo e
      // o lucro não desconta anúncio — ver `contasDoAnuncio`.
      const contas = contasDoAnuncio(faturamentoReais, gastoDoPeriodo);
      const contasAntes = contasDoAnuncio(prevFaturamentoReais, gastoAnterior);
      // Variação desconhecida é `null`, nunca zero: "não mudou" e "não dá para comparar" são respostas
      // diferentes. O lucro só compara quando os dois lados descontam (ou não) o anúncio do mesmo jeito.
      const gastoComparavel = gastoTemComparacao(period);
      // A IA também é custo da venda: o lucro desconta o consumo do período convertido pela PTAX do Banco Central
      // (`cotacao-do-dolar.ts`). Sem consumo lido ou sem cotação, não desconta — e o painel diz isso.
      const cotacao = consumoDeIa === null ? null : await lerCotacaoDoDolar();
      const comIa = descontarIa(contas.lucro, consumoDeIa?.custoCents ?? null, cotacao);
      const comIaAntes = descontarIa(contasAntes.lucro, consumoDeIaAntes?.custoCents ?? null, cotacao);
      const lucroComparavel =
        contas.gastoNaConta === contasAntes.gastoNaConta && (gastoComparavel || !contas.gastoNaConta) &&
        comIa.descontaIa === comIaAntes.descontaIa;

      // 3. Vendas por período (série temporal para o gráfico)
      const vendasPorPeriodoMap = new Map<string, { label: string; valor: number; qtd: number }>();
      const isDailyGrouping = period === "today" || period === "yesterday";

      if (isDailyGrouping) {
        // Horas do dia de 2 em 2 horas
        for (let h = 0; h < 24; h += 2) {
          const key = `${String(h).padStart(2, "0")}h`;
          vendasPorPeriodoMap.set(key, { label: key, valor: 0, qtd: 0 });
        }
      } else {
        // Dias, contados no fuso da organização (relógio de parede: campos UTC = hora local).
        const cur = paraParede(start, fuso);
        const ultimo = paraParede(end, fuso);
        while (cur <= ultimo) {
          const key = `${String(cur.getUTCDate()).padStart(2, "0")}/${String(cur.getUTCMonth() + 1).padStart(2, "0")}`;
          vendasPorPeriodoMap.set(key, { label: key, valor: 0, qtd: 0 });
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      }

      // Distribuição por horário (24 horas)
      const vendasPorHorario = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        label: `${String(h).padStart(2, "0")}h`,
        valor: 0,
        qtd: 0,
      }));

      // Distribuição por Estado (UF)
      const vendasPorEstadoMap = new Map<string, { count: number; valor: number }>();

      // Carregar dados de contatos das vendas para enriquecer a tabela e o mapa de UF
      const contactIds = Array.from(new Set(sales.map((s) => s.contact_id).filter(Boolean))) as string[];
      const contactsMap = new Map<string, { name: string | null; phone: string | null; channelSessionId: string | null }>();
      // A conexão de cada conversa: a venda do gateway sabe de qual conversa veio a cobrança.
      const canalDaConversa = new Map<string, string | null>();
      const canalDaVenda = (s: VendaDoPainel): string | null =>
        (s.conversation_id ? canalDaConversa.get(s.conversation_id) : undefined) ??
        (s.contact_id ? contactsMap.get(s.contact_id)?.channelSessionId ?? null : null);

      if (contactIds.length > 0) {
        const { data: contactsData } = await admin
          .from("contacts")
          .select("id, name, display_name, phone_number")
          .in("id", contactIds);

        // Buscar conversas para vincular o channel_session_id
        const { data: convData } = await admin
          .from("conversations")
          .select("id, contact_id, channel_session_id, updated_at")
          .in("contact_id", contactIds)
          // A MAIS RECENTE vence (o Map fica com a última): quem trocou de número aparece na conexão de hoje.
          .order("updated_at", { ascending: true });

        const convByContact = new Map(convData?.map((c) => [c.contact_id, c.channel_session_id]) ?? []);
        for (const c of convData ?? []) canalDaConversa.set(c.id, c.channel_session_id);

        for (const c of contactsData ?? []) {
          contactsMap.set(c.id, {
            name: nomeDoContato(c),
            phone: c.phone_number,
            channelSessionId: convByContact.get(c.id) ?? null,
          });
        }
      }

      // Preencher séries temporais e distribuições
      for (const s of sales) {
        // A hora e o dia da venda são os da organização, não os do servidor.
        const saleDate = paraParede(new Date(s.created_at), fuso);
        const valor = (Number(s.total_cents) || 0) / 100;
        const hora = saleDate.getUTCHours();

        // Horário
        if (vendasPorHorario[hora]) {
          vendasPorHorario[hora].valor += valor;
          vendasPorHorario[hora].qtd += 1;
        }

        // Período
        let pKey = "";
        if (isDailyGrouping) {
          const blockHour = Math.floor(hora / 2) * 2;
          pKey = `${String(blockHour).padStart(2, "0")}h`;
        } else {
          pKey = `${String(saleDate.getUTCDate()).padStart(2, "0")}/${String(saleDate.getUTCMonth() + 1).padStart(2, "0")}`;
        }
        const item = vendasPorPeriodoMap.get(pKey);
        if (item) {
          item.valor += valor;
          item.qtd += 1;
        }

        // Estado
        const contato = s.contact_id ? contactsMap.get(s.contact_id) : null;
        const uf = extrairUfDoTelefone(contato?.phone);
        const estadoItem = vendasPorEstadoMap.get(uf) ?? { count: 0, valor: 0 };
        estadoItem.count += 1;
        estadoItem.valor += valor;
        vendasPorEstadoMap.set(uf, estadoItem);
      }

      // Distribuição por Instância
      const canaisMap = new Map(canais?.map((c) => [c.id, c]) ?? []);
      const vendasPorInstanciaMap = new Map<string, { id: string; name: string; phone: string; vendas: number; faturamento: number }>();

      for (const s of sales) {
        const canalId = canalDaVenda(s) ?? "desconhecido";
        const canal = canaisMap.get(canalId);
        const nome = canal?.name || "Canal Padrão";
        const phone = canal?.phone_number || "Sem número";
        const valor = (Number(s.total_cents) || 0) / 100;

        const inst = vendasPorInstanciaMap.get(canalId) ?? { id: canalId, name: nome, phone, vendas: 0, faturamento: 0 };
        inst.vendas += 1;
        inst.faturamento += valor;
        vendasPorInstanciaMap.set(canalId, inst);
      }

      // 4. Histórico detalhado de vendas
      const historicoVendas = sales.slice(0, 20).map((s) => {
        const contato = s.contact_id ? contactsMap.get(s.contact_id) : null;
        const canalId = canalDaVenda(s);
        const canal = canalId ? canaisMap.get(canalId) : null;
        return {
          id: s.id,
          number: s.number,
          contactId: s.contact_id,
          clienteNome: contato?.name || "Lead",
          clienteTelefone: contato?.phone || "—",
          instanciaNome: canal?.name || "WhatsApp Principal",
          instanciaNumero: canal?.phone_number || "—",
          produto: s.notes || "Oferta Especial",
          valor: (Number(s.total_cents) || 0) / 100,
          status: s.status,
          data: s.created_at,
        };
      });

      // 5. Itens e Performance de Produtos
      const saleIds = sales.map((s) => s.id);
      let performanceProdutos: Array<{ name: string; valor: number; qtd: number; percentual: number }> = [];

      if (saleIds.length > 0) {
        const { data: items } = await admin
          .from("sale_items")
          .select("sale_id, description, quantity, total_cents")
          .in("sale_id", saleIds);

        const prodMap = new Map<string, { name: string; valor: number; qtd: number }>();
        let totalItensValor = 0;
        // As vendas do gateway não têm `sale_items`: o produto é o que o pagamento registrou (`notes`).
        const comItens = new Set<string>();

        for (const item of items ?? []) {
          comItens.add(item.sale_id);
          const nome = item.description || "Produto Geral";
          const val = (Number(item.total_cents) || 0) / 100;
          const qtd = item.quantity || 1;
          totalItensValor += val;

          const p = prodMap.get(nome) ?? { name: nome, valor: 0, qtd: 0 };
          p.valor += val;
          p.qtd += qtd;
          prodMap.set(nome, p);
        }

        for (const venda of sales) {
          if (comItens.has(venda.id) || !venda.notes) continue;
          const val = (Number(venda.total_cents) || 0) / 100;
          totalItensValor += val;
          const p = prodMap.get(venda.notes) ?? { name: venda.notes, valor: 0, qtd: 0 };
          p.valor += val;
          p.qtd += 1;
          prodMap.set(venda.notes, p);
        }

        performanceProdutos = Array.from(prodMap.values())
          .map((p) => ({
            ...p,
            percentual: totalItensValor > 0 ? Number(((p.valor / totalItensValor) * 100).toFixed(1)) : 0,
          }))
          .sort((a, b) => b.valor - a.valor);
      }

      return ok({
        tab: "vendas",
        totalLeadsAcumulados: totalLeadsAcumulados ?? 0,
        conexoes: canais ?? [],
        funis: listaDeFunis,
        funil: funil?.chave ?? null,
        passos,
        metaDoMes,
        pendencias: { produtos: [...produtosSemFunil.values()], campanhas: campanhasSemFunil },
        kpis: {
          leadsNovos: { valor: leadsCount, delta: calcularDelta(leadsCount, prevLeadsNovosCount ?? 0) },
          faturamento: { valor: faturamentoReais, delta: calcularDelta(faturamentoReais, prevFaturamentoReais) },
          vendas: { valor: vendasCount, delta: calcularDelta(vendasCount, prevVendasCount), extras: extrasCount, clientes: clientesCount },
          roas: {
            valor: contas.roas,
            delta: gastoComparavel && contas.roas !== null && contasAntes.roas !== null ? calcularDelta(contas.roas, contasAntes.roas) : null,
          },
          taxaConversao: { valor: taxaConversao, delta: calcularDelta(taxaConversao, prevTaxaConversao) },
          ticketMedio: { valor: ticketMedio, delta: calcularDelta(ticketMedio, prevTicketMedio) },
          lucro: {
            valor: comIa.lucro,
            delta: lucroComparavel ? calcularDelta(comIa.lucro, comIaAntes.lucro) : null,
            descontaAnuncio: contas.gastoNaConta,
            descontaIa: comIa.descontaIa,
          },
          gastoMeta: {
            valor: contas.gasto,
            delta: gastoComparavel && contas.gasto !== null && contasAntes.gasto !== null ? calcularDelta(contas.gasto, contasAntes.gasto) : null,
            estado: contas.estado,
            moeda: contas.moeda,
          },
          // Em DÓLAR, e também em real pela PTAX (é esse que sai do lucro). `null` = sem permissão ou
          // leitura indisponível — nunca zero.
          consumoDeIa:
            consumoDeIa === null
              ? null
              : {
                  custoUsd: consumoDeIa.custoCents / 100,
                  // O mesmo custo em real, pela PTAX — o que entrou no lucro. `null` = sem cotação.
                  custoReais: comIa.custoIaReais,
                  cotacao: cotacao === null ? null : { reais: cotacao.reais, dia: cotacao.dia },
                  delta: consumoDeIaAntes === null ? null : calcularDelta(consumoDeIa.custoCents, consumoDeIaAntes.custoCents),
                  tokensLidos: consumoDeIa.tokensLidos,
                  tokensEscritos: consumoDeIa.tokensEscritos,
                  chamadas: consumoDeIa.chamadas,
                  chamadasSemPreco: consumoDeIa.chamadasSemPreco,
                  porVendaUsd: custoDeIaPorVenda(consumoDeIa, vendasCount),
                },
        },
        vendasPorPeriodo: Array.from(vendasPorPeriodoMap.values()),
        vendasPorHorario,
        vendasPorInstancia: Array.from(vendasPorInstanciaMap.values()),
        vendasPorEstado: Array.from(vendasPorEstadoMap.entries())
          .map(([uf, d]) => ({ uf, count: d.count, valor: d.valor }))
          .sort((a, b) => b.count - a.count),
        historicoVendas,
        performanceProdutos,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TAB ATENDIMENTO
    // ──────────────────────────────────────────────────────────────────────────
    const [{ count: leadsNovosCount }, { count: prevLeadsNovosCount }] = await Promise.all([
      contarLeads(start, end),
      contarLeads(prevStart, prevEnd),
    ]);

    // Conversas atendidas e finalizadas
    const [conversas, { data: atendentesData }, { data: stagesData }] = await Promise.all([
      lerTodasAsLinhas<ConversaDoPainel>((de, ate) => {
        let q = admin
          .from("conversations")
          // `last_outbound_at` e `service_closed_at` são as colunas que existem. A consulta pedia
          // `first_outbound_at` e `closed_at`, era recusada, e a aba Atendimento mostrava zero em tudo.
          .select("id, contact_id, status, assigned_to_user_id, channel_session_id, last_outbound_at, created_at, service_closed_at")
          .eq("organization_id", orgId)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString());
        if (canaisDoRecorte) q = q.in("channel_session_id", canaisDoRecorte);
        return q.order("id").range(de, ate);
      }),
      admin
        // A tabela de membros é `user_organizations`; `organization_members` nunca existiu.
        .from("user_organizations")
        .select("user_id, role")
        .eq("organization_id", orgId)
        .is("revoked_at", null),
      admin
        .from("crm_stages")
        .select("id, name, color, position")
        .eq("organization_id", orgId)
        .order("position", { ascending: true }),
    ]);

    const leadsAtendidos = conversas.filter((c) => c.last_outbound_at !== null || c.assigned_to_user_id !== null).length;
    const leadsFinalizados = conversas.filter(
      (c) => c.status === "archived" || c.status === "closed" || c.status === "resolved" || c.service_closed_at !== null,
    ).length;

    // Tempo médio da PRIMEIRA resposta: a conversa não guarda a hora da primeira resposta (só a da
    // última), e medir pela última diria "respondeu em 6 horas" de uma conversa que foi respondida
    // em 20 segundos e continuou. Sem o dado certo o painel mostra o traço, não um número inventado.
    const tempoMedioMinutos = 0;

    // Distribuição horária de atendimentos
    const atendimentosPorHora = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}h`,
      count: 0,
    }));

    for (const c of conversas) {
      const h = paraParede(new Date(c.created_at), fuso).getUTCHours();
      if (atendimentosPorHora[h]) atendimentosPorHora[h].count += 1;
    }

    // Leads por status
    const statusMap = new Map<string, number>();
    for (const c of conversas) {
      const s = c.status || "open";
      statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
    }
    const leadsPorStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
      status: status === "open" ? "Abertos" : status === "archived" ? "Finalizados" : status === "pending" ? "Aguardando" : status,
      count,
    }));

    // Conversões e Valor por Coluna do Kanban
    const crmLeads = await lerTodasAsLinhas<{ id: string; stage_id: string | null; value_cents: number | null; contact_id: string | null }>(
      (de, ate) => admin
        .from("crm_leads")
        // O valor do negócio mora em `value_cents`; `estimated_value_cents` não existe.
        .select("id, stage_id, value_cents, contact_id")
        .eq("organization_id", orgId)
        .order("id")
        .range(de, ate),
    );
    const conversoesPorColuna = (stagesData ?? []).map((st) => {
      const leadsDaColuna = crmLeads.filter((l) => l.stage_id === st.id);
      const valorCents = leadsDaColuna.reduce((acc, l) => acc + (Number(l.value_cents) || 0), 0);
      return {
        stageId: st.id,
        stageName: st.name,
        color: st.color || "#6366f1",
        leadsCount: leadsDaColuna.length,
        valorTotal: valorCents / 100,
      };
    });

    return ok({
      tab: "atendimento",
      totalLeadsAcumulados: totalLeadsAcumulados ?? 0,
      conexoes: canais ?? [],
      funis: listaDeFunis,
      funil: funil?.chave ?? null,
      kpis: {
        leadsNovos: { valor: leadsNovosCount ?? 0, delta: calcularDelta(leadsNovosCount ?? 0, prevLeadsNovosCount ?? 0) },
        leadsAtendidos: { valor: leadsAtendidos, delta: 0 },
        leadsFinalizados: { valor: leadsFinalizados, delta: 0 },
        tempoRespostaMinutos: { valor: tempoMedioMinutos, delta: 0 },
      },
      atendimentosPorHora,
      leadsPorStatus,
      conversoesPorColuna,
      leadsPorAtendente: (atendentesData ?? []).map((m, idx) => ({
        id: m.user_id,
        name: `Atendente ${idx + 1}`,
        totalAtendimentos: conversas.filter((c) => c.assigned_to_user_id === m.user_id).length,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao carregar métricas do dashboard";
    return fail("internal_error", msg, 500);
  }
}
