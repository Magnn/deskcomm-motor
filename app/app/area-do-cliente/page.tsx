import type { Metadata } from "next";

import { PainelDaAreaDoCliente } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Área do cliente" };

export default function AreaDoClientePage() {
  // Auth e organização já vêm garantidas pelo layout de /app; cada aba carrega
  // pela API, que confere o papel por conta própria.
  return <PainelDaAreaDoCliente />;
}
