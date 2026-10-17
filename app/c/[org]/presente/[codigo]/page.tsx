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
import { Gift, MessageCircle } from "lucide-react";

import { PerguntaDoPresente } from "../../_ofertas";
import type { TextosDaArea } from "../../_client";
import { serifDaArea } from "../../_fonte";
import { CARTAO, CEU, PAGINA, SERIF, SOBRETITULO_NOTURNO } from "../../_tema";

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
    <main className={`${serifDaArea.variable} ${PAGINA} pb-16`}>
      <header className={`${CEU} px-5 pb-24 pt-12`}>
        <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 70% at 50% -10%, ${cor}8c, transparent 70%)` }} />
        <div className="relative mx-auto max-w-xl">
          <p className={SOBRETITULO_NOTURNO}>{org.config.titulo || org.nome}</p>
          <Gift className="mt-5 size-10 text-[#e2c47a]" strokeWidth={1.25} aria-hidden />
          <h1 className={`${SERIF} mt-3 text-[34px] leading-tight`}>
            {p.para_nome ? `${p.para_nome}, ${t("você ganhou um presente")}` : t("Você ganhou um presente")}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[#d9d0e6]">{t("Uma pergunta para as cartas. Escreva com calma o que você quer entender agora.")}</p>
        </div>
      </header>
      <div className="relative mx-auto -mt-14 max-w-xl space-y-4 px-4">
        <section className={CARTAO} data-testid="presente-pergunta">
          <PerguntaDoPresente slug={org.slug} codigo={codigo} cor={cor} tx={tx} inicial={{ pergunta: p.pergunta, resposta: p.resposta }} />
        </section>
        {org.config.whatsapp ? (
          <a
            href={`https://wa.me/${org.config.whatsapp}`}
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(31,157,85,0.8)]"
          >
            <MessageCircle className="size-5" aria-hidden />
            {t("Quero conhecer mais pelo WhatsApp")}
          </a>
        ) : null}
      </div>
    </main>
  );
}
