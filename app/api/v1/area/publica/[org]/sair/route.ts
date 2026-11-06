/**
 * /api/v1/area/publica/[org]/sair?v=…&k=… — o "não quero mais receber" do e-mail da recuperação do quiz (0960).
 *
 * GET mostra a confirmação com um botão; só o POST grava a recusa (`consent.marketing.declined_at`). Leitor de
 * e-mail que abre links sozinho para conferir não tira ninguém da lista.
 */
import { NextResponse, type NextRequest } from "next/server";

import { contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { sairDosEmails } from "@/lib/area-do-cliente/recuperacao-do-quiz";
import { idiomaDaAreaPeloCabecalho, traduzirNaArea } from "@/lib/i18n/area";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

const semHtml = (t: string) => t.replace(/[<>&"]/g, "");

function pagina(req: NextRequest, corpo: string, status = 200): Response {
  const idioma = idiomaDaAreaPeloCabecalho(req.headers.get("accept-language"));
  const t = (s: string) => semHtml(traduzirNaArea(s, idioma));
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t("Sair da lista")}</title></head>
<body style="margin:0;background:#f7f4ee;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#2a2233">
<div style="max-width:420px;margin:48px auto;padding:28px 24px;background:#fff;border:1px solid #ece4d3;border-radius:16px;text-align:center">${corpo.replace(/\{\{(.+?)\}\}/g, (_, s: string) => t(s))}</div>
</body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(req: NextRequest): Promise<Response> {
  const q = req.nextUrl.searchParams;
  const acao = `?v=${encodeURIComponent(q.get("v") ?? "")}&amp;k=${encodeURIComponent(q.get("k") ?? "")}`;
  return pagina(
    req,
    `<p style="font-size:17px;margin:0 0 18px">{{Não quer mais receber estes e-mails?}}</p>
<form method="post" action="${acao}"><button type="submit" style="background:#9a7420;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-size:15px">{{Sair da lista}}</button></form>`,
  );
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "quiz-sair", 10, 600))) return pagina(req, `<p>{{Tente de novo em alguns minutos.}}</p>`, 429);
  const ctx = await contextoDaArea(req, slug);
  const q = req.nextUrl.searchParams;
  const feito = ctx ? await sairDosEmails(ctx.admin, ctx.org.id, q.get("v") ?? undefined, q.get("k") ?? undefined, new Date()) : false;
  return feito
    ? pagina(req, `<p style="font-size:17px;margin:0">{{Pronto. Você não vai mais receber estes e-mails.}}</p>`)
    : pagina(req, `<p style="font-size:17px;margin:0">{{Este link não vale mais.}}</p>`, 404);
}
