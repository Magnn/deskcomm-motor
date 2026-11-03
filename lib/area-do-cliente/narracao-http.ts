/**
 * A resposta HTTP de "ouvir a leitura" dos pedidos pagos pelo segredo (quiz e sinastria), comum às duas rotas
 * `/voz`. Quem prova o direito é o segredo do pedido (`x-segredo`), o mesmo que libera o texto.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "./http";
import { narrarTextoLongo } from "./narracao";
import { FORMA_DO_TOKEN, hashDoToken } from "./token";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export type PedidoNarravel = { tabela: "area_quiz_pedidos"; tipo: string } | { tabela: "area_sinastrias" };

export async function responderNarracaoDoPedido(req: NextRequest, slug: string, id: string, pedido: PedidoNarravel): Promise<Response> {
  if (!(await dentroDoLimite(req, "ouvir-leitura", 20))) return ERRO(429, "rate_limited", "Espere um instante.");
  const segredo = req.headers.get("x-segredo") ?? "";
  if (!UUID.test(id) || !FORMA_DO_TOKEN.test(segredo)) return NAO_ENCONTRADA();
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();

  let consulta = ctx.admin
    .from(pedido.tabela)
    .select("pago_at, texto")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .eq("segredo_hash", hashDoToken(segredo));
  if (pedido.tabela === "area_quiz_pedidos") consulta = consulta.eq("tipo", pedido.tipo);
  const { data } = await consulta.maybeSingle();
  const achado = data as { pago_at: string | null; texto: string | null } | null;
  if (!achado?.pago_at || !achado.texto) return NAO_ENCONTRADA();

  const r = await narrarTextoLongo(ctx.admin, ctx.org.id, `${ctx.org.id}/${pedido.tabela}/narracoes/${id}.mp3`, achado.texto);
  if (!r.ok) return ERRO(503, r.motivo, "A voz não está disponível agora. A leitura escrita continua aqui.");
  return NextResponse.json({ data: { url: r.url } }, { headers: { "Cache-Control": "no-store" } });
}
