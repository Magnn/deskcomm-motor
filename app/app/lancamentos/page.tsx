import type { Metadata } from "next";

import { ListaDeLancamentos } from "./_client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lançamentos" };

export default function LancamentosPage() {
  // Auth e organização já vêm garantidas pelo layout de /app; a lista carrega
  // pela API, que confere o papel por conta própria.
  return <ListaDeLancamentos />;
}
