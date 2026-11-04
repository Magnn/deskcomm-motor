/**
 * A IDENTIDADE da área em TODA página `/c/<org>/...` — aba, prévia de link e app instalado são da EMPRESA,
 * nunca do produto. Sem isto, as páginas herdavam o layout raiz: o quiz para onde o anúncio leva aparecia
 * como "AcassIA — atendimento e vendas por WhatsApp…", com a descrição e a imagem do produto, na aba e na
 * prévia do link compartilhado no WhatsApp.
 *
 * O ícone mora aqui, e não em cada página, porque `icons` declarado numa página SUBSTITUI o objeto inteiro
 * herdado: `page.tsx` declarava só `apple`, e a aba ficava sem favicon.
 *
 * A base dos endereços absolutos (`og:image`) é o domínio por onde a pessoa chegou: a área responde também
 * pelo domínio próprio da empresa, e a prévia não deve apontar para o domínio do sistema.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";

import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { createAdminClient } from "@/lib/supabase/admin";

type Props = { params: Promise<{ org: string }>; children: React.ReactNode };

/** O domínio da requisição, se tiver forma de domínio; senão nenhum (fica a base do layout raiz). */
export function baseDoDominio(host: string | null): URL | undefined {
  const h = (host ?? "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?$/.test(h) ? new URL(`https://${h}`) : undefined;
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { org: slug } = await params;
  const icone = `/c/${encodeURIComponent(slug)}/icone?t=192`;
  const icons = { icon: [{ url: icone, type: "image/png", sizes: "192x192" }], apple: icone };
  const org = await orgDaArea(createAdminClient(), slug).catch(() => null);
  if (!org) return { icons };
  const nome = org.config.titulo || org.nome;
  const descricao = org.config.boas_vindas || `A sua área em ${nome}.`;
  const imagem = { url: `/c/${encodeURIComponent(org.slug)}/icone?t=512`, width: 512, height: 512, alt: nome };
  return {
    metadataBase: baseDoDominio((await headers()).get("host")),
    title: { default: nome, template: `%s · ${nome}` },
    description: descricao,
    applicationName: nome,
    authors: null,
    keywords: null,
    openGraph: { type: "website", siteName: nome, title: nome, description: descricao, images: [imagem] },
    twitter: { card: "summary", title: nome, description: descricao, images: [imagem.url] },
    manifest: `/c/${org.slug}/manifest`,
    icons,
  };
}

export default function LayoutDaArea({ children }: Props) {
  return children;
}
