/**
 * GET /c/[org]/material/[id] — abre um material (PDF, áudio, vídeo) da pessoa.
 *
 * O arquivo só sai se a mensagem for DESTA pessoa, desta organização e for um
 * material. O link do arquivo é assinado e vale 1 hora; a abertura entra no
 * rastro (o painel mostra o que é mais aberto).
 */
import { NextResponse, type NextRequest } from "next/server";

import { linkDoMaterial } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, irPara, paginaSimples } from "@/lib/area-do-cliente/http";
import { caminhoPublicoDaArea } from "@/lib/area-do-cliente/vocabulario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; id: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return irPara(caminhoPublicoDaArea(org.slug, org.config.apelido));
  const naoAchou = () => paginaSimples(404, "Material não encontrado", "Volte para a sua área e tente de novo.");
  if (!UUID.test(id)) return naoAchou();

  const url = await linkDoMaterial(admin, org.id, sessao.contactId, id);
  if (!url) return naoAchou();

  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "material_aberto",
    sessaoId: sessao.sessaoId,
    ref: id,
  });
  const resposta = NextResponse.redirect(url, 303);
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
