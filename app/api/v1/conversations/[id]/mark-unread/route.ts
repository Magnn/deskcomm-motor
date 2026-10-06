import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/mark-unread — marca a conversa como NÃO lida.
 *
 * O par do `mark-read`. Quem atende abre uma conversa, vê que não dá para resolver agora e quer que ela
 * continue chamando atenção na lista: o contador de não-lidas volta a 1 (o que já for maior fica como
 * está — a marca não apaga a contagem real).
 *
 * A tela SAI da conversa ao marcar: com ela aberta, o `mark-read` automático zeraria o contador de novo
 * em 1,5 s. RLS garante que só conversas visíveis ao ator são atualizadas.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

import { markConversationUnreadHandler } from "../../_handler";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const supabase = await createClient();

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  try {
    const conv = await markConversationUnreadHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      id,
    );
    return ok(conv, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    return fail("internal_error", "Erro inesperado.", 500, { requestId });
  }
}
