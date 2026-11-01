/**
 * O comprovante que acabou de chegar, no começo do turno: confere e, se for cobrança avulsa em ordem, grava o pagamento
 * com `metadata.extra`, o mesmo registro do aviso da Stripe. O turno lê esse registro logo em seguida e entrega.
 *
 * Nunca lança: falha aqui devolve o turno ao caminho de sempre, que é chamar uma pessoa para conferir.
 */
import type { Pool } from "pg";

import { chavePrincipal } from "@/lib/preco/chave-pix";
import { extrasDaConfig, slugDoExtra } from "@/lib/preco/extras";
import type { PricingConfig } from "@/lib/preco/tipos";

import {
  blocoDaConferencia,
  cobrancasEnviadas,
  conferirComprovante,
  textoDaMidia,
  type Conferencia,
  type FalaDaConversa,
} from "./comprovante-pix";

interface Log {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

/** A mídia mais nova que chegou depois da nossa última fala. */
function midiaDaVez(mensagens: readonly FalaDaConversa[]): string {
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction === "outbound") return "";
    if (m.type === "image" || m.type === "document") return textoDaMidia(m.body ?? "");
  }
  return "";
}

export async function comprovanteDoTurno(
  pool: Pick<Pool, "query">,
  e: {
    organizationId: string;
    contactId: string;
    conversationId: string;
    pricing: PricingConfig | null | undefined;
    mensagens: readonly FalaDaConversa[];
    agora: Date;
    log: Log;
  },
): Promise<string> {
  const chave = chavePrincipal(e.pricing);
  if (!chave || !e.pricing) return "";
  try {
    const conferencia = conferirComprovante({
      texto: midiaDaVez(e.mensagens),
      chave,
      cobrancas: cobrancasEnviadas(e.mensagens),
      extras: extrasDaConfig(e.pricing),
      valoresDoPrincipal: [e.pricing.list_price_cents, ...(e.pricing.steps ?? []).map((s) => s.price_cents)],
      agora: e.agora,
    });
    if (conferencia.tipo === "nenhum") return "";
    e.log.info("comprovante conferido", {
      conversation_id: e.conversationId,
      resultado: conferencia.tipo,
      ...(conferencia.tipo === "nao_confere" ? { motivo: conferencia.motivo } : {}),
    });
    if (conferencia.tipo !== "confere_extra") return blocoDaConferencia(conferencia, chave);
    return blocoDaConferencia(await gravarPagamento(pool, e, conferencia), chave);
  } catch (err) {
    e.log.warn("não consegui conferir o comprovante — segue pela equipe", {
      conversation_id: e.conversationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return "";
  }
}

async function gravarPagamento(
  pool: Pick<Pool, "query">,
  e: { organizationId: string; contactId: string; conversationId: string },
  c: Extract<Conferencia, { tipo: "confere_extra" }>,
): Promise<Conferencia> {
  const slug = slugDoExtra(c.extra.name);
  const referencia = `comprovante-${c.idDoPix}`;
  const { rows } = await pool.query<{ id: string }>(
    `insert into revenue_ledger (organization_id, event_type, amount_cents, currency, provider, external_event_id, occurred_at, contact_id, metadata)
     values ($1, 'charge', $2, 'BRL', 'manual', $3, $4, $5, $6::jsonb)
     on conflict do nothing
     returning id`,
    [
      e.organizationId,
      c.valorCents,
      referencia,
      c.pagoEm.toISOString(),
      e.contactId,
      JSON.stringify({
        produto: c.extra.name,
        metodo: "pix",
        conversa: e.conversationId,
        extra: slug,
        conferido_por: "comprovante",
        ...(c.quantidade > 1 ? { quantidade: c.quantidade } : {}),
      }),
    ],
  );
  if (rows.length === 0) {
    // Turno repetido do mesmo contato: já está gravado. De outro contato: o comprovante é reaproveitado.
    const { rows: dono } = await pool.query<{ contact_id: string | null }>(
      `select contact_id from revenue_ledger
        where organization_id = $1 and provider = 'manual' and event_type = 'charge' and external_event_id = $2 limit 1`,
      [e.organizationId, referencia],
    );
    if (dono[0]?.contact_id === e.contactId) return c;
    return { tipo: "nao_confere", motivo: "este comprovante já foi usado em outro pagamento" };
  }
  await pool.query(
    `update contacts set tags = array_append(tags, $3)
      where organization_id = $1 and id = $2 and not ($3 = any(coalesce(tags, '{}')))`,
    [e.organizationId, e.contactId, `extra:${slug}`],
  );
  return c;
}
