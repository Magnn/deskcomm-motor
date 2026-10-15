/**
 * O começo comum de toda rota pública da área: qual organização, quem é a
 * pessoa (pelo cookie) e o limite por IP. Cada rota decide o que fazer quando
 * não há sessão — a página manda para a tela de entrar, a API responde 401.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
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
