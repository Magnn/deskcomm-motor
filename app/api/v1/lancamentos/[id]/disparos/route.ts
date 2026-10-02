/**
 * /api/v1/lancamentos/[id]/disparos
 *
 *   POST   → agenda um disparo para todos os grupos do lançamento. Sem
 *            `scheduled_at` sai na próxima rodada do relógio (até um minuto).
 *   DELETE → `?disparo=<id>` cancela um disparo que ainda NÃO começou. Depois de
 *            começar não há cancelar: parte dos grupos já recebeu.
 *
 * A mídia de um item tem de ter sido subida para ESTE lançamento
 * (`…/midia`): o caminho é conferido aqui, senão um disparo poderia apontar para
 * o arquivo de outra empresa.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { prefixoDaMidiaDoLancamento } from "@/lib/lancamentos/midia";
import { criarDisparoSchema } from "@/lib/lancamentos/schemas";
import { lerLancamento } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

/** Agendar para muito longe é quase sempre erro de data: o lançamento dura dias, não anos. */
const AGENDAMENTO_MAXIMO_MS = 90 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  const parsed = criarDisparoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira o conteúdo do disparo: ele precisa de ao menos uma mensagem."), 422, { requestId });
  }

  const agora = Date.now();
  const quando = parsed.data.scheduled_at ? Date.parse(parsed.data.scheduled_at) : agora;
  if (quando - agora > AGENDAMENTO_MAXIMO_MS) {
    return fail("validation_failed", t("A data do disparo está longe demais. Confira o dia e o ano."), 422, { requestId });
  }

  const admin = createAdminClient();
  try {
    const lancamento = await lerLancamento(admin, auth.org.orgId, id);
    if (!lancamento || lancamento.status === "archived") return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

    const prefixo = prefixoDaMidiaDoLancamento(auth.org.orgId, id);
    const midiaDeFora = parsed.data.items.some(
      (i) => "storage_path" in i && (!i.storage_path.startsWith(prefixo) || i.storage_path.includes("..")),
    );
    if (midiaDeFora) return fail("validation_failed", t("Um dos arquivos do disparo não pertence a este lançamento. Envie o arquivo de novo."), 422, { requestId });

    const { data, error } = await admin
      .from("group_launch_broadcasts")
      .insert({
        organization_id: auth.org.orgId,
        launch_id: id,
        items: parsed.data.items,
        // Passado vira "agora": a rodada pega o que venceu, e gravar a hora pedida
        // deixaria a tela dizendo que o disparo saiu ontem.
        scheduled_at: new Date(Math.max(quando, agora)).toISOString(),
        created_by: auth.user.id,
      })
      .select("id, scheduled_at, status")
      .single();
    if (error) throw new Error(error.message);

    void audit({
      action: "lancamento.disparo_agendado",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "group_launch",
      resourceId: id,
      requestId,
      metadata: { disparo: (data as { id: string }).id, itens: parsed.data.items.length, quando: (data as { scheduled_at: string }).scheduled_at },
    });
    return ok(data, { requestId, status: 201 });
  } catch (err) {
    logger.error("[lancamentos] agendamento do disparo falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível agendar o disparo."), 500, { requestId });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  const disparoId = new URL(req.url).searchParams.get("disparo") ?? "";
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(disparoId).success) {
    return fail("not_found", t("Disparo não encontrado."), 404, { requestId });
  }

  // Só o que ainda está `scheduled`: a condição vai no UPDATE, então um disparo
  // que a rodada acabou de pegar não é cancelado por cima.
  const { data, error } = await createAdminClient()
    .from("group_launch_broadcasts")
    .update({ status: "cancelled", claimed_until: null, finished_at: new Date().toISOString() })
    .eq("organization_id", auth.org.orgId)
    .eq("launch_id", id)
    .eq("id", disparoId)
    .eq("status", "scheduled")
    .select("id");
  if (error) {
    logger.error("[lancamentos] cancelamento do disparo falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível cancelar o disparo."), 500, { requestId });
  }
  if ((data?.length ?? 0) === 0) {
    return fail("state_conflict", t("Esse disparo já começou ou não existe mais — não dá para cancelar."), 409, { requestId });
  }

  void audit({
    action: "lancamento.disparo_cancelado",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "group_launch",
    resourceId: id,
    requestId,
    metadata: { disparo: disparoId },
  });
  return ok({ id: disparoId, status: "cancelled" }, { requestId });
}
