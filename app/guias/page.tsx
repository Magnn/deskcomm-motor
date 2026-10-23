import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { guias } from "@/lib/site-publico/guias";
import { fatosDoServico, robotsDaPaginaPublica, siteIndexavel } from "@/lib/site-publico/site";

import { MolduraDosGuias } from "./_moldura";

/**
 * Índice dos guias do site público. Só existe onde a instalação vende o serviço (`siteIndexavel`);
 * no resto é 404. Os guias moram em `lib/site-publico/guias.ts`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { nome } = fatosDoServico();
  const titulo = `Guias de atendimento e vendas no WhatsApp com IA · ${nome}`;
  const descricao = "Respostas diretas sobre agente de IA no WhatsApp, API oficial, custos e como escolher uma plataforma.";
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: "/guias" },
    robots: robotsDaPaginaPublica(),
    openGraph: { type: "website", locale: "pt_BR", url: "/guias", siteName: nome, title: titulo, description: descricao },
  };
}

export default async function IndiceDosGuias() {
  if (!siteIndexavel()) notFound();
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const lista = guias(fatosDoServico());
  return (
    <MolduraDosGuias t={t}>
      <section className="px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-4xl font-bold tracking-[-0.05em] sm:text-5xl">{t("Guias")}</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-muted">
            {t("Respostas diretas sobre atendimento e vendas no WhatsApp com inteligência artificial.")}
          </p>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {lista.map((g) => (
              <li key={g.slug} className="rounded-xl border border-border bg-surface p-6">
                <h2 className="text-lg font-bold tracking-tight">
                  <Link href={`/guias/${g.slug}`} className="hover:text-accent">
                    {g.titulo}
                  </Link>
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-muted">{g.descricao}</p>
                <Link href={`/guias/${g.slug}`} className="mt-4 inline-block text-sm font-bold text-accent">
                  {t("Ler o guia")}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </MolduraDosGuias>
  );
}
