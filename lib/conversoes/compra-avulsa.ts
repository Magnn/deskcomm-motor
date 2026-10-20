/**
 * Reportar a COMPRA AVULSA à plataforma que trouxe o lead.
 *
 * ─── O que se via em produção ────────────────────────────────────────────────────────────────────────────
 * Medido em 13/10/2026: a venda do produto principal ia para a plataforma de anúncio (o negócio vira "ganho" e
 * `envio.handler.ts` escuta), mas a cobrança avulsa — um extra pago na conversa — só entrava no livro de receita.
 * Ela não fecha negócio, então nada a reportava: 5 vendas vindas de anúncio em dois dias, nenhuma na plataforma.
 *
 * ─── A régua ────────────────────────────────────────────────────────────────────────────────────────────
 * Quem registra a receita avulsa chama `reportarCompraAvulsa` com a referência da cobrança. O evento é uma compra
 * com o valor e a hora da cobrança, e o id do evento é a referência: reentrega do provedor não conta duas vezes
 * (o livro de envios tem uma linha por evento, e a plataforma deduplica pelo mesmo id).
 *
 * Mesma regra de `envio.handler.ts` para o que NÃO vai: sem anúncio de origem não há o que reportar, e nada é
 * gravado. Esta função nunca lança — receita registrada não pode falhar por causa da plataforma de anúncio.
 */
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { transporteDe } from "@/lib/plataformas-de-anuncio/registry";
import type { ConversaoOffline, NomeDoEvento } from "@/lib/plataformas-de-anuncio/types";
import type { createAdminClient } from "@/lib/supabase/admin";

import { destinoDaConversaoMeta } from "./destino-de-mensageria";
import { lerAtribuicao } from "./leitura-da-atribuicao";
import { jaFoiEnviada, registraEnvio } from "./registro-de-envio";

const EVENTO: NomeDoEvento = "Purchase";

export interface CompraAvulsa {
  organizationId: string;
  contactId: string;
  /** A referência da cobrança no provedor: é ela que torna o evento único. */
  referencia: string;
  valorCentavos: number;
  moeda: string;
  ocorridaEm: Date;
  produto: string | null;
}

export type ResultadoDaCompraAvulsa = { status: "sent" } | { status: "skipped" | "error"; motivo: string };

/** O id do evento de uma compra avulsa. Exportado para o teste e para quem reenvia à mão. */
export const idDoEventoDaCompraAvulsa = (referencia: string): string => `avulsa:${referencia}:${EVENTO}`;

export async function reportarCompraAvulsa(
  admin: ReturnType<typeof createAdminClient>,
  compra: CompraAvulsa,
): Promise<ResultadoDaCompraAvulsa> {
  try {
    if (compra.valorCentavos <= 0) return { status: "skipped", motivo: "sem_valor" };
    const leitura = await lerAtribuicao(admin, compra.organizationId, compra.contactId);
    if (!leitura.temAtribuicao) return { status: "skipped", motivo: leitura.motivo };
    const { plataforma, cliqueDeOrigem, telefone } = leitura.atribuicao;

    // ⚠️ Filtro de organização: o client é service-role. O livro de envios é por negócio; a compra avulsa fica no
    // negócio mais recente do contato.
    const { data } = await admin
      .from("crm_leads")
      .select("id")
      .eq("organization_id", compra.organizationId)
      .eq("contact_id", compra.contactId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const leadId = (data as { id: string } | null)?.id ?? null;
    if (leadId === null) return { status: "skipped", motivo: "sem_negocio" };

    const eventoId = idDoEventoDaCompraAvulsa(compra.referencia);
    if (await jaFoiEnviada(admin, compra.organizationId, leadId, EVENTO, eventoId)) return { status: "skipped", motivo: "ja_enviada" };

    const registra = (status: "sent" | "skipped" | "error", motivo: string | null, detalhe?: string | null) =>
      registraEnvio(admin, {
        organizationId: compra.organizationId,
        leadId,
        plataforma,
        evento: EVENTO,
        status,
        motivo,
        eventoId,
        valorCentavos: compra.valorCentavos,
        moeda: compra.moeda,
        detalhe: detalhe ?? (compra.produto === null ? null : `compra avulsa: ${compra.produto}`),
      });

    const transporte = transporteDe(plataforma);
    if (!transporte) {
      await registra("skipped", "plataforma_sem_transporte");
      return { status: "skipped", motivo: "plataforma_sem_transporte" };
    }
    const credencial = await lerCredencial(admin, compra.organizationId, plataforma);
    if (!credencial.ok) {
      await registra("skipped", credencial.motivo);
      return { status: "skipped", motivo: credencial.motivo };
    }
    let contaDoWhatsApp: string | null = null;
    let pixelDoSite = false;
  let fbc: string | null = null;
  let fbp: string | null = null;
    let credencialDoEnvio = credencial.credencial;
    if (plataforma === "meta_ads") {
      // Fora de número oficial, a venda vai para o pixel do site (`destinoDaConversaoMeta`).
      const destino = await destinoDaConversaoMeta(admin, compra.organizationId, compra.contactId, credencial.credencial);
      if (!destino.ok) {
        await registra("skipped", destino.motivo, destino.detalhe);
        return { status: "skipped", motivo: destino.motivo };
      }
      contaDoWhatsApp = destino.contaDoWhatsApp;
      pixelDoSite = destino.pixelDoSite;
      fbc = destino.fbc ?? null;
      fbp = destino.fbp ?? null;
      credencialDoEnvio = destino.credencial;
    }

    const conversao: ConversaoOffline = {
      organizationId: compra.organizationId,
      leadId,
      evento: EVENTO,
      eventoId,
      ocorridoEm: compra.ocorridaEm,
      cliqueDeOrigem,
      telefone,
      contaDoWhatsApp,
      pixelDoSite,
      fbc,
      fbp,
      moeda: compra.moeda,
      valorCentavos: compra.valorCentavos,
    };
    const resultado = await transporte.enviar(credencialDoEnvio, conversao);
    if (resultado.tipo === "ok") {
      await registra("sent", null);
      return { status: "sent" };
    }
    // Aqui não há fila para tentar de novo: a instabilidade também vai para o livro, para aparecer na tela.
    const motivo = resultado.tipo === "transitorio" ? "plataforma_instavel" : "recusado_pela_plataforma";
    await registra("error", motivo, resultado.detalhe);
    return { status: "error", motivo };
  } catch (err) {
    return { status: "error", motivo: err instanceof Error ? err.message.slice(0, 200) : "falha_inesperada" };
  }
}
