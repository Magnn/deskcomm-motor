/**
 * POST /api/v1/area/publica/[org]/codigo — manda o código de 6 números para o
 * e-mail de quem quer entrar de novo na área do cliente.
 *
 * A resposta é a MESMA com ou sem cadastro para aquele e-mail: dizer "não
 * encontramos este e-mail" ensinaria a qualquer um quais e-mails são clientes
 * desta empresa. Limite por IP e por e-mail.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { gerarCodigo, hashDoCodigo } from "@/lib/area-do-cliente/token";
import { VALIDADE_DO_CODIGO_MIN } from "@/lib/area-do-cliente/vocabulario";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ email: z.string().trim().toLowerCase().email().max(200) });
type Ctx = { params: Promise<{ org: string }> };

const ENVIADO = () => NextResponse.json({ data: { enviado: true } }, { headers: { "Cache-Control": "no-store" } });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "codigo", 10))) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Muitas tentativas. Espere um minuto." } }, { status: 429 });
  }
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return NextResponse.json({ error: { code: "validation_failed", message: "Digite um e-mail válido." } }, { status: 422 });
  }
  const email = lido.data.email;
  const porEmail = await checkRateLimit(`area:codigo-email:${org.id}:${email}`, 3, 600);
  if (!porEmail.allowed) return ENVIADO();

  const { data } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", org.id)
    .eq("email_normalized", email)
    .is("is_merged_into", null)
    .maybeSingle();
  const contato = data as { id: string } | null;
  if (!contato) return ENVIADO();

  const codigo = gerarCodigo();
  const { error } = await admin.from("area_codigos").insert({
    organization_id: org.id,
    contact_id: contato.id,
    code_hash: hashDoCodigo(codigo, contato.id),
    expires_at: new Date(Date.now() + VALIDADE_DO_CODIGO_MIN * 60_000).toISOString(),
  });
  if (error) {
    logger.error("[area] código não gravado", { organization_id: org.id, motivo: error.message });
    return NextResponse.json({ error: { code: "internal_error", message: "Não foi possível enviar agora. Tente de novo." } }, { status: 500 });
  }

  const marca = await marcaDaSaida(org.id);
  const titulo = org.config.titulo || org.nome;
  const envio = await sendEmail({
    to: email,
    subject: `Seu código de acesso: ${codigo}`,
    fromName: marca.nome,
    text: `Seu código para entrar em ${titulo} é ${codigo}. Ele vale ${VALIDADE_DO_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.`,
    html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1c1f24">
<p style="font-size:15px;margin:0 0 12px">Seu código para entrar em <strong>${titulo.replace(/[<>&"]/g, "")}</strong>:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:700;margin:0 0 16px">${codigo}</p>
<p style="font-size:13px;color:#6b7280;margin:0">Ele vale ${VALIDADE_DO_CODIGO_MIN} minutos. Se não foi você que pediu, ignore este e-mail.</p>
</div>`,
    tags: [{ name: "tipo", value: "area_codigo" }],
  });
  if (!envio.ok) {
    logger.error("[area] e-mail do código não saiu", { organization_id: org.id, motivo: envio.error ?? "desconhecido", via: envio.via });
  }
  return ENVIADO();
}
