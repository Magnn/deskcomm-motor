/**
 * /c/[org]/plano — a entrada pelo plano de 7 dias, para quem ainda não tem área (migration 0955,
 * `lib/area-do-cliente/entrada.ts`). Pedido do dono em 03/11/2026: a porta do funil é o plano por R$ 5 / US$ 1 / € 1,
 * com créditos de boas-vindas. A página diz o que vem, o preço e que nada renova sozinho; o pagamento abre a área aqui
 * mesmo, pelo segredo do pedido (`/api/v1/area/publica/[org]/entrada`).
 *
 * Porta: o botão da página de vendas (fora do app, como os quizzes). Quem já tem área renova o plano lá dentro.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { configDosCreditos } from "@/lib/area-do-cliente/creditos-servidor";
import { CREDITOS_DE_BOAS_VINDAS_PADRAO } from "@/lib/area-do-cliente/entrada";
import { urlDaMidiaDaArea } from "@/lib/area-do-cliente/midia";
import { configDoPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { caminhoPublicoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { baseDoStorage } from "@/lib/branding/logo";
import { traduzirNaArea } from "@/lib/i18n/area";
import { idiomaDaArea } from "@/lib/i18n/area-servidor";
import { createAdminClient } from "@/lib/supabase/admin";

import { serifDaArea } from "../_fonte";
import { FotoDaGuia } from "../_quiz-pecas";
import { CEU, PAGINA, SERIF, SOBRETITULO_NOTURNO } from "../_tema";
import { EntradaDoPlano } from "./_entrada";
import { textosDaEntrada } from "./_textos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function PaginaDaEntrada({ params }: Props) {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  if (!org) notFound();
  const plano = configDoPlanoSemanal(org.config.plano_semanal);
  if (!plano.ativo) notFound();
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const idioma = await idiomaDaArea();
  const tx = textosDaEntrada((texto) => traduzirNaArea(texto, idioma));
  // Os créditos só entram na oferta quando a carteira está ligada — senão a página prometeria o que a área não mostra.
  const creditos = configDosCreditos(org.config.creditos).ativo
    ? (org.config.plano_semanal?.creditos_de_entrada ?? CREDITOS_DE_BOAS_VINDAS_PADRAO)
    : 0;
  const fotoDaGuia = urlDaMidiaDaArea(org.config.guia?.foto, baseDoStorage());

  return (
    <main className={`${PAGINA} ${serifDaArea.variable}`}>
      <section className={`${CEU} px-5 pb-8 pt-12 text-center`}>
        {fotoDaGuia ? (
          <div className="mb-4 flex justify-center">
            <FotoDaGuia url={fotoDaGuia} nome={org.config.guia?.nome} tamanho={88} />
          </div>
        ) : null}
        <p className={SOBRETITULO_NOTURNO}>{tx.sobretitulo}</p>
        <h1 className={`${SERIF} mx-auto mt-3 max-w-xl text-4xl leading-tight text-[#f6e3a8]`}>{tx.titulo}</h1>
      </section>
      <EntradaDoPlano
        slug={org.slug}
        area={caminhoPublicoDaArea(org.slug, org.config.apelido)}
        cor={cor}
        precoCents={plano.preco_cents}
        precosInternacionais={plano.precos_internacionais}
        creditos={creditos}
        tx={tx}
      />
      <footer className="px-5 pb-10 text-center text-xs leading-relaxed text-[#9d94b2]">{tx.rodape}</footer>
    </main>
  );
}
