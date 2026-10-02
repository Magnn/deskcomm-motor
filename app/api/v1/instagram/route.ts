/**
 * GET /api/v1/instagram — o retrato da tela "comentou, recebe direct": se o
 * recurso está configurado na instalação, as contas conectadas, as regras e os
 * últimos comentários atendidos. Nenhum token sai daqui.
 */
import { randomUUID } from "node:crypto";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { appDoInstagram } from "@/lib/channels/instagram/app";
import { listarConexoes, listarEventos, listarRegrasDaOrganizacao } from "@/lib/channels/instagram/repositorio";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  try {
    const admin = createAdminClient();
    const [conexoes, regras, eventos] = await Promise.all([
      listarConexoes(admin, auth.org.orgId),
      listarRegrasDaOrganizacao(admin, auth.org.orgId),
      listarEventos(admin, auth.org.orgId),
    ]);
    return ok({ configurado: appDoInstagram() !== null, conexoes, regras, eventos }, { requestId });
  } catch (err) {
    logger.error("[instagram] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar o Instagram."), 500, { requestId });
  }
}
