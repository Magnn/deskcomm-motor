/**
 * POST /api/v1/area/convites (agent+) — gera o link de acesso de UM contato à
 * área do cliente. O link aparece UMA vez (o banco guarda só o hash); quem
 * perder pede outro, e o anterior continua valendo até vencer.
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
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpo = z.strictObject({ contact_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "contact_id inválido.", 422, { requestId });

  // O contato é lido pelo cliente da SESSÃO: a RLS confirma que é desta organização.
  const supabase = await createClient();
  const [{ data: contato }, { data: org }] = await Promise.all([
    supabase.from("contacts").select("id").eq("id", lido.data.contact_id).eq("organization_id", authz.org.orgId).maybeSingle(),
    supabase.from("organizations").select("slug, settings").eq("id", authz.org.orgId).maybeSingle(),
  ]);
  if (!contato) return fail("not_found", "Contato não encontrado.", 404, { requestId });
  const slug = (org as { slug: string } | null)?.slug;
  if (!slug) return fail("not_found", "Organização não encontrada.", 404, { requestId });

  const token = gerarToken();
  const expira = new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 86_400_000);
  const admin = createAdminClient();
  const { data: convite, error } = await admin
    .from("area_convites")
    .insert({
      organization_id: authz.org.orgId,
      contact_id: lido.data.contact_id,
      token_hash: hashDoToken(token),
      criado_por: authz.user.id,
      expires_at: expira.toISOString(),
    })
    .select("id")
    .single();
  if (error || !convite) return fail("internal_error", error?.message ?? "convite não criado", 500, { requestId });

  await registrarEvento(admin, { organizationId: authz.org.orgId, contactId: lido.data.contact_id, tipo: "convite_criado" });
  await audit({
    action: "area.convite_criado",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "contact",
    resourceId: lido.data.contact_id,
    requestId,
  });
  return ok(
    { link: `${origemPublica(req)}${caminhoDaArea(slug)}/entrar/${token}`, expira: expira.toISOString() },
    { requestId, status: 201 },
  );
}
