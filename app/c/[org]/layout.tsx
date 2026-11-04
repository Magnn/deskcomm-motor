/**
 * Ícone da aba em TODA a área (`/c/<org>/...`): o mesmo desenho do app instalado (`icone/route.tsx`),
 * com a inicial e a cor da empresa.
 *
 * Mora no layout, e não em cada página, porque `icons` declarado numa página SUBSTITUI o objeto inteiro
 * herdado: `page.tsx` declarava só `apple`, e a aba da área ficava sem favicon (o navegador caía em
 * `/favicon.ico`, que dá 404). As outras páginas (quiz, plano, sinastria…) herdavam o ícone do produto.
 * Só o slug entra na URL — quem resolve a empresa é a rota do ícone, sem consulta extra aqui.
 */
import type { Metadata } from "next";

type Props = { params: Promise<{ org: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { org } = await params;
  const icone = `/c/${encodeURIComponent(org)}/icone?t=192`;
  return { icons: { icon: [{ url: icone, type: "image/png", sizes: "192x192" }], apple: icone } };
}

export default function LayoutDaArea({ children }: Props) {
  return children;
}
