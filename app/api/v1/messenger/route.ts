/**
 * GET /api/v1/messenger — o retrato da aba Conexões › Messenger: se o recurso
 * está configurado na instalação e as páginas conectadas. Nenhum token sai daqui.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { appDoMessenger } from "@/lib/channels/messenger/app";
import { paginasDaOrganizacao } from "@/lib/channels/messenger/paginas";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  try {
    const [app, paginas] = await Promise.all([appDoMessenger(), paginasDaOrganizacao(createAdminClient(), auth.org.orgId)]);
    return ok({ configurado: app !== null, paginas }, { requestId });
  } catch (err) {
    logger.error("[messenger] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar o Messenger."), 500, { requestId });
  }
}
