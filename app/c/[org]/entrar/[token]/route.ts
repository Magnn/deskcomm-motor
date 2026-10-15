/**
 * GET /c/[org]/entrar/[token] — o LINK DE ACESSO da área do cliente.
 *
 * Quem chega aqui clicou no link que recebeu (WhatsApp, e-mail). O token vale
 * 30 dias e pode ser aberto em mais de um aparelho; cada abertura cria uma
 * sessão própria naquele aparelho. Link vencido ou desconhecido leva à tela de
 * entrar com o e-mail, nunca a um erro técnico.
 */
import type { NextRequest } from "next/server";

import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite, irPara, paginaSimples } from "@/lib/area-do-cliente/http";
import { criarSessao, nomeDoCookieDaArea, opcoesDoCookie } from "@/lib/area-do-cliente/sessao";
import { FORMA_DO_TOKEN, hashDoToken } from "@/lib/area-do-cliente/token";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string; token: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, token } = await params;
  if (!(await dentroDoLimite(req, "entrar", 30))) {
    return paginaSimples(429, "Muitas tentativas", "Espere um minuto e abra o link de novo.");
  }
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const destino = caminhoDaArea(org.slug);

  if (!FORMA_DO_TOKEN.test(token)) {
    return irPara(destino, { link: "invalido" });
  }
  const { data } = await admin
    .from("area_convites")
    .select("id, contact_id, expires_at")
    .eq("token_hash", hashDoToken(token))
    .eq("organization_id", org.id)
    .maybeSingle();
  const convite = data as { id: string; contact_id: string; expires_at: string } | null;
  if (!convite || new Date(convite.expires_at).getTime() <= Date.now()) {
    return irPara(destino, { link: convite ? "vencido" : "invalido" });
  }

  const sessao = await criarSessao(admin, org, convite.contact_id, "convite");
  await admin.from("area_convites").update({ ultimo_uso_at: new Date().toISOString() }).eq("id", convite.id);
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: convite.contact_id,
    tipo: "entrou",
    sessaoId: sessao.sessaoId,
    props: { origem: "convite" },
  });

  const resposta = irPara(destino);
  resposta.cookies.set(nomeDoCookieDaArea(org.slug), sessao.token, opcoesDoCookie(sessao.expira));
  resposta.headers.set("Cache-Control", "no-store");
  // O token do link não pode vazar como Referer para o checkout ou para o arquivo.
  resposta.headers.set("Referrer-Policy", "no-referrer");
  return resposta;
}
