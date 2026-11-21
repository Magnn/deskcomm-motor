/**
 * GET /api/v1/resultado/cobranca-do-whatsapp (manager+) — o que a Meta está cobrando no mês, por número oficial
 * (`lib/resultado/cobranca-do-whatsapp.ts`). Mesma regra de quem vê da aba Receita: é dinheiro do negócio.
 */
import { randomUUID } from "node:crypto";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { lerCobrancaDoWhatsapp } from "@/lib/resultado/cobranca-do-whatsapp";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  try {
    const cobranca = await lerCobrancaDoWhatsapp(getRequestPool(), auth.org.orgId);
    return ok({ cobranca }, { requestId });
  } catch (err) {
    logger.error("[resultado.cobranca-whatsapp] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", traduzir("Não foi possível ler a cobrança do WhatsApp.", auth.user.idioma), 500, { requestId });
  }
}
