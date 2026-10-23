import { ImageResponse } from "next/og";

import { marcaDaSaida, NEUTROS_DE_SAIDA } from "@/lib/branding/saida";

/**
 * A imagem de compartilhamento (Open Graph) — o cartão que aparece quando o link é colado no WhatsApp,
 * LinkedIn ou X, e que buscadores usam como miniatura. Desenhada em runtime com a marca da instalação,
 * pelo mesmo motivo do `app/icon.tsx` (uma imagem Docker para todas as marcas; nada em `public/`).
 */
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Atendimento e vendas no WhatsApp com agentes de IA";

const CHAMADA = "Seu WhatsApp atendendo e vendendo o dia inteiro.";
const APOIO = "Agentes de IA que respondem na hora, conduzem até o pagamento e chamam sua equipe quando precisa.";

export default async function ImagemDeCompartilhamento() {
  const marca = await marcaDaSaida(null);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: NEUTROS_DE_SAIDA.fundo,
          color: NEUTROS_DE_SAIDA.texto,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: marca.accent,
              color: marca.accentFg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
            }}
          >
            {marca.nome.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ fontSize: 44 }}>{marca.nome}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, letterSpacing: -2 }}>
            {CHAMADA}
          </div>
          <div style={{ fontSize: 32, color: NEUTROS_DE_SAIDA.suave }}>
            {APOIO}
          </div>
        </div>
        <div style={{ display: "flex", height: 10, width: 240, background: marca.accent, borderRadius: 5 }} />
      </div>
    ),
    { ...size, headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
