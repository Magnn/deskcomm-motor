/**
 * /c/[org]/quiz/[tipo] — os quizzes de uma pessoa, vendidos direto na página (migration 0943):
 * `prosperidade` ("Qual é o seu número da prosperidade?") e `caminhos` ("O que abre os seus caminhos?").
 * Mesmo desenho do quiz da sinastria (`../../sinastria`): prévia calculada, pagamento pela Stripe e a leitura
 * aqui mesmo, aberta pelo segredo do pedido guardado no navegador. Cada quiz tem o seu pixel.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { PERGUNTAS_DA_PROSPERIDADE, PERGUNTAS_DO_PAR, PERGUNTAS_DOS_CAMINHOS, TIPOS_DE_QUIZ, type TipoDeQuiz } from "@/lib/area-do-cliente/quizzes";
import { urlDaMidiaDaArea } from "@/lib/area-do-cliente/midia";
import { dadosDaRetomada } from "@/lib/area-do-cliente/recuperacao-do-quiz";
import { orgDaArea } from "@/lib/area-do-cliente/sessao";
import { dicionarioDosQuizzes } from "@/lib/area-do-cliente/textos-dos-quizzes";
import { traduzirNaArea } from "@/lib/i18n/area";
import { baseDoStorage } from "@/lib/branding/logo";
import { idiomaDaArea } from "@/lib/i18n/area-servidor";
import { createAdminClient } from "@/lib/supabase/admin";

import { serifDaArea } from "../../_fonte";
import { depoimentosDoQuiz, outrasLeituras } from "../../_outras-leituras";
import { FotoDaGuia } from "../../_quiz-pecas";
import { CEU, PAGINA, SERIF, SOBRETITULO_NOTURNO } from "../../_tema";
import { QuizDePessoa } from "./_quiz";
import { textosDoQuizDePessoa } from "./_textos";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string; tipo: string }>; searchParams: Promise<{ retomar?: string; k?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function PaginaDoQuizDePessoa({ params, searchParams }: Props) {
  const { org: slug, tipo: bruto } = await params;
  if (!(TIPOS_DE_QUIZ as readonly string[]).includes(bruto)) notFound();
  const tipo = bruto as TipoDeQuiz;
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  const oferta = org ? { prosperidade: org.config.quiz_prosperidade, caminhos: org.config.quiz_caminhos, par: org.config.quiz_par }[tipo] : undefined;
  if (!org || !oferta?.ativo) notFound();
  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  // O link do e-mail da recuperação (0960): a prévia reabre com o que a pessoa já tinha dado.
  const { retomar, k } = await searchParams;
  const retomada = retomar ? await dadosDaRetomada(admin, org.id, tipo, retomar, k) : null;
  const idioma = await idiomaDaArea();
  const tx = textosDoQuizDePessoa((texto) => traduzirNaArea(texto, idioma), tipo);
  const base = baseDoStorage();
  const fotoDaGuia = urlDaMidiaDaArea(org.config.guia?.foto, base);
  const perguntas =
    tipo === "caminhos"
      ? PERGUNTAS_DOS_CAMINHOS.map((p) => ({ id: p.id, capitulo: p.capitulo, texto: p.texto, opcoes: p.opcoes.map(([o]) => o) }))
      : tipo === "par"
        ? PERGUNTAS_DO_PAR.map((p) => ({ ...p, opcoes: [...p.opcoes], rotulos: p.rotulos ? ([...p.rotulos] as [string, string]) : undefined }))
        : PERGUNTAS_DA_PROSPERIDADE.map((p) => ({ id: p.id, capitulo: p.capitulo, texto: p.texto, opcoes: [...p.opcoes] }));

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
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#c3bad3]">{tx.chamada}</p>
        <p className="mx-auto mt-2 max-w-md text-xs text-[#9d94b2]">{tx.tempoDoQuiz}</p>
      </section>
      <QuizDePessoa slug={org.slug} tipo={tipo} cor={cor} precoCents={oferta.preco_cents} retomada={retomada}
        precosInternacionais={oferta.precos_internacionais ?? []}
        pixelId={oferta.pixel_id ?? null} perguntas={perguntas} tx={tx}
        trad={dicionarioDosQuizzes((texto) => traduzirNaArea(texto, idioma))} minusculas={idioma !== "de"}
        guia={{ nome: org.config.guia?.nome ?? null, foto: fotoDaGuia }}
        videoMeio={urlDaMidiaDaArea(oferta.video_meio, base)}
        videoPrevia={urlDaMidiaDaArea(oferta.video_previa, base)}
        depoimentos={depoimentosDoQuiz(org.config, tipo, base)}
        outras={outrasLeituras(org.config, org.slug, tipo, (texto) => traduzirNaArea(texto, idioma))} />
      <footer className="px-5 pb-10 text-center text-xs leading-relaxed text-[#9d94b2]">{tx.rodape}</footer>
    </main>
  );
}
