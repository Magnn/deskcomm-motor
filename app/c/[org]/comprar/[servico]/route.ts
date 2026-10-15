/**
 * GET /c/[org]/comprar/[servico] — o clique em "Comprar" da vitrine.
 *
 * Registra o clique (é a etapa "clicou em comprar" do funil) e manda para o
 * checkout do serviço. A compra em si volta pelo ledger de receita, e o painel
 * a liga a este clique pela pessoa e pelo nome do produto.
 */
import { NextResponse, type NextRequest } from "next/server";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; servico: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, servico } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  const voltar = NextResponse.redirect(new URL(caminhoDaArea(org.slug), req.url), 303);
  if (!sessao || !UUID.test(servico)) return voltar;

  const { data } = await admin
    .from("area_servicos")
    .select("id, link_checkout")
    .eq("id", servico)
    .eq("organization_id", org.id)
    .eq("ativo", true)
    .maybeSingle();
  const s = data as { id: string; link_checkout: string } | null;
  if (!s) return voltar;

  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "checkout_clicado",
    sessaoId: sessao.sessaoId,
    servicoId: s.id,
  });
  const resposta = NextResponse.redirect(s.link_checkout, 303);
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
