/**
 * O começo comum de toda rota pública da área: qual organização, quem é a
 * pessoa (pelo cookie) e o limite por IP. Cada rota decide o que fazer quando
 * não há sessão — a página manda para a tela de entrar, a API responde 401.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { env } from "@/lib/env";
import { urlPublicaUsavel } from "@/lib/escalacao/url-publica";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { createAdminClient } from "@/lib/supabase/admin";

import { nomeDoCookieDaArea, orgDaArea, sessaoDoCookie, type OrgDaArea, type SessaoDaArea } from "./sessao";

export interface ContextoDaArea {
  admin: SupabaseClient;
  org: OrgDaArea;
  sessao: SessaoDaArea | null;
}

export async function contextoDaArea(req: NextRequest, slug: string): Promise<ContextoDaArea | null> {
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org) return null;
  const sessao = await sessaoDoCookie(admin, org, req.cookies.get(nomeDoCookieDaArea(org.slug))?.value);
  return { admin, org, sessao };
}

/** `true` = passou. Por IP: uma rede de celular inteira sai pelo mesmo, então o teto é folgado. */
export async function dentroDoLimite(req: NextRequest, balde: string, limite: number, janelaS = 60): Promise<boolean> {
  const ip = ipDoCliente(req.headers) ?? "sem-ip";
  const r = await checkRateLimit(`area:${balde}:${ip}`, limite, janelaS);
  return r.allowed;
}

/**
 * 303 com `Location` RELATIVO. Atrás do proxy, `req.url` é o endereço interno
 * do contêiner (`https://0.0.0.0:3000/...`) — montar a URL absoluta a partir
 * dele mandava o navegador para uma página de erro. Caminho relativo o
 * navegador resolve no domínio em que a pessoa já está.
 */
export function irPara(caminho: string, busca?: Record<string, string>): NextResponse {
  const query = busca ? `?${new URLSearchParams(busca).toString()}` : "";
  return new NextResponse(null, { status: 303, headers: { Location: `${caminho}${query}` } });
}

/**
 * Origem para link que sai da tela (WhatsApp, e-mail): o endereço público da
 * instalação; sem ele, o que o proxy repassou; por último, o da requisição.
 */
export function origemPublica(req: NextRequest): string {
  const daInstalacao = env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (urlPublicaUsavel(daInstalacao)) return daInstalacao as string;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const protocolo = (req.headers.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
  const repassada = host ? `${protocolo}://${host}` : null;
  return urlPublicaUsavel(repassada) ? (repassada as string) : req.nextUrl.origin;
}

export function paginaSimples(status: number, titulo: string, texto: string): Response {
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(titulo)}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f9;color:#1c1f24">
<main style="max-width:420px;margin:0 auto;padding:64px 24px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${esc(titulo)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0;color:#4b5563">${esc(texto)}</p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const NAO_ENCONTRADA = () => paginaSimples(404, "Página não encontrada", "Este endereço não existe ou foi desativado.");
