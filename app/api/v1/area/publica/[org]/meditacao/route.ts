/**
 * POST /api/v1/area/publica/[org]/meditacao — a meditação da semana falada (`lib/area-do-cliente/meditacao.ts`).
 *
 * Devolve o link assinado do mp3. A primeira chamada da semana gera e guarda (alguns segundos); as seguintes
 * devolvem o mesmo arquivo. Só para quem está na área e com voz no servidor; o roteiro é em português.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ceuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { diaNoFuso, primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { meditacaoDaSemana } from "@/lib/area-do-cliente/meditacao";
import { meditacaoFalada } from "@/lib/area-do-cliente/meditacao-voz";
import { ehFoco } from "@/lib/area-do-cliente/perfil";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");

  const limite = await checkRateLimit(`area:meditacao:${sessao.contactId}`, 12, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Espere alguns minutos para ouvir de novo.");

  const [{ data: contato }, { data: perfil }] = await Promise.all([
    admin.from("contacts").select("name, display_name, birthdate").eq("id", sessao.contactId).eq("organization_id", org.id).maybeSingle(),
    admin.from("area_perfis").select("foco").eq("organization_id", org.id).eq("contact_id", sessao.contactId).maybeSingle(),
  ]);
  const c = (contato ?? {}) as { name: string | null; display_name: string | null; birthdate: string | null };
  const foco = (perfil as { foco: string | null } | null)?.foco;
  const ceu = ceuDoNascimento(c.birthdate);
  const m = meditacaoDaSemana({
    semente: sessao.contactId,
    dia: diaNoFuso(new Date().toISOString(), org.fuso),
    nome: primeiroNome(nomeDoContato({ name: c.name ?? null, display_name: c.display_name ?? null })),
    ceu: ceu ? { sol: ceu.sol, lua: ceu.luaCerta ? ceu.lua : null } : null,
    foco: ehFoco(foco) ? foco : null,
  });

  const r = await meditacaoFalada(admin, org.id, sessao.contactId, m);
  if (!r.ok) return ERRO(503, r.motivo, "A voz não está disponível agora. O texto da meditação continua aqui.");
  // Sem evento em `area_eventos` (o CHECK do tipo exigiria migration): o rastro fica no log.
  logger.info("[area.meditacao] ouvida", { organization_id: org.id, contact_id: sessao.contactId, semana: m.semana });
  return NextResponse.json({ data: { url: r.url } }, { headers: { "Cache-Control": "no-store" } });
}
