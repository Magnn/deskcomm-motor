/**
 * GET /c/[org]/lua-do-mes — "Sua lua do mês" em imagem (1080×1350, o formato do status do WhatsApp), só para quem
 * está com a sessão da área. As regras moram em `lib/area-do-cliente/lua-do-mes.ts`: nada de pergunta nem de
 * diário na imagem, só números, a carta do mês e o primeiro nome. O rodapé leva o endereço da área.
 */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { diaNoFuso, primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea, origemPublica } from "@/lib/area-do-cliente/http";
import { lerCartas } from "@/lib/area-do-cliente/leituras";
import { nomeDoMes, resumoDaLuaDoMes, temLuaDoMes } from "@/lib/area-do-cliente/lua-do-mes";
import { caminhoPublicoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return new Response("entre na sua área", { status: 401 });

  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const diaDe = (iso: string) => diaNoFuso(iso, org.fuso);
  const mes = diaDe(new Date().toISOString()).slice(0, 7);
  // Um pouco mais que um mês para trás: o filtro fino do mês é por dia no fuso da empresa (`resumoDaLuaDoMes`).
  const desde = new Date(Date.now() - 40 * 86_400_000).toISOString();

  // ⚠️ Filtro de organização e pessoa em toda consulta: o client é service-role.
  const [contatoR, leiturasR, diarioR] = await Promise.all([
    admin.from("contacts").select("name, display_name").eq("id", sessao.contactId).eq("organization_id", org.id).maybeSingle(),
    admin
      .from("area_leituras")
      .select("cartas, created_at")
      .eq("organization_id", org.id)
      .eq("contact_id", sessao.contactId)
      .not("pago_at", "is", null)
      .gte("created_at", desde)
      .limit(200),
    admin
      .from("area_diario")
      .select("created_at")
      .eq("organization_id", org.id)
      .eq("contact_id", sessao.contactId)
      .gte("created_at", desde)
      .limit(500),
  ]);
  const resumo = resumoDaLuaDoMes({
    mes,
    leituras: ((leiturasR.data ?? []) as Array<{ cartas: unknown; created_at: string }>).map((l) => ({
      quando: l.created_at,
      cartas: lerCartas(l.cartas),
    })),
    diario: ((diarioR.data ?? []) as Array<{ created_at: string }>).map((d) => ({ quando: d.created_at })),
    diaDe,
  });
  if (!temLuaDoMes(resumo)) return new Response("ainda sem lua neste mês", { status: 404 });

  const nome = primeiroNome(nomeDoContato(contatoR.data as { name: string | null; display_name: string | null } | null));
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const titulo = org.config.titulo || org.nome;
  const endereco = `${origemPublica(req)}${caminhoPublicoDaArea(org.slug, org.config.apelido)}`.replace(/^https?:\/\//, "");
  const cabecalho = nome ? `${t("A lua de")} ${nome}` : t("Minha lua");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "110px 90px 90px",
          background: "linear-gradient(170deg, #2a1f4d 0%, #1b1433 62%, #120d24 100%)",
          color: "#f6f0e4",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 30, letterSpacing: 8, color: "#c9a54e", textTransform: "uppercase" }}>{titulo}</div>
          <div style={{ marginTop: 40, fontSize: 76, lineHeight: 1.1, textAlign: "center" }}>{cabecalho}</div>
          {/* Um texto só por bloco: o gerador recusa bloco com mais de um filho sem `display: flex`. */}
          <div style={{ marginTop: 14, fontSize: 44, color: "#d9d0e6" }}>{`${t("em")} ${t(nomeDoMes(resumo.mes))}`}</div>
        </div>

        {/* A lua desenhada (dois círculos), não um caractere: a fonte padrão da imagem não garante o ☾. */}
        <div style={{ position: "relative", width: 360, height: 360, display: "flex" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 999,
              background: `radial-gradient(circle, rgba(240,220,168,.35) 0%, ${cor}55 45%, rgba(27,20,51,0) 70%)`,
            }}
          />
          <div style={{ position: "absolute", left: 90, top: 90, width: 180, height: 180, borderRadius: 999, background: "#f0dca8" }} />
          <div style={{ position: "absolute", left: 140, top: 70, width: 170, height: 170, borderRadius: 999, background: "#1f173f" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {resumo.cartaDoMes ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontSize: 30, letterSpacing: 6, color: "#c9a54e", textTransform: "uppercase" }}>{t("A carta do meu mês")}</div>
              <div style={{ marginTop: 12, fontSize: 68, color: "#f0dca8" }}>{t(resumo.cartaDoMes)}</div>
            </div>
          ) : null}
          <div style={{ marginTop: 44, display: "flex", gap: 70, fontSize: 34, color: "#d9d0e6" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 72, color: "#f6f0e4" }}>{resumo.perguntas}</span>
              <span>{resumo.perguntas === 1 ? t("pergunta às cartas") : t("perguntas às cartas")}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 72, color: "#f6f0e4" }}>{resumo.paginas}</span>
              <span>{resumo.paginas === 1 ? t("página no diário") : t("páginas no diário")}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontSize: 28, color: "#b7aecb" }}>
          <span>{t("Faça a sua em")}</span>
          <span style={{ marginTop: 6, fontSize: 32, color: "#f0dca8" }}>{endereco}</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, headers: { "cache-control": "private, no-store" } },
  );
}
