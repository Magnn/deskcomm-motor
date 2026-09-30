/**
 * O nó "Editar Pixel" do fluxo: reportar um evento à Meta a partir do ponto do funil
 * em que o lead está.
 *
 * Usa a MESMA infraestrutura da venda fechada (`envio.handler.ts`): a credencial da
 * organização (`ad_platform_connections`), o transporte da plataforma e o livro-razão
 * (`ad_conversion_dispatches`) — então o que este nó faz aparece na tela de
 * Conversões, com o motivo de cada evento que não saiu.
 *
 * ─── O que o nó NÃO consegue, dito aqui para ninguém descobrir em produção ───
 *
 * O envio é de MENSAGERIA (`business_messaging`): o que liga o evento ao anúncio é o
 * clique que abriu a conversa. Lead sem anúncio de origem não tem o que reportar, e
 * isso sai como `sem_atribuicao` no livro-razão, nunca como erro e nunca como sucesso.
 *
 * ─── Uma vez por lead e por evento ──────────────────────────────────────────
 *
 * O livro-razão é único por (organização, lead, evento) — a mesma trava que impede a
 * venda de ser contada duas vezes. Um `repeat` que volta a este nó não reenvia: o
 * segundo `Lead` do mesmo lead é ruído que o otimizador leria como outra pessoa.
 * Como o `Purchase` compartilha a chave com o fechamento do negócio, o que o nó
 * enviar primeiro faz o handler de `lead.won` ver "já enviada" — sem contar em dobro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { transporteDe } from "@/lib/plataformas-de-anuncio/registry";
import { eventoDoNo } from "@/lib/plataformas-de-anuncio/evento-do-no";
import type { ConversaoOffline } from "@/lib/plataformas-de-anuncio/types";

import { lerAtribuicao } from "./leitura-da-atribuicao";
import { jaFoiEnviada, registraEnvio, type StatusDeEnvio } from "./registro-de-envio";

export interface PedidoDePixel {
  organizationId: string;
  contactId: string;
  enrollmentId: string;
  nodeId: string;
  /** Do nó: `pixel_id`, `event_type` ("Compra" ou o nome do evento), `item_value`, `currency`. */
  config: { pixel_id: string; event_type: string; item_value: string; currency?: string };
}

export interface DesfechoDoPixel {
  status: StatusDeEnvio;
  /** Slug estável — o mesmo vocabulário do livro-razão. */
  motivo: string | null;
}

/**
 * "97,00", "1.297,50", "R$ 97", "97.5" → centavos. Vazio, zero, negativo ou texto que não é
 * número (uma variável que ninguém resolveu) → `null`: valor que não dá para afirmar não é zero.
 */
export function valorEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "");
  if (limpo === "" || limpo.startsWith("-")) return null;
  const decimal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(decimal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export async function reportarEventoDoPixel(
  admin: SupabaseClient,
  pedido: PedidoDePixel,
): Promise<DesfechoDoPixel> {
  const { organizationId: org, contactId } = pedido;
  const evento = eventoDoNo(pedido.config.event_type);
  if (!evento) return { status: "skipped", motivo: "evento_desconhecido" };

  // ⚠️ Filtro de organização junto do contato: o client é service-role e ignora RLS.
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id, value_cents, currency")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const linhaDoLead = lead as { id: string; value_cents: number | null; currency: string | null } | null;
  // O livro-razão é por lead. Sem lead não há onde registrar — e o que não fica registrado não se audita.
  if (!linhaDoLead) return { status: "skipped", motivo: "sem_lead" };

  if (await jaFoiEnviada(admin, org, linhaDoLead.id, evento)) {
    return { status: "skipped", motivo: "ja_enviada" };
  }

  const leitura = await lerAtribuicao(admin, org, contactId);

  const registra = async (status: StatusDeEnvio, motivo: string | null, detalhe?: string, valor?: number | null, moeda?: string) => {
    await registraEnvio(admin, {
      organizationId: org,
      leadId: linhaDoLead.id,
      // Sem atribuição não há plataforma; o nó é da Meta, e é nela que o desfecho fica.
      plataforma: leitura.temAtribuicao ? leitura.atribuicao.plataforma : "meta_ads",
      evento,
      status,
      motivo,
      eventoId: `${linhaDoLead.id}:${evento}`,
      valorCentavos: valor ?? null,
      moeda: moeda ?? null,
      detalhe: detalhe ?? null,
    });
    return { status, motivo } satisfies DesfechoDoPixel;
  };

  if (!leitura.temAtribuicao) return registra("skipped", leitura.motivo);
  if (leitura.atribuicao.plataforma !== "meta_ads") {
    // Um lead de Google Ads não é reportado por um nó que se chama Pixel do Facebook.
    return registra("skipped", "plataforma_diferente");
  }

  const moeda = (pedido.config.currency || linhaDoLead.currency || "BRL").toUpperCase();
  // O valor do nó manda; sem ele, o do negócio. `Purchase` sem valor é recusado pela plataforma —
  // e `0` seria aceito e ensinaria ao otimizador que a venda não vale nada.
  const valor = valorEmCentavos(pedido.config.item_value) ?? (linhaDoLead.value_cents && linhaDoLead.value_cents > 0 ? linhaDoLead.value_cents : null);
  if (evento === "Purchase" && valor === null) return registra("skipped", "sem_valor");

  const transporte = transporteDe("meta_ads");
  if (!transporte) return registra("skipped", "plataforma_sem_transporte");

  const credencial = await lerCredencial(admin, org, "meta_ads");
  if (!credencial.ok) return registra("skipped", credencial.motivo);
  // O pixel do nó, quando informado, vale mais que o conjunto de dados da conexão: é o que o dono do funil escolheu.
  const pixel = pedido.config.pixel_id.trim();
  const credencialDoNo = pixel ? { ...credencial.credencial, datasetId: pixel } : credencial.credencial;

  const conversao: ConversaoOffline = {
    organizationId: org,
    leadId: linhaDoLead.id,
    evento,
    eventoId: `${linhaDoLead.id}:${evento}`,
    ocorridoEm: new Date(),
    cliqueDeOrigem: leitura.atribuicao.cliqueDeOrigem,
    telefone: leitura.atribuicao.telefone,
    moeda,
    valorCentavos: valor,
  };

  const resultado = await transporte.enviar(credencialDoNo, conversao);
  if (resultado.tipo === "ok") return registra("sent", null, resultado.detalhe, valor, moeda);
  if (resultado.tipo === "transitorio") {
    // Nada no livro-razão: ainda pode se resolver sozinho, e o passo do fluxo já seguiu. Fica o log.
    logger.warn("[conversoes.pixel] envio adiado pela plataforma; o fluxo já avançou", {
      enrollmentId: pedido.enrollmentId,
      nodeId: pedido.nodeId,
      detalhe: resultado.detalhe,
    });
    return { status: "skipped", motivo: "transitorio" };
  }
  return registra("error", "recusado_pela_plataforma", resultado.detalhe, valor, moeda);
}
