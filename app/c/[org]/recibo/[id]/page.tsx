/**
 * /c/[org]/recibo/[id] — o recibo de uma compra, para quem está na área.
 *
 * Só abre a compra da própria pessoa. Mostra quem vendeu (razão social e CNPJ
 * quando a empresa os cadastrou), o que foi comprado, quando, quanto e como foi
 * pago, e o código do pagamento — o que quem tem medo de golpe precisa ver.
 * Pronto para imprimir ou salvar em PDF pelo navegador.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { nomeDoCookieDaArea, orgDaArea, sessaoDoCookie } from "@/lib/area-do-cliente/sessao";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { createAdminClient } from "@/lib/supabase/admin";

import { serifDaArea } from "../../_fonte";
import { CARTAO, PAGINA, SERIF, SOBRETITULO } from "../../_tema";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string; id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const idioma = await idiomaDoVisitante(null);
  return { title: traduzir("Recibo", idioma), robots: { index: false, follow: false } };
}

export default async function Recibo({ params }: Props) {
  const { org: slug, id } = await params;
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org || !UUID.test(id)) notFound();
  const sessao = await sessaoDoCookie(admin, org, (await cookies()).get(nomeDoCookieDaArea(org.slug))?.value);
  if (!sessao) redirect(caminhoDaArea(org.slug));

  const { data } = await admin
    .from("revenue_ledger")
    .select("id, amount_cents, currency, occurred_at, metadata, provider, external_event_id")
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("event_type", "charge")
    .maybeSingle();
  const c = data as {
    id: string;
    amount_cents: number;
    currency: string | null;
    occurred_at: string;
    metadata: Record<string, unknown> | null;
    provider: string;
    external_event_id: string | null;
  } | null;
  if (!c) notFound();

  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const tag = tagDeIdioma(idioma);
  const metodo = typeof c.metadata?.metodo === "string" ? c.metadata.metodo : null;
  const produto = typeof c.metadata?.produto === "string" && c.metadata.produto.trim() ? c.metadata.produto.trim() : null;
  const quando = new Intl.DateTimeFormat(tag, {
    timeZone: org.fuso,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(c.occurred_at));
  const valor = new Intl.NumberFormat("pt-BR", { style: "currency", currency: c.currency ?? "BRL" }).format(c.amount_cents / 100);

  return (
    <main className={`${serifDaArea.variable} ${PAGINA} px-4 py-10 print:bg-white print:py-0`}>
      <div className={`${CARTAO} mx-auto max-w-md print:border-0 print:bg-white print:text-[#241f31] print:shadow-none`} data-testid="area-recibo">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={SOBRETITULO}>{org.config.titulo || org.nome}</p>
            <h1 className={`${SERIF} mt-1 text-[30px] leading-tight`}>{t("Recibo")}</h1>
          </div>
          <span className="mt-1 rotate-[-6deg] rounded-full border-2 border-[#8fd6a8] print:border-[#2f7a4f] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[#8fd6a8] print:text-[#2f7a4f]">
            {t("pago ✓")}
          </span>
        </div>
        <p className={`${SERIF} mt-6 text-[36px] leading-none`}>{valor}</p>
        <dl className="mt-6 space-y-3 border-t border-dashed border-white/15 print:border-[#e4dccb] pt-5 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Produto")}</dt>
            <dd className="text-right font-medium">{produto ?? t("Compra")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Valor")}</dt>
            <dd className="font-medium">{valor}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Data")}</dt>
            <dd>{quando}</dd>
          </div>
          {metodo ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Forma de pagamento")}</dt>
              <dd>{metodo === "pix" ? "Pix" : metodo === "boleto" ? t("Boleto") : t("Cartão")}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Situação")}</dt>
            <dd className="font-semibold text-[#8fd6a8] print:text-[#2f7a4f]">{t("pago ✓")}</dd>
          </div>
          {c.external_event_id && c.provider !== "manual" ? (
            <div className="flex justify-between gap-4">
              <dt className="text-[#9d94b2] print:text-[#8b8497]">{t("Código do pagamento")}</dt>
              <dd className="break-all text-right font-mono text-xs">{c.external_event_id}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-6 border-t border-dashed border-white/15 print:border-[#e4dccb] pt-4 text-xs text-[#9d94b2] print:text-[#8b8497]">
          {org.razaoSocial || org.nome}
          {org.cnpj ? ` · CNPJ ${org.cnpj}` : ""}
        </p>
        <a href={caminhoDaArea(org.slug)} className="mt-5 inline-block text-sm font-semibold underline underline-offset-4 print:hidden" style={{ color: "#e2c47a" }}>
          {t("Voltar para a sua área")}
        </a>
      </div>
    </main>
  );
}
