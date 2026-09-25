/**
 * O LEDGER DE RECEITA — grava o FATO financeiro do webhook da Cakto em
 * `public.revenue_ledger` (migration 0416), sem decidir nada.
 *
 * ─── O que é, e o que NÃO é ──────────────────────────────────────────────
 *
 * Um registro append-only, deduplicado, do que um gateway de pagamento
 * externo disse que aconteceu com o dinheiro: compra aprovada, reembolso,
 * chargeback. Serve reconciliação e relatório. NÃO decide se o entregável
 * sai, não escolhe fluxo, não muda tag — isso continua inteiramente em
 * `aplicarEventoDaCakto` (`lib/pagamentos/compra-cakto.ts`), que já fazia
 * esse trabalho e não muda aqui. Se algum dia este arquivo crescer uma regra
 * do tipo "se N chargebacks então X", isso é escopo do NEXUS Decision Engine
 * — decisão já tomada com o dono do produto de NÃO religar `decide()`.
 *
 * ─── Por que só três eventos mapeiam ────────────────────────────────────
 *
 * `aplicarEventoDaCakto` só trata `purchase_approved`, `refund` e
 * `chargeback` (os demais — `pix_gerado`, `boleto_gerado`, `picpay_gerado`,
 * `subscription_canceled`, `subscription_renewed`, `checkout_abandonment` —
 * caem em `resultado: "ignorada"`). Nenhum dos outros é dinheiro se
 * movendo (exceto `subscription_renewed`, que É uma cobrança real — mas
 * ampliar o tratamento de assinatura é mudança de comportamento fora do
 * escopo desta entrega, registrado no MANIFEST da 0416).
 *
 * ─── Dedupe ───────────────────────────────────────────────────────────────
 *
 * A chave é `(organization_id, provider, event_type, external_event_id)` —
 * mesma doutrina de `unique (organization_id, external_id)` já usada no
 * resto do repo. Reentrega do MESMO aviso (mesmo tipo, mesmo id) colide no
 * banco (`23505`) e este módulo devolve a linha JÁ existente, sem duplicar o
 * fato — não é fallback silencioso, é o caminho normal de todo retry de
 * webhook.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import type { CompraDaCakto, EventoDaCakto } from "@/lib/webhooks/cakto";

export type TipoDoEventoDeReceita = "charge" | "refund" | "chargeback";

const MAPA_EVENTO_PARA_LEDGER: Partial<Record<EventoDaCakto, TipoDoEventoDeReceita>> = {
  purchase_approved: "charge",
  refund: "refund",
  chargeback: "chargeback",
};

/** `null` = este evento da Cakto não é (ainda) um fato de dinheiro que o ledger registra. */
export function tipoDoEventoDeReceita(evento: EventoDaCakto): TipoDoEventoDeReceita | null {
  return MAPA_EVENTO_PARA_LEDGER[evento] ?? null;
}

export interface ResultadoDoRegistroDeReceita {
  id: string;
  /** `false` = a linha já existia (reentrega do mesmo aviso); nada novo foi gravado. */
  novo: boolean;
}

export interface DepsDoLedgerDeReceita {
  /**
   * Grava (ou reconhece a duplicata de) um fato de receita. `null` quando o
   * evento da Cakto não mapeia para um `event_type` do ledger, ou quando o
   * aviso não trouxe valor (`amount` ausente) — a compra continua sendo
   * processada por `aplicarEventoDaCakto` de qualquer forma; o ledger é
   * observação, nunca porta de entrada.
   */
  registrarReceita(
    compra: CompraDaCakto,
    contatoId: string | null,
  ): Promise<ResultadoDoRegistroDeReceita | null>;
}

/** As pontas de verdade, ligadas ao Supabase (admin client — a org SEMPRE vem da fonte do webhook, nunca do body). */
export function depsDoLedgerReais(
  admin: SupabaseClient,
  organizationId: string,
  webhookSourceId: string,
): DepsDoLedgerDeReceita {
  return {
    async registrarReceita(compra, contatoId) {
      const tipo = tipoDoEventoDeReceita(compra.evento);
      if (tipo === null) return null;
      if (compra.valorCentavos === null || compra.valorCentavos <= 0) return null;

      const linha = {
        organization_id: organizationId,
        event_type: tipo,
        amount_cents: compra.valorCentavos,
        currency: "BRL",
        provider: "cakto",
        webhook_source_id: webhookSourceId,
        external_event_id: compra.pedidoId,
        external_ref_id: compra.refId,
        // `pagoEm` pode faltar em refund/chargeback — a coluna cai no default
        // (now()) nesse caso, nunca num valor inventado.
        ...(compra.pagoEm ? { occurred_at: compra.pagoEm } : {}),
        contact_id: contatoId,
        metadata: {
          produto: compra.produtoNome,
          oferta: compra.ofertaNome,
          cupom: compra.cupom,
          metodo: compra.metodo,
          status_cakto: compra.status,
        },
      };

      const { data, error } = await admin
        .from("revenue_ledger")
        .insert(linha)
        .select("id")
        .single();

      if (!error) return { id: (data as { id: string }).id, novo: true };

      if (error.code === "23505") {
        // A MESMA reentrega do MESMO fato: acha a linha existente pela chave
        // de dedupe e devolve, sem gravar de novo.
        const { data: existente } = await admin
          .from("revenue_ledger")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("provider", "cakto")
          .eq("event_type", tipo)
          .eq("external_event_id", compra.pedidoId)
          .maybeSingle();
        if (existente) return { id: (existente as { id: string }).id, novo: false };
      }

      // Erro real (não é dedupe): NUNCA derruba a entrega, que já aconteceu
      // ou vai acontecer por `aplicarEventoDaCakto` — o ledger é observação,
      // nunca porta de entrada. Fica registrado no log estruturado; quem
      // reconciliar percebe pela ausência da linha, não por um 500 na Cakto.
      logger.error("[pagamentos.ledger] registrarReceita falhou", {
        organizationId,
        webhookSourceId,
        eventType: tipo,
        externalEventId: compra.pedidoId,
        errorCode: error.code,
        errorMessage: error.message,
      });
      return null;
    },
  };
}
