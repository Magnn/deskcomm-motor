import { type NextRequest } from "next/server";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";

export const dynamic = "force-dynamic";

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

function calcularIntervalo(period: string, now: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
  } else if (period === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "last_month") {
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setDate(0); // último dia do mês anterior
    end.setHours(23, 59, 59, 999);
  } else {
    // Default 7d
    start.setDate(start.getDate() - 7);
  }

  const duracaoMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duracaoMs);

  return { start, end, prevStart, prevEnd };
}

function calcularDelta(atual: number, anterior: number): number {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
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
    const { start, end, prevStart, prevEnd } = calcularIntervalo(period, now);
    const admin = createAdminClient();

    // Buscar conexões e canais da organização
    const { data: canais } = await admin
      .from("channel_sessions")
      .select("id, name, phone_number, status")
      .eq("organization_id", orgId);

    // Contagem total de leads acumulados da organização
    const { count: totalLeadsAcumulados } = await admin
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);

    if (tab === "vendas") {
      // 1. Leads novos no período
      const [{ count: leadsNovosCount }, { count: prevLeadsNovosCount }] = await Promise.all([
        admin
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString()),
        admin
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
      ]);

      // 2. Vendas e Faturamento no período
      const salesQuery = admin
        .from("sales")
        .select("id, number, contact_id, status, total_cents, created_at, attendant_user_id, notes")
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .neq("status", "cancelled");

      const prevSalesQuery = admin
        .from("sales")
        .select("id, total_cents")
        .eq("organization_id", orgId)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString())
        .neq("status", "cancelled");

      const [{ data: salesData }, { data: prevSalesData }] = await Promise.all([
        salesQuery.order("created_at", { ascending: false }),
        prevSalesQuery,
      ]);

      const sales = salesData ?? [];
      const prevSales = prevSalesData ?? [];

      const vendasCount = sales.length;
      const prevVendasCount = prevSales.length;

      const faturamentoCents = sales.reduce((acc, s) => acc + (Number(s.total_cents) || 0), 0);
      const prevFaturamentoCents = prevSales.reduce((acc, s) => acc + (Number(s.total_cents) || 0), 0);

      const faturamentoReais = faturamentoCents / 100;
      const prevFaturamentoReais = prevFaturamentoCents / 100;

      const ticketMedio = vendasCount > 0 ? faturamentoReais / vendasCount : 0;
      const prevTicketMedio = prevVendasCount > 0 ? prevFaturamentoReais / prevVendasCount : 0;

      const leadsCount = leadsNovosCount ?? 0;
      const taxaConversao = leadsCount > 0 ? Number(((vendasCount / leadsCount) * 100).toFixed(2)) : 0;
      const prevTaxaConversao = (prevLeadsNovosCount ?? 0) > 0 ? Number(((prevVendasCount / (prevLeadsNovosCount ?? 1)) * 100).toFixed(2)) : 0;

      // Meta Ads Spend estimado ou lido da organização
      const gastoMeta = 0.00;
      const roas = gastoMeta > 0 ? Number((faturamentoReais / gastoMeta).toFixed(2)) : 0.00;
      const lucro = faturamentoReais - gastoMeta;

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
        // Dias
        const cur = new Date(start);
        while (cur <= end) {
          const key = `${String(cur.getDate()).padStart(2, "0")}/${String(cur.getMonth() + 1).padStart(2, "0")}`;
          vendasPorPeriodoMap.set(key, { label: key, valor: 0, qtd: 0 });
          cur.setDate(cur.getDate() + 1);
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

      if (contactIds.length > 0) {
        const { data: contactsData } = await admin
          .from("contacts")
          .select("id, name, phone_number")
          .in("id", contactIds);

        // Buscar conversas para vincular o channel_session_id
        const { data: convData } = await admin
          .from("conversations")
          .select("contact_id, channel_session_id")
          .in("contact_id", contactIds);

        const convByContact = new Map(convData?.map((c) => [c.contact_id, c.channel_session_id]) ?? []);

        for (const c of contactsData ?? []) {
          contactsMap.set(c.id, {
            name: c.name,
            phone: c.phone_number,
            channelSessionId: convByContact.get(c.id) ?? null,
          });
        }
      }

      // Preencher séries temporais e distribuições
      for (const s of sales) {
        const saleDate = new Date(s.created_at);
        const valor = (Number(s.total_cents) || 0) / 100;
        const hora = saleDate.getHours();

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
          pKey = `${String(saleDate.getDate()).padStart(2, "0")}/${String(saleDate.getMonth() + 1).padStart(2, "0")}`;
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
        const contato = s.contact_id ? contactsMap.get(s.contact_id) : null;
        const canalId = contato?.channelSessionId ?? "desconhecido";
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
        const canal = contato?.channelSessionId ? canaisMap.get(contato.channelSessionId) : null;
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
          .select("description, quantity, total_cents")
          .in("sale_id", saleIds);

        const prodMap = new Map<string, { name: string; valor: number; qtd: number }>();
        let totalItensValor = 0;

        for (const item of items ?? []) {
          const nome = item.description || "Produto Geral";
          const val = (Number(item.total_cents) || 0) / 100;
          const qtd = item.quantity || 1;
          totalItensValor += val;

          const p = prodMap.get(nome) ?? { name: nome, valor: 0, qtd: 0 };
          p.valor += val;
          p.qtd += qtd;
          prodMap.set(nome, p);
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
        kpis: {
          leadsNovos: { valor: leadsCount, delta: calcularDelta(leadsCount, prevLeadsNovosCount ?? 0) },
          faturamento: { valor: faturamentoReais, delta: calcularDelta(faturamentoReais, prevFaturamentoReais) },
          vendas: { valor: vendasCount, delta: calcularDelta(vendasCount, prevVendasCount) },
          roas: { valor: roas, delta: 0 },
          taxaConversao: { valor: taxaConversao, delta: calcularDelta(taxaConversao, prevTaxaConversao) },
          ticketMedio: { valor: ticketMedio, delta: calcularDelta(ticketMedio, prevTicketMedio) },
          lucro: { valor: lucro, delta: calcularDelta(faturamentoReais, prevFaturamentoReais) },
          gastoMeta: { valor: gastoMeta, delta: 0 },
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
      admin
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
      admin
        .from("contacts")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .gte("created_at", prevStart.toISOString())
        .lte("created_at", prevEnd.toISOString()),
    ]);

    // Conversas atendidas e finalizadas
    const [{ data: conversasData }, { data: atendentesData }, { data: stagesData }] = await Promise.all([
      admin
        .from("conversations")
        .select("id, contact_id, status, assigned_to_user_id, channel_session_id, first_outbound_at, created_at, closed_at")
        .eq("organization_id", orgId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
      admin
        .from("organization_members")
        .select("user_id, role")
        .eq("organization_id", orgId),
      admin
        .from("crm_stages")
        .select("id, name, color, position")
        .eq("organization_id", orgId)
        .order("position", { ascending: true }),
    ]);

    const conversas = conversasData ?? [];
    const leadsAtendidos = conversas.filter((c) => c.first_outbound_at !== null || c.assigned_to_user_id !== null).length;
    const leadsFinalizados = conversas.filter((c) => c.status === "archived" || c.closed_at !== null).length;

    // Calcular tempo médio de resposta (inbound -> first_outbound_at)
    let totalTempoSegundos = 0;
    let conversasComTempo = 0;
    for (const c of conversas) {
      if (c.created_at && c.first_outbound_at) {
        const diff = (new Date(c.first_outbound_at).getTime() - new Date(c.created_at).getTime()) / 1000;
        if (diff > 0 && diff < 86400 * 2) {
          totalTempoSegundos += diff;
          conversasComTempo += 1;
        }
      }
    }
    const tempoMedioMinutos = conversasComTempo > 0 ? Number((totalTempoSegundos / conversasComTempo / 60).toFixed(1)) : 0;

    // Distribuição horária de atendimentos
    const atendimentosPorHora = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, "0")}h`,
      count: 0,
    }));

    for (const c of conversas) {
      const h = new Date(c.created_at).getHours();
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
    const { data: crmLeadsData } = await admin
      .from("crm_leads")
      .select("id, stage_id, estimated_value_cents, contact_id")
      .eq("organization_id", orgId);

    const crmLeads = crmLeadsData ?? [];
    const conversoesPorColuna = (stagesData ?? []).map((st) => {
      const leadsDaColuna = crmLeads.filter((l) => l.stage_id === st.id);
      const valorCents = leadsDaColuna.reduce((acc, l) => acc + (Number(l.estimated_value_cents) || 0), 0);
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
