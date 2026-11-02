/**
 * A resposta HTTP de "entrar pela compra", comum às rotas do quiz e da sinastria (`entrada-pela-compra.ts`).
 * 200 com o caminho da área e o cookie da sessão; 402 enquanto o pagamento não confirma; 404 para segredo errado.
 */
import { NextResponse, type NextRequest } from "next/server";

import { entrarPelaCompra, type PedidoQueAbreAArea } from "./entrada-pela-compra";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "./http";
import { nomeDoCookieDaArea, opcoesDoCookie } from "./sessao";
import { FORMA_DO_TOKEN } from "./token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function responderEntradaPelaCompra(
  req: NextRequest,
  slug: string,
  id: string,
  pedido: PedidoQueAbreAArea,
): Promise<Response> {
  if (!(await dentroDoLimite(req, "entrar-pela-compra", 20))) return ERRO(429, "rate_limited", "Espere um instante.");
  const segredo = req.headers.get("x-segredo") ?? "";
  if (!UUID.test(id) || !FORMA_DO_TOKEN.test(segredo)) return ERRO(404, "not_found", "Pedido não encontrado.");
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();

  const r = await entrarPelaCompra(ctx.admin, ctx.org, pedido, id, segredo);
  if (!r.ok) {
    return r.motivo === "nao_pago"
      ? ERRO(402, "nao_pago", "O pagamento ainda não foi confirmado.")
      : ERRO(404, "not_found", "Pedido não encontrado.");
  }
  const resposta = NextResponse.json({ data: { area: r.caminho } }, { headers: { "Cache-Control": "no-store" } });
  resposta.cookies.set(nomeDoCookieDaArea(ctx.org.slug), r.sessao.token, opcoesDoCookie(r.sessao.expira));
  return resposta;
}
