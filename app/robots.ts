import type { MetadataRoute } from "next";

import { siteIndexavel, urlDoSite } from "@/lib/site-publico/site";

/**
 * `/robots.txt`. Instalação que não vende o serviço fecha tudo (ver `siteIndexavel`).
 *
 * Os robôs de IA aparecem pelo NOME, liberados no site público: é por eles que ChatGPT, Claude,
 * Perplexity, Gemini e Copilot leem a página e passam a citar o serviço. Bloqueá-los (o padrão de
 * muito CDN) é sumir das respostas das IAs.
 */
const ROBOS_DE_IA = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "meta-externalagent",
  "Amazonbot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
];

const FECHADO = ["/app", "/admin", "/api/", "/c/", "/auth", "/onboarding", "/team", "/g/", "/webchat", "/login", "/design", "/vitrine-agenda"];

export default function robots(): MetadataRoute.Robots {
  if (!siteIndexavel()) return { rules: [{ userAgent: "*", disallow: "/" }] };
  const url = urlDoSite();
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: FECHADO },
      { userAgent: ROBOS_DE_IA, allow: ["/", "/llms.txt", "/llms-full.txt", "/guias"], disallow: FECHADO },
    ],
    sitemap: `${url}/sitemap.xml`,
    host: url,
  };
}
