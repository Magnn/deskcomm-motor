/**
 * POST /api/v1/area/publica/[org]/mao — a foto da palma para a leitura da mão (migration 0951).
 *
 * Corpo `multipart/form-data` com `foto` (jpeg, png ou webp; a tela já reduz antes de mandar). A IA de visão
 * lê as cinco linhas na hora; a resposta traz a linha do coração inteira e, nas outras, só o que foi visto —
 * o resto abre em `/mao/[id]/liberar`. A foto não é guardada.
 *
 * Cada foto é uma chamada de visão paga por nós: no máximo `FOTOS_POR_DIA` por pessoa, e 5 a cada 10 minutos.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { FOTOS_POR_DIA, TETO_DA_FOTO_BYTES, TIPOS_DA_FOTO, configDaMao } from "@/lib/area-do-cliente/mao";
import { fotosHoje, lerFotoDaMao } from "@/lib/area-do-cliente/mao-servidor";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const cfg = configDaMao(org.config.mao, org.config.leituras);
  if (!cfg.ativo) return ERRO(404, "not_found", "A leitura da mão não está disponível.");

  const limite = await checkRateLimit(`area:mao:${sessao.contactId}`, 5, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas fotos seguidas. Espere alguns minutos.");
  if ((await fotosHoje(admin, org, sessao.contactId)) >= FOTOS_POR_DIA) {
    return ERRO(429, "limite_do_dia", "Por hoje já lemos as suas mãos. Amanhã você pode mandar outra foto.");
  }

  const form = await req.formData().catch(() => null);
  const foto = form?.get("foto");
  if (!(foto instanceof Blob) || !TIPOS_DA_FOTO.has(foto.type) || foto.size === 0 || foto.size > TETO_DA_FOTO_BYTES) {
    return ERRO(422, "foto_recusada", "Mande uma foto da palma da mão (JPG ou PNG).");
  }

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await lerFotoDaMao(admin, { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "", fuso: org.fuso }, {
    contactId: sessao.contactId,
    sessaoId: sessao.sessaoId,
    primeiroNome: primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
    foto: Buffer.from(await foto.arrayBuffer()),
    mime: foto.type,
    precoCents: cfg.preco_cents,
  });
  if (!r.ok) {
    return r.motivo === "nao_e_mao"
      ? ERRO(422, "nao_e_mao", "Não consegui ver as linhas. Tire a foto da palma aberta, de perto, com boa luz.")
      : ERRO(503, "indisponivel", "A leitura da mão não está disponível agora. Tente de novo mais tarde — nada foi cobrado.");
  }
  return NextResponse.json({ data: r.mao }, { headers: { "Cache-Control": "no-store" } });
}
