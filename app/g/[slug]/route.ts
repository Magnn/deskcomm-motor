/**
 * GET /g/[slug] — o LINK ÚNICO do lançamento.
 *
 * É o endereço que vai no anúncio. Quem clica é mandado para o grupo do WhatsApp
 * que ainda tem vaga; quando as vagas estão no fim, o próximo grupo é aberto aqui
 * mesmo. Sem sessão e sem cookie: quem chega é um desconhecido vindo do anúncio.
 *
 * O que esta porta entrega é só o convite de UM grupo. O slug não dá acesso a
 * nada mais do lançamento, e a resposta nunca é guardada em cache — o grupo certo
 * muda de um clique para o outro.
 *
 * Lançamento pausado, encerrado ou sem vaga: uma página curta dizendo isso, em vez
 * de um erro técnico ou de um convite que o WhatsApp recusaria.
 */
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { resolverLinkPublico, type DestinoDoLink } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporteDeGrupos } from "@/lib/channels/grupos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ slug: string }> };

const FORMA_DO_SLUG = /^[a-z0-9][a-z0-9-]{2,59}$/;
/** Por IP, por minuto. Folgado: uma rede de celular inteira sai pelo mesmo IP. */
const CLIQUES_POR_MINUTO = 120;

const FRASES: Record<Exclude<DestinoDoLink, { tipo: "grupo" }>["motivo"], { titulo: string; texto: string }> = {
  nao_existe: { titulo: "Link não encontrado", texto: "Este link não existe ou já foi encerrado." },
  pausado: { titulo: "Entrada pausada", texto: "A entrada neste grupo está pausada no momento. Tente de novo mais tarde." },
  sem_vaga: { titulo: "Grupos lotados", texto: "Os grupos estão cheios agora. Um novo está sendo aberto — tente de novo em um minuto." },
};

function pagina(status: number, frase: { titulo: string; texto: string }, extra: Record<string, string> = {}): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${frase.titulo}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f6f7f9;color:#1c1f24">
<main style="max-width:420px;margin:0 auto;padding:64px 24px;text-align:center">
<h1 style="font-size:20px;margin:0 0 12px">${frase.titulo}</h1>
<p style="font-size:15px;line-height:1.5;margin:0;color:#4b5563">${frase.texto}</p>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...extra },
  });
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { slug } = await params;
  if (!FORMA_DO_SLUG.test(slug)) return pagina(404, FRASES.nao_existe);

  const ip = ipDoCliente(req.headers);
  if (ip !== null) {
    const limite = await checkRateLimit(`lancamento_link:ip:${ip}`, CLIQUES_POR_MINUTO, 60);
    if (!limite.allowed) {
      return pagina(429, { titulo: "Muitas tentativas", texto: "Aguarde um minuto e abra o link de novo." }, { "Retry-After": "60" });
    }
  }

  try {
    const destino = await resolverLinkPublico(createAdminClient(), transporteDeGrupos(), slug);
    if (destino.tipo === "grupo") {
      return new Response(null, { status: 302, headers: { Location: destino.url, "Cache-Control": "no-store" } });
    }
    return pagina(destino.motivo === "nao_existe" ? 404 : 503, FRASES[destino.motivo], destino.motivo === "sem_vaga" ? { "Retry-After": "60" } : {});
  } catch (err) {
    logger.error("[lancamentos.link] falhou", { slug, erro: err instanceof Error ? err.message : String(err) });
    return pagina(503, { titulo: "Tente de novo", texto: "Não conseguimos abrir o grupo agora. Tente de novo em instantes." }, { "Retry-After": "30" });
  }
}
