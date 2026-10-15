/**
 * GET /api/v1/area/compradores?dias=120 (viewer+) — quem comprou no período e
 * como está o acesso de cada um à área: nunca convidado, convidado e não
 * entrou, ou entrou (e quando foi a última vez).
 *
 * É a lista de onde a equipe gera os links. As compras vêm do ledger de
 * receita; nada aqui é cadastro novo.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGINA = 1000;

interface Comprador {
  contact_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  compras: number;
  total_cents: number;
  ultima_compra: string;
  convidado_em: string | null;
  ultimo_acesso: string | null;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const dias = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 120));
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const org = authz.org.orgId;
  const supabase = await createClient();

  const lancamentos: Array<{ contact_id: string; amount_cents: number; occurred_at: string }> = [];
  for (let de = 0; de < 20 * PAGINA; de += PAGINA) {
    const { data, error } = await supabase
      .from("revenue_ledger")
      .select("contact_id, amount_cents, occurred_at")
      .eq("organization_id", org)
      .eq("event_type", "charge")
      .not("contact_id", "is", null)
      .gte("occurred_at", desde)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    lancamentos.push(...((data ?? []) as typeof lancamentos));
    if ((data ?? []).length < PAGINA) break;
  }

  const porContato = new Map<string, { compras: number; total: number; ultima: string }>();
  for (const l of lancamentos) {
    const atual = porContato.get(l.contact_id) ?? { compras: 0, total: 0, ultima: l.occurred_at };
    atual.compras += 1;
    atual.total += l.amount_cents;
    if (l.occurred_at > atual.ultima) atual.ultima = l.occurred_at;
    porContato.set(l.contact_id, atual);
  }
  const ids = [...porContato.keys()];
  if (ids.length === 0) return ok([], { requestId });

  const contatos = new Map<string, { nome: string; telefone: string | null; email: string | null }>();
  const convites = new Map<string, string>();
  const acessos = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [c, v, s] = await Promise.all([
      supabase.from("contacts").select("id, name, display_name, phone_number, email").eq("organization_id", org).in("id", lote),
      supabase.from("area_convites").select("contact_id, created_at").eq("organization_id", org).in("contact_id", lote),
      supabase.from("area_sessoes").select("contact_id, last_seen_at").eq("organization_id", org).in("contact_id", lote),
    ]);
    for (const e of [c.error, v.error, s.error]) if (e) return fail("internal_error", e.message, 500, { requestId });
    for (const r of (c.data ?? []) as Array<{ id: string; name: string | null; display_name: string | null; phone_number: string | null; email: string | null }>) {
      contatos.set(r.id, { nome: r.display_name || r.name || "(sem nome)", telefone: r.phone_number, email: r.email });
    }
    for (const r of (v.data ?? []) as Array<{ contact_id: string; created_at: string }>) {
      if (!convites.has(r.contact_id) || r.created_at > (convites.get(r.contact_id) as string)) convites.set(r.contact_id, r.created_at);
    }
    for (const r of (s.data ?? []) as Array<{ contact_id: string; last_seen_at: string }>) {
      if (!acessos.has(r.contact_id) || r.last_seen_at > (acessos.get(r.contact_id) as string)) acessos.set(r.contact_id, r.last_seen_at);
    }
  }

  const lista: Comprador[] = ids
    .map((id) => {
      const p = porContato.get(id) as { compras: number; total: number; ultima: string };
      const c = contatos.get(id);
      return {
        contact_id: id,
        nome: c?.nome ?? "(sem nome)",
        telefone: c?.telefone ?? null,
        email: c?.email ?? null,
        compras: p.compras,
        total_cents: p.total,
        ultima_compra: p.ultima,
        convidado_em: convites.get(id) ?? null,
        ultimo_acesso: acessos.get(id) ?? null,
      };
    })
    .sort((a, b) => (a.ultima_compra < b.ultima_compra ? 1 : -1));
  return ok(lista, { requestId });
}
