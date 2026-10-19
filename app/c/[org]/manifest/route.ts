/**
 * O MANIFESTO DO APP DA ÁREA — o que faz "Adicionar à tela de início" virar um app com o nome e o ícone da
 * empresa, abrindo em tela cheia direto na área (e não no CRM). Por empresa: `/c/<slug>/manifest`.
 *
 * No iPhone, o aviso no celular SÓ funciona com a área instalada assim (exigência do iOS 16.4+).
 */
import { NextResponse, type NextRequest } from "next/server";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ org: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  if (!org) return new NextResponse("não encontrada", { status: 404 });
  const titulo = org.config.titulo || org.nome;
  const base = `/c/${org.slug}`;
  // `finalidade` é o campo `purpose` do manifesto (ícone recortável), não um ponto de IA.
  const icone = (lado: 192 | 512, finalidade?: "maskable") => ({
    src: `${base}/icone?t=${lado}`,
    sizes: `${lado}x${lado}`,
    type: "image/png",
    ...(finalidade ? { purpose: finalidade } : {}),
  });
  return NextResponse.json(
    {
      id: base,
      name: titulo,
      short_name: titulo.length > 12 ? titulo.split(" ")[0]!.slice(0, 12) : titulo,
      start_url: `${base}?de=app`,
      scope: `${base}/`,
      display: "standalone",
      background_color: "#1b1433",
      theme_color: org.config.cor || COR_PADRAO_DA_AREA,
      icons: [icone(192), icone(512), icone(512, "maskable")],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } },
  );
}
