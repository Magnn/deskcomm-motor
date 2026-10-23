import { serializarJsonLd } from "@/lib/site-publico/dados-estruturados";

/** Um bloco JSON-LD. Conteúdo vem do servidor e passa por `serializarJsonLd`, que escapa `<`. */
export function JsonLd({ dado }: { dado: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializarJsonLd(dado) }} />;
}
