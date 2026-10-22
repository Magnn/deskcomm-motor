/**
 * GET /api/v1/anuncios/meta/[org] — o endereço que captura as UTMs e manda a
 * pessoa para o WhatsApp com um ref curto no texto.
 *
 * Irmã da rota de captura de `gclid` do Google Ads
 * (`app/api/v1/anuncios/google/[org]/route.ts`), com o mesmo desenho e as
 * mesmas peças de navegador. O que muda é o DADO capturado: lá é um clique
 * pago identificado por `gclid`, aqui são as UTMs que a página (ou a macro de
 * URL do anúncio) trouxe na query.
 *
 * ─── Por que o ref precisa passar por aqui ──────────────────────────────────
 *
 * O link `wa.me` não fala com o CRM: ele abre o aplicativo no aparelho da
 * pessoa, e o servidor nunca vê aquele clique. A única coisa que chega depois
 * é o TEXTO da mensagem, e por isso a origem tem de viajar dentro dele. O
 * contrato `[dk1:<base64url>]` (`lib/leads/origem-do-site.ts`) faz isso sem
 * servidor, ao custo de ~200 caracteres visíveis na mensagem do lead e de um
 * script que quem monta a página precisa colar. Esta rota troca as duas coisas
 * por um endereço: ela guarda as UTMs do lado do servidor e põe no texto só
 * `[ref:XXXXXX]`.
 *
 * O `[dk1:]` CONTINUA valendo — nada nesta rota o depreca.
 *
 * ─── De onde as UTMs chegam nesta query ─────────────────────────────────────
 *
 * De quem aponta para cá, e são dois casos:
 *
 *   1. o anúncio aponta direto para este endereço, com as macros dinâmicas de
 *      campanha, conjunto, anúncio e posicionamento nos parâmetros de URL —
 *      é o caso do Google Ads com `{gclid}`, e o que não depende da página;
 *   2. a landing page aponta o botão de WhatsApp para cá REPASSANDO a própria
 *      query string. Um botão de href fixo não repassa nada: nesse caso a
 *      captura acontece sem UTM nenhuma, e a rota cai no caminho sem ref.
 *
 * ─── Por que a FALHA nunca é uma tela de erro ───────────────────────────────
 *
 * Mesma régua da rota do Google: todo caminho ruim devolve o WhatsApp — sem o
 * ref, se for o caso — e nunca um 404/500 cru. Perder a atribuição é
 * aceitável; perder o lead não.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fbcDoClique } from "@/lib/conversoes/destino-de-mensageria";
import { normalizarUtm } from "@/lib/leads/origem-do-site";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { transporteMeta } from "@/lib/plataformas-de-anuncio/meta/conversions";
import { criarClickRef } from "@/lib/plataformas-de-anuncio/captura-de-clique";
import { lerConfigDaLanding } from "@/lib/plataformas-de-anuncio/landing-config";
import {
  clientIp,
  modeloComFrase,
  paginaDeSaida,
  textoSemRef,
  whatsAppUrl,
} from "@/lib/plataformas-de-anuncio/pagina-de-captura";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** O teto de espera do Lead pelo servidor: a pessoa está indo para o WhatsApp e não pode ficar presa aqui. */
const TETO_DO_LEAD_MS = 1500;

/**
 * Manda o Lead do botão à Meta pela API de Conversões, no conjunto da tela de Conversões. Nunca lança e nunca
 * segura a pessoa mais que `TETO_DO_LEAD_MS`: perder este evento é aceitável, perder o lead não.
 */
async function leadPeloServidor(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  parametros: URLSearchParams,
  cliente: { ip: string | null; ua: string | null; pagina: string | null; origem: string },
): Promise<void> {
  const eventoId = parametros.get("_eid");
  // Sem o id do navegador, mandar daria duas contagens para o mesmo clique: melhor não mandar.
  if (!eventoId || !/^[\w-]{8,80}$/.test(eventoId)) return;
  try {
    const credencial = await lerCredencial(admin, organizationId, "meta_ads");
    if (!credencial.ok) return;
    const query = Object.fromEntries(parametros.entries());
    const envio = transporteMeta.enviar(credencial.credencial, {
      organizationId,
      leadId: eventoId,
      evento: "Lead",
      eventoId,
      ocorridoEm: new Date(),
      cliqueDeOrigem: "",
      telefone: null,
      pixelDoSite: true,
      paginaDoSite: cliente.pagina?.slice(0, 500) || cliente.origem,
      fbc: fbcDoClique(query, new Date().toISOString()),
      fbp: typeof query._fbp === "string" && /^[\w.-]{8,300}$/.test(query._fbp) ? query._fbp : null,
      cliente: { ip: cliente.ip, ua: cliente.ua },
      moeda: "BRL",
      valorCentavos: null,
    });
    const resultado = await Promise.race([envio, new Promise<null>((ok) => setTimeout(() => ok(null), TETO_DO_LEAD_MS))]);
    if (resultado && resultado.tipo !== "ok") {
      logger.warn("[anuncios.meta.landing] Lead pelo servidor recusado", { detalhe: resultado.detalhe?.slice(0, 200) });
    }
  } catch (err) {
    logger.warn("[anuncios.meta.landing] Lead pelo servidor falhou", { erro: err instanceof Error ? err.message : String(err) });
  }
}

interface RouteContext {
  params: Promise<{ org: string }>;
}

const TETO_POR_IP = 30;
const JANELA_SEGUNDOS = 60;

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  const { org } = await ctx.params;

  const ip = clientIp(req);
  if (ip !== null) {
    const limite = await checkRateLimit(`meta-lp:${org}:${ip}`, TETO_POR_IP, JANELA_SEGUNDOS);
    if (!limite.allowed) {
      // 429 sem corpo de marketing: quem estoura este teto num clique real não
      // existe — é abuso, não humano legítimo.
      return new NextResponse(null, { status: 429, headers: { "Retry-After": String(JANELA_SEGUNDOS) } });
    }
  }

  const parametros = new URL(req.url).searchParams;
  // A MESMA normalização do `[dk1:]`: lista fechada de chaves e teto por valor.
  // O que não for chave de campanha não atravessa — nome, telefone e e-mail
  // ficam de fora por construção, não por filtro de última hora.
  const utm = normalizarUtm(Object.fromEntries(parametros.entries()));

  const admin = createAdminClient();

  const { data: organizacao, error: erroOrg } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", org)
    .maybeSingle();

  if (erroOrg) {
    logger.error("[anuncios.meta.landing] leitura da organização falhou", {
      org,
      detalhe: erroOrg.message,
    });
  }
  const organizationId = (organizacao as { id: string } | null)?.id ?? null;
  if (!organizationId) return paginaDeSaida(null);

  const lida = await lerConfigDaLanding(admin, "meta_ads_landing_pages", organizationId);
  if (!lida) return paginaDeSaida(null);
  // A página de outra oferta manda a própria frase (`frase=`), e o fluxo de palavra-chave começa a conversa certa.
  const config = { ...lida, messageTemplate: modeloComFrase(lida.messageTemplate, parametros.get("frase")) };

  // Sem UTM nenhuma não há o que guardar, e um ref que não aponta para origem
  // alguma só suja a mensagem do lead. A pessoa vai para o WhatsApp do mesmo
  // jeito, sem ref.
  if (Object.keys(utm).length === 0) {
    logger.warn("[anuncios.meta.landing] hit sem UTM", { org });
    return paginaDeSaida(whatsAppUrl(config.whatsappE164, textoSemRef(config.messageTemplate)));
  }

  // `__ip`/`__ua` não vêm da página: são do pedido. Ficam junto da query para a VENDA, dias depois, sair com o
  // mesmo navegador e IP do clique — é o que sobe a qualidade da correspondência na Meta (20/10/2026).
  const ua = req.headers.get("user-agent")?.slice(0, 400) ?? null;
  const queryRaw: Record<string, string> = {
    ...Object.fromEntries(parametros.entries()),
    ...(ip ? { __ip: ip.slice(0, 64) } : {}),
    ...(ua ? { __ua: ua } : {}),
  };
  const criado = await criarClickRef(admin, "meta_ads_click_refs", organizationId, {
    utm,
    query_raw: queryRaw,
  });
  // O LEAD PELO SERVIDOR, com o MESMO id do evento do navegador (`_eid`, gerado pela página): o que o bloqueador
  // ou o iPhone cortou do pixel chega por aqui, e a Meta deduplica o que vier pelos dois.
  await leadPeloServidor(admin, organizationId, parametros, { ip, ua, pagina: req.headers.get("referer"), origem: new URL(req.url).origin });
  if (!criado) {
    // Falha ao gravar: mesma régua — a pessoa não paga o preço de um erro
    // nosso, só a atribuição é que se perde.
    return paginaDeSaida(whatsAppUrl(config.whatsappE164, textoSemRef(config.messageTemplate)));
  }

  const mensagem = config.messageTemplate.replaceAll("{token}", criado.token);
  return paginaDeSaida(whatsAppUrl(config.whatsappE164, mensagem));
}
