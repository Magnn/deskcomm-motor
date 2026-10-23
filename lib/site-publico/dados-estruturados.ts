import type { Guia } from "./guias";
import type { FatosDoServico } from "./site";

/**
 * Dados estruturados (schema.org em JSON-LD) do site público. É por eles que buscadores e assistentes
 * de IA ligam o NOME do serviço a uma entidade — organização, software, preço, perguntas — em vez de
 * adivinhar pelo texto da página.
 */

export function jsonLdDaPaginaInicial(fatos: FatosDoServico, perguntas: readonly { pergunta: string; resposta: string }[]) {
  const org = `${fatos.url}/#organizacao`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": org,
        name: fatos.nome,
        url: fatos.url,
        logo: `${fatos.url}/icon`,
        description: fatos.resumo,
        areaServed: { "@type": "Country", name: fatos.pais },
      },
      {
        "@type": "WebSite",
        "@id": `${fatos.url}/#site`,
        name: fatos.nome,
        url: fatos.url,
        inLanguage: "pt-BR",
        publisher: { "@id": org },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${fatos.url}/#software`,
        name: fatos.nome,
        url: fatos.url,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: fatos.categoria,
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        description: fatos.resumo,
        featureList: fatos.recursos,
        publisher: { "@id": org },
        offers: fatos.planos.map((p) => ({
          "@type": "Offer",
          name: p.nome,
          price: (p.precoCentavos / 100).toFixed(2),
          priceCurrency: "BRL",
          url: `${fatos.url}/#planos`,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: (p.precoCentavos / 100).toFixed(2),
            priceCurrency: "BRL",
            unitCode: "MON",
          },
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${fatos.url}/#perguntas`,
        mainEntity: perguntas.map((q) => ({
          "@type": "Question",
          name: q.pergunta,
          acceptedAnswer: { "@type": "Answer", text: q.resposta },
        })),
      },
    ],
  };
}

export function jsonLdDoGuia(fatos: FatosDoServico, guia: Guia) {
  const url = `${fatos.url}/guias/${guia.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#artigo`,
        headline: guia.titulo,
        description: guia.descricao,
        inLanguage: "pt-BR",
        url,
        mainEntityOfPage: url,
        dateModified: guia.atualizadoEm,
        datePublished: guia.atualizadoEm,
        author: { "@type": "Organization", name: fatos.nome, url: fatos.url },
        publisher: { "@id": `${fatos.url}/#organizacao`, "@type": "Organization", name: fatos.nome },
        about: { "@id": `${fatos.url}/#software` },
      },
      {
        "@type": "FAQPage",
        mainEntity: guia.perguntas.map((q) => ({
          "@type": "Question",
          name: q.pergunta,
          acceptedAnswer: { "@type": "Answer", text: q.resposta },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: fatos.nome, item: fatos.url },
          { "@type": "ListItem", position: 2, name: "Guias", item: `${fatos.url}/guias` },
          { "@type": "ListItem", position: 3, name: guia.titulo, item: url },
        ],
      },
    ],
  };
}

/** `<` escapado: o JSON vai dentro de `<script>`, e um `</script>` num texto fecharia a tag. */
export function serializarJsonLd(dado: unknown): string {
  return JSON.stringify(dado).replace(/</g, "\\u003c");
}
