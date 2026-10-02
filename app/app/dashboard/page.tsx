import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { DashboardClient } from "./_components/DashboardClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Dashboard",
  description: "Visão geral de vendas, faturamento, conversão e métricas de atendimento.",
};

export default async function DashboardPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);

  if (!activeOrg) {
    redirect("/app");
  }

  return <DashboardClient orgName={activeOrg.name} />;
}
