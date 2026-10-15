/**
 * /c/[org]/presente/[codigo] — a página de quem GANHOU uma pergunta de tarô.
 *
 * Sem cadastro: o código do link é o direito a UMA pergunta. Presente que não
 * existe ou ainda não foi pago responde "não encontrado". No fim, o convite
 * para conhecer a empresa pelo WhatsApp — quem chega por presente é cliente
 * novo que veio por indicação, sem anúncio.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { FORMA_DO_CODIGO_DO_PRESENTE } from "@/lib/area-do-cliente/presente";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { createAdminClient } from "@/lib/supabase/admin";

import { PerguntaDoPresente } from "../../_ofertas";
import type { TextosDaArea } from "../../_client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string; codigo: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const idioma = await idiomaDoVisitante(null);
  return { title: traduzir("Seu presente", idioma), robots: { index: false, follow: false } };
}

export default async function PaginaDoPresente({ params }: Props) {
  const { org: slug, codigo } = await params;
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org || !FORMA_DO_CODIGO_DO_PRESENTE.test(codigo)) notFound();
  const { data } = await admin
    .from("area_presentes")
    .select("para_nome, pago_at, pergunta, resposta, de_contact_id")
    .eq("organization_id", org.id)
    .eq("codigo", codigo)
    .maybeSingle();
  const p = data as { para_nome: string | null; pago_at: string | null; pergunta: string | null; resposta: string | null } | null;
  if (!p?.pago_at) notFound();

  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const tx = {
    naoFoiPossivel: t("Não foi possível agora. Tente de novo."),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
    perguntaExemplo: t("Ex.: o que preciso olhar no meu relacionamento agora?"),
    perguntar: t("Perguntar às cartas"),
    consultando: t("Tirando a sua carta…"),
    respostaChegando: t("Sua resposta está sendo preparada. Volte daqui a pouco."),
    tentarDeNovo: t("Tentar de novo"),
  } as TextosDaArea;

  return (
    <main className="min-h-screen bg-[#f7f5fb] pb-16 text-[#1c1f24]">
      <header className="px-4 pb-8 pt-10 text-white" style={{ background: cor }}>
        <div className="mx-auto max-w-xl">
          <p className="text-sm opacity-80">{org.config.titulo || org.nome}</p>
          <h1 className="mt-1 text-2xl font-semibold">
            🎁 {p.para_nome ? `${p.para_nome}, ${t("você ganhou um presente")}` : t("Você ganhou um presente")}
          </h1>
          <p className="mt-2 text-sm opacity-90">{t("Uma pergunta para as cartas. Escreva com calma o que você quer entender agora.")}</p>
        </div>
      </header>
      <div className="mx-auto -mt-4 max-w-xl space-y-4 px-4">
        <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="presente-pergunta">
          <PerguntaDoPresente slug={org.slug} codigo={codigo} cor={cor} tx={tx} inicial={{ pergunta: p.pergunta, resposta: p.resposta }} />
        </section>
        {org.config.whatsapp ? (
          <a
            href={`https://wa.me/${org.config.whatsapp}`}
            className="block rounded-2xl bg-[#25d366] px-5 py-4 text-center font-semibold text-white shadow-sm"
          >
            {t("Quero conhecer mais pelo WhatsApp")}
          </a>
        ) : null}
      </div>
    </main>
  );
}
