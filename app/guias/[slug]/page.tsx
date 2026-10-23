import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { JsonLd } from "@/app/_landing/JsonLd";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { jsonLdDoGuia } from "@/lib/site-publico/dados-estruturados";
import { guiaPorSlug } from "@/lib/site-publico/guias";
import { fatosDoServico, robotsDaPaginaPublica, siteIndexavel } from "@/lib/site-publico/site";

import { MolduraDosGuias } from "../_moldura";

type Props = { params: Promise<{ slug: string }> };

/** Um guia do site público: resposta curta no topo, seções e perguntas (que viram `FAQPage`). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const fatos = fatosDoServico();
  const guia = guiaPorSlug(fatos, slug);
  if (!guia) return {};
  const url = `/guias/${guia.slug}`;
  return {
    title: { absolute: `${guia.titulo} · ${fatos.nome}` },
    description: guia.descricao,
    alternates: { canonical: url },
    robots: robotsDaPaginaPublica(),
    openGraph: {
      type: "article",
      locale: "pt_BR",
      url,
      siteName: fatos.nome,
      title: guia.titulo,
      description: guia.descricao,
      modifiedTime: guia.atualizadoEm,
    },
    twitter: { card: "summary_large_image", title: guia.titulo, description: guia.descricao },
  };
}

export default async function PaginaDoGuia({ params }: Props) {
  if (!siteIndexavel()) notFound();
  const { slug } = await params;
  const fatos = fatosDoServico();
  const guia = guiaPorSlug(fatos, slug);
  if (!guia) notFound();
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const atualizado = new Date(`${guia.atualizadoEm}T12:00:00Z`).toLocaleDateString(tagDeIdioma(idioma), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <MolduraDosGuias t={t}>
      <JsonLd dado={jsonLdDoGuia(fatos, guia)} />
      <article className="px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Link href="/guias" className="text-sm text-text-subtle hover:text-text">
            {t("Guias")}
          </Link>
          <h1 className="mt-4 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-5xl">{guia.titulo}</h1>
          <p className="mt-3 text-xs text-text-subtle">
            {t("Atualizado em")} <time dateTime={guia.atualizadoEm}>{atualizado}</time>
          </p>
          <div className="mt-8 rounded-xl border border-accent bg-accent-soft p-5">
            <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("Resposta curta")}</p>
            <p className="mt-2 text-base leading-7">{guia.resposta}</p>
          </div>
          {guia.secoes.map((s) => (
            <section key={s.titulo} className="mt-10">
              <h2 className="text-2xl font-bold tracking-[-0.035em]">{s.titulo}</h2>
              {s.paragrafos.map((p) => (
                <p key={p} className="mt-3 text-base leading-7 text-text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
          <section className="mt-12">
            <h2 className="text-2xl font-bold tracking-[-0.035em]">{t("Perguntas frequentes")}</h2>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {guia.perguntas.map((q) => (
                <div key={q.pergunta} className="py-5">
                  <dt className="font-bold">{q.pergunta}</dt>
                  <dd className="mt-2 text-sm leading-6 text-text-muted">{q.resposta}</dd>
                </div>
              ))}
            </dl>
          </section>
          <div className="mt-12 flex flex-col items-start gap-4 rounded-xl bg-accent p-8 text-accent-foreground">
            <p className="text-xl font-bold tracking-[-0.03em]">{t("Comece hoje, pague só quando conectar.")}</p>
            <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg bg-surface px-5 text-sm font-bold text-text">
              {t("Criar conta grátis")}
            </Link>
          </div>
        </div>
      </article>
    </MolduraDosGuias>
  );
}
