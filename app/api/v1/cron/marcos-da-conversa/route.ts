/**
 * /api/v1/cron/marcos-da-conversa — classifica as mensagens novas em marcos da
 * conversa (oferta apresentada, objeção). Ver `lib/resultado/marcos.ts`.
 *
 * Roda a cada poucos minutos e drena até `RODADAS_POR_CHAMADA` lotes: o primeiro
 * disparo depois da instalação encontra o histórico inteiro pela frente, e uma
 * rodada só por chamada levaria horas para alcançar o presente.
 *
 * A auditoria só é gravada quando HOUVE marco novo — uma linha por execução
 * ociosa seriam milhares de linhas por mês dizendo "nada aconteceu".
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { EVENTO_DO_LINK_DE_PAGAMENTO, reportarEventoDaConversa } from "@/lib/conversoes/evento-da-conversa";
import { classificarNovasMensagens, type LinkDePagamentoEnviado } from "@/lib/resultado/marcos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RODADAS_POR_CHAMADA = 10;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const admin = createAdminClient();
  let lidas = 0;
  let marcos = 0;
  let haMais = false;
  const links: LinkDePagamentoEnviado[] = [];
  try {
    for (let i = 0; i < RODADAS_POR_CHAMADA; i += 1) {
      const r = await classificarNovasMensagens(admin);
      lidas += r.lidas;
      marcos += r.marcos;
      haMais = r.haMais;
      links.push(...r.linksDePagamento);
      if (!r.haMais) break;
    }
  } catch (err) {
    logger.error("[cron.marcos-da-conversa] rodada falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "classificação das mensagens falhou", 500, { requestId });
  }

  // O link de pagamento enviado é o passo que a plataforma de anúncio aprende a buscar enquanto as
  // compras são poucas (`lib/conversoes/evento-da-conversa.ts`). Um por contato por chamada; o
  // livro-razão garante um por negócio. Falha aqui não derruba a rotina dos marcos: o cursor já andou,
  // e o próximo link da mesma conversa tenta de novo.
  let passosReportados = 0;
  const vistos = new Set<string>();
  for (const link of links) {
    const chave = `${link.organizationId}:${link.contactId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    try {
      const d = await reportarEventoDaConversa(admin, {
        organizationId: link.organizationId,
        contactId: link.contactId,
        evento: EVENTO_DO_LINK_DE_PAGAMENTO,
        ocorridoEm: new Date(link.em),
      });
      if (d.status === "sent") passosReportados += 1;
    } catch (err) {
      logger.warn("[cron.marcos-da-conversa] passo não reportado", { requestId, erro: err instanceof Error ? err.message : String(err) });
    }
  }

  if (marcos > 0 || passosReportados > 0) {
    void audit({ action: "cron.marcos_da_conversa", requestId, bypassedRls: true, metadata: { lidas, marcos, ha_mais: haMais, passos_reportados: passosReportados } });
  }
  return ok({ lidas, marcos, ha_mais: haMais, passos_reportados: passosReportados }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
