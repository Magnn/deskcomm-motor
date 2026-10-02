import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api/wrappers";

const novaVendaSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  productName: z.string().min(1, "Nome do produto é obrigatório"),
  amountCents: z.number().int().positive("Valor deve ser maior que zero"),
  notes: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  try {
    const user = await requireAuth();
    const org = await resolveActiveOrg(user);
    if (!org) return fail("unauthorized", "Organização ativa não encontrada", 401);

    const body = await req.json();
    const parsed = novaVendaSchema.safeParse(body);
    if (!parsed.success) {
      return fail("validation_error", parsed.error.issues[0]?.message || "Dados inválidos", 400);
    }

    const admin = createAdminClient();

    // Obter próximo número sequencial de venda da organização
    const { data: ultVenda } = await admin
      .from("sales")
      .select("number")
      .eq("organization_id", org.orgId)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const proximoNumero = (ultVenda?.number ? Number(ultVenda.number) : 0) + 1;

    // Inserir registro na tabela sales
    const { data: novaVenda, error: vendaErr } = await admin
      .from("sales")
      .insert({
        organization_id: org.orgId,
        number: proximoNumero,
        contact_id: parsed.data.contactId ?? null,
        status: "finalized",
        total_cents: parsed.data.amountCents,
        currency: "BRL",
        notes: parsed.data.productName,
        created_by_user_id: user.id,
        finalized_at: new Date().toISOString(),
      })
      .select("id, number, total_cents, created_at")
      .single();

    if (vendaErr) throw new Error(vendaErr.message);

    // Inserir item da venda
    const { error: itemErr } = await admin.from("sale_items").insert({
      organization_id: org.orgId,
      sale_id: novaVenda.id,
      description: parsed.data.productName,
      quantity: 1,
      unit_price_cents: parsed.data.amountCents,
      total_cents: parsed.data.amountCents,
      commission_percent: 0,
    });

    if (itemErr) {
      // Best-effort: se falhar item não aborta venda
      console.error("[sales.post] erro ao salvar sale_item:", itemErr);
    }

    return ok({
      sale: novaVenda,
      message: "Venda registrada com sucesso",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro ao registrar venda";
    return fail("internal_error", msg, 500);
  }
}
