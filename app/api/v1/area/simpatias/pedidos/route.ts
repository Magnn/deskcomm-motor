/**
 * GET /api/v1/area/simpatias/pedidos (viewer+) — a fila do "o templo faz por mim": os pedidos PAGOS, os que faltam
 * fazer primeiro (do mais antigo ao mais novo) e os feitos nos últimos 30 dias. Pedido não pago não entra: é só
 * uma cobrança aberta.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { COLUNAS_DO_PEDIDO } from "@/lib/area-do-cliente/simpatias";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  contact_id: string;
  titulo: string;
  para_quem: string | null;
  valor_cents: number;
  pago_at: string;
  feita_at: string | null;
  nota: string | null;
  contacts: { name: string | null; display_name: string | null; phone_number: string | null } | null;
};

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("area_simpatias_pedidos")
    .select(`${COLUNAS_DO_PEDIDO}, contacts(name, display_name, phone_number)`)
    .eq("organization_id", authz.org.orgId)
    .not("pago_at", "is", null)
    .or(`feita_at.is.null,feita_at.gte.${desde}`)
    .order("pago_at", { ascending: true })
    .limit(200);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const linhas = (data ?? []) as unknown as Linha[];
  const pedidos = linhas.map(({ contacts, ...p }) => ({ ...p, nome: rotuloDoContato(contacts) }));
  // A fazer primeiro (mais antigo no topo); os feitos depois, do mais recente para trás.
  const aFazer = pedidos.filter((p) => !p.feita_at);
  const feitos = pedidos.filter((p) => p.feita_at).sort((a, b) => (b.feita_at ?? "").localeCompare(a.feita_at ?? ""));
  return ok({ a_fazer: aFazer, feitos }, { requestId });
}
