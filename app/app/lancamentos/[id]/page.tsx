import type { Metadata } from "next";

import { DetalheDoLancamento } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lançamento" };

export default async function LancamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalheDoLancamento id={id} />;
}
