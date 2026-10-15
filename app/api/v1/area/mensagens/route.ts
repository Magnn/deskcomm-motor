/**
 * /api/v1/area/mensagens — o lado da EQUIPE do "Fale com a gente" da área.
 *
 * GET (viewer+)               — as conversas: quem escreveu, a última mensagem e
 *                               quantas estão sem resposta, as sem resposta primeiro.
 * GET ?contato=<id> (viewer+) — a conversa de uma pessoa.
 * POST (agent+)               — `{ contact_id, texto }`: responde. A resposta
 *                               aparece na área da pessoa, e as mensagens dela
 *                               passam a contar como lidas pela equipe.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resposta = z.strictObject({ contact_id: z.string().uuid(), texto: z.string().trim().min(1).max(2000) });

interface Linha {
  id: string;
  contact_id: string;
  autor: "cliente" | "equipe";
  texto: string;
  lida_pela_equipe_at: string | null;
  created_at: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const contato = req.nextUrl.searchParams.get("contato");

  if (contato) {
    if (!UUID.test(contato)) return fail("invalid_request", "contato inválido.", 400, { requestId });
    const { data, error } = await supabase
      .from("area_mensagens")
      .select("id, contact_id, autor, texto, lida_pela_equipe_at, created_at")
      .eq("organization_id", authz.org.orgId)
      .eq("contact_id", contato)
      .order("created_at", { ascending: true })
      .limit(300);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    return ok(data ?? [], { requestId });
  }

  const { data, error } = await supabase
    .from("area_mensagens")
    .select("id, contact_id, autor, texto, lida_pela_equipe_at, created_at")
    .eq("organization_id", authz.org.orgId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const linhas = (data ?? []) as Linha[];
  const porContato = new Map<string, { ultima: Linha; pendentes: number }>();
  for (const l of linhas) {
    const atual = porContato.get(l.contact_id) ?? { ultima: l, pendentes: 0 };
    if (l.autor === "cliente" && !l.lida_pela_equipe_at) atual.pendentes += 1;
    porContato.set(l.contact_id, atual);
  }
  const ids = [...porContato.keys()];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: contatos } = await supabase
      .from("contacts")
      .select("id, name, display_name, phone_number")
      .eq("organization_id", authz.org.orgId)
      .in("id", ids);
    for (const c of (contatos ?? []) as Array<{ id: string; name: string | null; display_name: string | null; phone_number: string | null }>) {
      nomes.set(c.id, rotuloDoContato(c));
    }
  }
  const conversas = ids
    .map((id) => {
      const c = porContato.get(id) as { ultima: Linha; pendentes: number };
      return {
        contact_id: id,
        nome: nomes.get(id) ?? "—",
        ultima: c.ultima.texto.slice(0, 140),
        ultima_de: c.ultima.autor,
        quando: c.ultima.created_at,
        pendentes: c.pendentes,
      };
    })
    .sort((a, b) => (b.pendentes > 0 ? 1 : 0) - (a.pendentes > 0 ? 1 : 0) || (a.quando < b.quando ? 1 : -1));
  return ok(conversas, { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const lido = resposta.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "Escreva a resposta.", 422, { requestId });

  // O contato é lido pelo cliente da SESSÃO: a RLS confirma que é desta organização.
  const supabase = await createClient();
  const { data: contato } = await supabase
    .from("contacts")
    .select("id")
    .eq("id", lido.data.contact_id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!contato) return fail("not_found", "Contato não encontrado.", 404, { requestId });

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("area_mensagens")
    .insert({
      organization_id: authz.org.orgId,
      contact_id: lido.data.contact_id,
      autor: "equipe",
      autor_user_id: authz.user.id,
      texto: lido.data.texto,
    })
    .select("id, contact_id, autor, texto, lida_pela_equipe_at, created_at")
    .single();
  if (error || !data) return fail("internal_error", error?.message ?? "não gravou", 500, { requestId });
  await admin
    .from("area_mensagens")
    .update({ lida_pela_equipe_at: agora })
    .eq("organization_id", authz.org.orgId)
    .eq("contact_id", lido.data.contact_id)
    .eq("autor", "cliente")
    .is("lida_pela_equipe_at", null);

  await audit({
    action: "area.mensagem_respondida",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact",
    resourceId: lido.data.contact_id,
    requestId,
  });
  return ok(data, { requestId, status: 201 });
}
