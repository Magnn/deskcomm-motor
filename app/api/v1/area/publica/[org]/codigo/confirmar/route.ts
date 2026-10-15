/**
 * POST /api/v1/area/publica/[org]/codigo/confirmar — confere o código do e-mail
 * e abre a sessão da área neste aparelho.
 *
 * Cinco tentativas por código, dez minutos de validade, uso único. Erro diz só
 * "código inválido ou vencido": não conta se o e-mail existe.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { criarSessao, nomeDoCookieDaArea, opcoesDoCookie } from "@/lib/area-do-cliente/sessao";
import { codigoConfere } from "@/lib/area-do-cliente/token";
import { TENTATIVAS_DO_CODIGO } from "@/lib/area-do-cliente/vocabulario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  email: z.string().trim().toLowerCase().email().max(200),
  codigo: z.string().trim().regex(/^\d{6}$/),
});
type Ctx = { params: Promise<{ org: string }> };

const RECUSADO = () =>
  NextResponse.json({ error: { code: "codigo_invalido", message: "Código inválido ou vencido. Peça um novo." } }, { status: 422 });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "confirmar", 20))) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Muitas tentativas. Espere um minuto." } }, { status: 429 });
  }
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return RECUSADO();

  const { data: contatoData } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org.id)
    .eq("email_normalized", lido.data.email)
    .is("is_merged_into", null)
    .maybeSingle();
  const contato = contatoData as { id: string } | null;
  if (!contato) return RECUSADO();

  const { data: codigoData } = await admin
    .from("area_codigos")
    .select("id, code_hash, tentativas, expires_at, usado_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contato.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const c = codigoData as { id: string; code_hash: string; tentativas: number; expires_at: string; usado_at: string | null } | null;
  if (!c || c.usado_at || c.tentativas >= TENTATIVAS_DO_CODIGO || new Date(c.expires_at).getTime() <= Date.now()) {
    return RECUSADO();
  }
  if (!codigoConfere(lido.data.codigo, contato.id, c.code_hash)) {
    await admin.from("area_codigos").update({ tentativas: c.tentativas + 1 }).eq("id", c.id);
    return RECUSADO();
  }
  // Uso único: só quem marcar primeiro leva — dois envios do mesmo código não abrem duas sessões.
  const { data: marcado } = await admin
    .from("area_codigos")
    .update({ usado_at: new Date().toISOString() })
    .eq("id", c.id)
    .is("usado_at", null)
    .select("id");
  if (!marcado || marcado.length === 0) return RECUSADO();

  const sessao = await criarSessao(admin, org, contato.id, "codigo");
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: contato.id,
    tipo: "entrou",
    sessaoId: sessao.sessaoId,
    props: { origem: "codigo" },
  });
  const resposta = NextResponse.json({ data: { entrou: true } }, { headers: { "Cache-Control": "no-store" } });
  resposta.cookies.set(nomeDoCookieDaArea(org.slug), sessao.token, opcoesDoCookie(sessao.expira));
  return resposta;
}
