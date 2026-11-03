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

import { emailDoCodigoDaArea } from "@/lib/area-do-cliente/email-da-area";
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
  const mensagem = emailDoCodigoDaArea({
    codigo,
    validadeMin: VALIDADE_DO_CODIGO_MIN,
    titulo: org.config.titulo,
    marcaDaOrganizacao: marca.nome,
    guia: org.config.guia?.nome ?? null,
  });
  const envio = await sendEmail({
    to: email,
    subject: mensagem.subject,
    fromName: mensagem.fromName,
    text: mensagem.text,
    html: mensagem.html,
    tags: [{ name: "tipo", value: "area_codigo" }],
  });
  if (!envio.ok) {
    logger.error("[area] e-mail do código não saiu", { organization_id: org.id, motivo: envio.error ?? "desconhecido", via: envio.via });
  }
  return ENVIADO();
}
