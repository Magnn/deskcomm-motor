import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { EscalarClient } from "./_components/EscalarClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Escalar",
  description: "Como a operação está hoje, a meta de receita e o plano para chegar nela.",
};

export default async function EscalarPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  return <EscalarClient />;
}
