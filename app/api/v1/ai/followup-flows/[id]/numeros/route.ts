/**
 * GET /api/v1/ai/followup-flows/:id/numeros — os números da organização e QUEM
 * atende cada um, do ponto de vista deste fluxo.
 *
 * É a leitura que o painel do gatilho usa para mostrar (e deixar trocar) o
 * vínculo número ↔ fluxo. O dado mora no número (`channel_sessions.metadata`,
 * ver `lib/channels/channel-flow-config.ts`); a escrita é o PATCH de
 * `/api/v1/channel-sessions/:id/flow`, o mesmo da tela de Conexões.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { PROVIDERS_DE_MENSAGEM } from "@/lib/channels/capabilities";
import { lerConfigDeFluxoDoCanal, quemAtendeONumero } from "@/lib/channels/channel-flow-config";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

export type DonoDoNumero = "este_fluxo" | "outro_fluxo" | "agente" | "humano";

export interface NumeroDoFluxo {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  waha_session_name: string | null;
  dono: DonoDoNumero;
  /** Nome do outro fluxo, quando `dono === "outro_fluxo"` (null se ele foi apagado). */
  outro_fluxo: string | null;
}

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("viewer", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const admin = createAdminClient();
  const { data: fluxo, error: fluxoErr } = await admin
    .from("followup_flow_pointers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (fluxoErr) return fail("internal_error", fluxoErr.message, 500, { requestId });
  if (!fluxo) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const { data: canais, error: canaisErr } = await admin
    .from("channel_sessions")
    .select("id, display_name, phone_number, waha_session_name, metadata")
    .eq("organization_id", orgId)
    .in("provider", [...PROVIDERS_DE_MENSAGEM])
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (canaisErr) return fail("internal_error", canaisErr.message, 500, { requestId });

  const donos = (canais ?? []).map((c) => ({ canal: c, dono: quemAtendeONumero(lerConfigDeFluxoDoCanal(c.metadata)) }));

  const outros = [
    ...new Set(donos.flatMap((d) => (d.dono.quem === "fluxo" && d.dono.flowId !== id ? [d.dono.flowId] : []))),
  ];
  const nomes = new Map<string, string>();
  if (outros.length > 0) {
    const { data: fluxos, error: nomesErr } = await admin
      .from("followup_flow_pointers")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("id", outros);
    if (nomesErr) return fail("internal_error", nomesErr.message, 500, { requestId });
    for (const f of fluxos ?? []) nomes.set(f.id, f.name);
  }

  const numeros: NumeroDoFluxo[] = donos.map(({ canal, dono }) => ({
    id: canal.id,
    display_name: canal.display_name,
    phone_number: canal.phone_number,
    waha_session_name: canal.waha_session_name,
    dono:
      dono.quem === "fluxo" ? (dono.flowId === id ? "este_fluxo" : "outro_fluxo") : dono.quem === "agente" ? "agente" : "humano",
    outro_fluxo: dono.quem === "fluxo" && dono.flowId !== id ? (nomes.get(dono.flowId) ?? null) : null,
  }));

  return ok(numeros, { requestId });
}
