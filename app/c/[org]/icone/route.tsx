/**
 * O ÍCONE DO APP DA ÁREA — o que aparece na tela de início do celular de quem instalou a área. Desenhado
 * na hora (como `app/icon.tsx`): o céu noturno da área, um círculo na cor da empresa e a inicial dela em
 * dourado. Sem rede e sem arquivo: o logo da empresa é texto livre e buscá-lo aqui seria uma requisição
 * de saída a cada pedido.
 *
 * `?t=192` ou `?t=512` (padrão 512).
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { letraDoIcone } from "@/lib/branding/icone";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ org: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  if (!org) return new Response("não encontrada", { status: 404 });
  const lado = req.nextUrl.searchParams.get("t") === "192" ? 192 : 512;
  const letra = letraDoIcone(org.config.titulo || org.nome) ?? "✦";
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #2a1f4d 0%, #1b1433 70%)",
        }}
      >
        <div
          style={{
            width: lado * 0.62,
            height: lado * 0.62,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: cor,
            border: `${Math.round(lado * 0.02)}px solid #e2c47a`,
            color: "#f0dca8",
            fontSize: Math.round(lado * 0.34),
          }}
        >
          {letra}
        </div>
      </div>
    ),
    { width: lado, height: lado, headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
