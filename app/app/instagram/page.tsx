import type { Metadata } from "next";

import { InstagramComentarios } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Instagram" };

type Props = { searchParams: Promise<{ conectado?: string; erro?: string }> };

export default async function InstagramPage({ searchParams }: Props) {
  // Auth e organização já vêm garantidas pelo layout de /app; os dados carregam
  // pela API, que confere o papel por conta própria. `conectado`/`erro` são o
  // recado da volta do consentimento do Instagram.
  const { conectado, erro } = await searchParams;
  return <InstagramComentarios conectado={conectado ?? null} erro={erro ?? null} />;
}
