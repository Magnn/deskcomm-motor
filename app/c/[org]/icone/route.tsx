/**
 * O ÍCONE DO APP DA ÁREA — aba do navegador (`layout.tsx`) e tela de início do celular de quem instalou
 * a área (`manifest/route.ts`). Desenhado na hora: a lua crescente e a estrela douradas da área sobre o
 * céu noturno, que nasce na cor da empresa. É o mesmo símbolo do cabeçalho e da carta do dia, e continua
 * legível em 16 px — a inicial num círculo virava um borrão na aba.
 *
 * Sem rede e sem arquivo: o logo da empresa é texto livre e buscá-lo aqui seria uma requisição de saída a
 * cada pedido.
 *
 * `?t=192` ou `?t=512` (padrão 512).
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ org: string }> };

/** A cor da empresa entra no desenho só se for um hex de 6 dígitos; senão, a cor padrão da área. */
export function corDoIcone(cor: string | null | undefined): string {
  return cor && /^#[0-9a-f]{6}$/i.test(cor) ? cor : COR_PADRAO_DA_AREA;
}

/** O desenho (viewBox 64): lua recortada por máscara e a estrela de 4 pontas no vão da crescente. */
function Desenho({ cor, lado }: { cor: string; lado: number }) {
  return (
    <svg width={lado} height={lado} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity={0.55} />
          <stop offset="1" stopColor="#140d26" />
        </linearGradient>
        <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe7a8" />
          <stop offset="1" stopColor="#d9a94a" />
        </linearGradient>
        <mask id="m">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="40" cy="25" r="17" fill="#000" />
        </mask>
      </defs>
      <rect width="64" height="64" fill="#140d26" />
      <rect width="64" height="64" fill="url(#c)" />
      <circle cx="29" cy="33" r="19" fill="url(#o)" mask="url(#m)" />
      <path d="M44 15l2.6 7.4 7.4 2.6-7.4 2.6-2.6 7.4-2.6-7.4-7.4-2.6 7.4-2.6z" fill="url(#o)" />
    </svg>
  );
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  if (!org) return new Response("não encontrada", { status: 404 });
  const lado = req.nextUrl.searchParams.get("t") === "192" ? 192 : 512;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <Desenho cor={corDoIcone(org.config.cor)} lado={lado} />
      </div>
    ),
    { width: lado, height: lado, headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
