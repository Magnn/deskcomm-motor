/**
 * O ÍCONE DO APP DA ÁREA — aba do navegador (`layout.tsx`) e tela de início do celular de quem instalou
 * a área (`manifest/route.ts`). Desenhado na hora: o símbolo da área (ver `Desenho`) sobre o céu noturno,
 * que nasce na cor da empresa. Legível em 16 px — a inicial num círculo virava um borrão na aba. A lua com
 * estrela, que veio antes, foi trocada: é o símbolo do Islã e da bandeira da Turquia.
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

/**
 * O desenho (viewBox 64): dois círculos que se cruzam — duas pessoas — e só a interseção acesa, com a
 * estrela-guia dentro. A resposta mora no "entre" (a vesica piscis da geometria sagrada). Os anéis ficam
 * suaves para não lerem como aliança; em 16 px sobra uma amêndoa dourada entre dois arcos.
 */
function Desenho({ cor, lado }: { cor: string; lado: number }) {
  return (
    <svg width={lado} height={lado} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="c" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={cor} stopOpacity={0.5} />
          <stop offset="1" stopColor="#0d0919" />
        </linearGradient>
        <linearGradient id="o" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9b0" />
          <stop offset="1" stopColor="#d6a443" />
        </linearGradient>
        <clipPath id="k">
          <circle cx="24.5" cy="32" r="15.5" />
        </clipPath>
      </defs>
      <rect width="64" height="64" fill="#140d26" />
      <rect width="64" height="64" fill="url(#c)" />
      <circle cx="24.5" cy="32" r="15.5" fill="none" stroke="#e8c574" strokeOpacity={0.62} strokeWidth={3.2} />
      <circle cx="39.5" cy="32" r="15.5" fill="none" stroke="#e8c574" strokeOpacity={0.62} strokeWidth={3.2} />
      <circle cx="39.5" cy="32" r="17.1" fill="url(#o)" clipPath="url(#k)" />
      <path d="M32 24.6l2 5.4 5.4 2-5.4 2-2 5.4-2-5.4-5.4-2 5.4-2z" fill="#1a1030" />
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
