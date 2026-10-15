/**
 * POST /api/v1/area/convites/lote (manager+) — gera, de uma vez, o link de
 * acesso de cada pessoa que comprou nos últimos `dias` (padrão 120) e devolve
 * a lista (nome, telefone, link) para a equipe mandar pelo canal que tiver.
 *
 * Existe para o dia em que o canal cai: em 15/10/2026, 46 pagantes da semana
 * ficaram sem acesso ao que compraram, e gerar um link por vez é trabalho de
 * uma tarde. O link só aparece aqui, uma vez (o banco guarda o hash).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { origemPublica } from "@/lib/area-do-cliente/http";
import { gerarToken, hashDoToken } from "@/lib/area-do-cliente/token";
import { VALIDADE_DO_CONVITE_DIAS, caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpo = z.strictObject({ dias: z.number().int().min(1).max(365).default(120) });
const MAX_DE_UMA_VEZ = 500;

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const lido = corpo.safeParse((await req.json().catch(() => ({}))) ?? {});
  if (!lido.success) return fail("validation_failed", "Período inválido.", 422, { requestId });
  const org = authz.org.orgId;

  const supabase = await createClient();
  const desde = new Date(Date.now() - lido.data.dias * 86_400_000).toISOString();
  const { data: compras, error } = await supabase
    .from("revenue_ledger")
    .select("contact_id")
    .eq("organization_id", org)
    .eq("event_type", "charge")
    .not("contact_id", "is", null)
    .gte("occurred_at", desde)
    .limit(5000);
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const ids = [...new Set(((compras ?? []) as Array<{ contact_id: string }>).map((c) => c.contact_id))].slice(0, MAX_DE_UMA_VEZ);
  if (ids.length === 0) return ok({ links: [] }, { requestId });

  const [{ data: orgRow }, { data: contatos }] = await Promise.all([
    supabase.from("organizations").select("slug").eq("id", org).maybeSingle(),
    supabase.from("contacts").select("id, name, display_name, phone_number").eq("organization_id", org).in("id", ids),
  ]);
  const slug = (orgRow as { slug: string } | null)?.slug;
  if (!slug) return fail("not_found", "Organização não encontrada.", 404, { requestId });

  const base = `${origemPublica(req)}${caminhoDaArea(slug)}/entrar/`;
  const expira = new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 86_400_000).toISOString();
  const admin = createAdminClient();
  const linhas = ((contatos ?? []) as Array<{ id: string; name: string | null; display_name: string | null; phone_number: string | null }>).map(
    (c) => ({ contato: c, token: gerarToken() }),
  );
  const { error: erroDoLote } = await admin.from("area_convites").insert(
    linhas.map((l) => ({
      organization_id: org,
      contact_id: l.contato.id,
      token_hash: hashDoToken(l.token),
      criado_por: authz.user.id,
      expires_at: expira,
    })),
  );
  if (erroDoLote) return fail("internal_error", erroDoLote.message, 500, { requestId });
  for (const l of linhas) {
    await registrarEvento(admin, { organizationId: org, contactId: l.contato.id, tipo: "convite_criado", props: { lote: true } });
  }
  await audit({
    action: "area.convite_criado",
    organizationId: org,
    actorUserId: authz.user.id,
    resourceType: "organization",
    // A organização já vai em organizationId; o lote não tem uma linha própria para apontar.
    resourceId: null,
    requestId,
    metadata: { lote: true, quantidade: linhas.length, dias: lido.data.dias },
  });
  return ok(
    {
      expira,
      links: linhas.map((l) => ({
        contact_id: l.contato.id,
        nome: rotuloDoContato(l.contato),
        telefone: l.contato.phone_number,
        link: `${base}${l.token}`,
      })),
    },
    { requestId, status: 201 },
  );
}
