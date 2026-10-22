/**
 * /c/[org]/sinastria — o quiz "Vocês combinam?", vendido direto na página (migration 0942).
 *
 * A pessoa chega pelo anúncio, responde, vê a prévia calculada (os signos e os elementos), paga pela Stripe e lê
 * "O Código da Conexão" aqui mesmo. Sem WhatsApp e sem área: o resultado abre pelo segredo do pedido, guardado no
 * navegador. O pixel é o do quiz (`config.sinastria_quiz.pixel_id`), separado do pixel do atendimento.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { urlDaMidiaDaArea } from "@/lib/area-do-cliente/midia";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { PERGUNTAS_DO_QUIZ } from "@/lib/area-do-cliente/sinastria";
import { traduzir } from "@/lib/i18n/dicionario";
import { baseDoStorage } from "@/lib/branding/logo";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { createAdminClient } from "@/lib/supabase/admin";

import { serifDaArea } from "../_fonte";
import { FotoDaGuia } from "../_quiz-pecas";
import { CEU, PAGINA, SERIF, SOBRETITULO_NOTURNO } from "../_tema";
import { QuizDaSinastria } from "./_quiz";
import { textosDoQuiz } from "./_textos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Vocês combinam? O Código da Conexão",
    description: "Descubra o que os signos de vocês dois mostram sobre a relação.",
    robots: { index: false, follow: false },
  };
}

export default async function PaginaDoQuiz({ params }: Props) {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  const oferta = org?.config.sinastria_quiz;
  if (!org || !oferta?.ativo) notFound();
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const idioma = await idiomaDoVisitante(null);
  const tx = textosDoQuiz((texto) => traduzir(texto, idioma));
  const base = baseDoStorage();
  const fotoDaGuia = urlDaMidiaDaArea(org.config.guia?.foto, base);

  return (
    <main className={`${PAGINA} ${serifDaArea.variable}`}>
      <section className={`${CEU} px-5 pb-10 pt-12 text-center`}>
        {fotoDaGuia ? (
          <div className="mb-4 flex justify-center">
            <FotoDaGuia url={fotoDaGuia} nome={org.config.guia?.nome} tamanho={96} />
          </div>
        ) : null}
        <p className={SOBRETITULO_NOTURNO}>{org.config.titulo || org.nome}</p>
        <h1 className={`${SERIF} mx-auto mt-3 max-w-xl text-4xl leading-tight text-[#f6e3a8]`}>{tx.titulo}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#c3bad3]">
          {tx.chamada}
        </p>
        <p className="mx-auto mt-2 max-w-md text-xs text-[#9d94b2]">{tx.tempoDoQuiz}</p>
      </section>
      <QuizDaSinastria
        slug={org.slug}
        cor={cor}
        precoCents={oferta.preco_cents}
        precosInternacionais={oferta.precos_internacionais ?? []}
        pixelId={oferta.pixel_id ?? null}
        perguntas={PERGUNTAS_DO_QUIZ.map((p) => ({ id: p.id, capitulo: p.capitulo, texto: p.texto, opcoes: [...p.opcoes] }))}
        tx={tx}
        guia={{ nome: org.config.guia?.nome ?? null, foto: fotoDaGuia }}
        videoMeio={urlDaMidiaDaArea(oferta.video_meio, base)}
        videoPrevia={urlDaMidiaDaArea(oferta.video_previa, base)}
      />
      <footer className="px-5 pb-10 text-center text-xs leading-relaxed text-[#9d94b2]">
        {tx.rodape}
      </footer>
    </main>
  );
}
