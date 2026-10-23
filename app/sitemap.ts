import type { MetadataRoute } from "next";

import { guias } from "@/lib/site-publico/guias";
import { fatosDoServico, siteIndexavel, urlDoSite } from "@/lib/site-publico/site";

/** `/sitemap.xml`: só as páginas que o site público quer ver indexadas. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!siteIndexavel()) return [];
  const url = urlDoSite();
  const lista = guias(fatosDoServico());
  const maisRecente = lista.map((g) => g.atualizadoEm).sort().at(-1);
  return [
    { url, changeFrequency: "weekly", priority: 1, lastModified: maisRecente },
    { url: `${url}/guias`, changeFrequency: "weekly", priority: 0.8, lastModified: maisRecente },
    ...lista.map((g) => ({
      url: `${url}/guias/${g.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.7,
      lastModified: g.atualizadoEm,
    })),
  ];
}
