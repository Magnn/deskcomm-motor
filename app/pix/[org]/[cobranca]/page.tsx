/**
 * /pix/<org>/<pi_…> — a página do Pix que vai na conversa: valor, botão "Copiar código Pix", QR e o passo a
 * passo. Quem chega é quem vai pagar, sem conta nenhuma; o direito é saber o id da cobrança, e a página só
 * mostra o que a própria Stripe mostraria a ele. Regra e porquê em `lib/pagamentos/pagina-do-pix.ts`.
 */
import type { Metadata } from "next";

import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { estadoDaPaginaDoPix } from "@/lib/pagamentos/pagina-do-pix";
import { reais } from "@/lib/preco/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

import { CopiarCodigo } from "./_copiar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const idioma = await idiomaDoVisitante(null);
  return { title: traduzir("Pagamento por Pix", idioma), robots: { index: false, follow: false } };
}

type Props = { params: Promise<{ org: string; cobranca: string }> };

export default async function PaginaDoPix({ params }: Props) {
  const { org, cobranca } = await params;
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const admin = createAdminClient();
  const pagina = await estadoDaPaginaDoPix({ admin, organizationId: org, cobrancaId: cobranca });
  const { data: organizacao } = pagina.estado === "indisponivel"
    ? { data: null }
    : await admin.from("organizations").select("name").eq("id", org).maybeSingle();
  const nome = (organizacao as { name?: string } | null)?.name ?? "";
  const cartao = "mt-3 rounded-3xl bg-white p-6 shadow-sm";

  return (
    <main className="min-h-dvh bg-[#f6f3ee] px-4 py-8 text-[#22192e]">
      <div className="mx-auto w-full max-w-md">
        {nome ? <p className="text-center text-sm tracking-wide text-[#6b5a72]">{nome}</p> : null}

        {pagina.estado === "pagar" ? (
          <section className={cartao}>
            <p className="text-center text-sm text-[#6b5a72]">{pagina.descricao || t("Pagamento")}</p>
            <p className="mt-1 text-center text-4xl font-semibold">{reais(pagina.valorCentavos)}</p>
            <CopiarCodigo
              codigo={pagina.copiaECola}
              rotulos={{
                copiar: t("Copiar código Pix"),
                copiado: t("Código copiado ✓"),
                deuCerto: t("Agora é só colar no app do banco, em Pix Copia e Cola."),
                naoDeu: t("Não deu para copiar sozinho: segure o código abaixo e escolha Copiar."),
              }}
            />
            <ol className="mt-6 space-y-3 text-[15px] leading-snug">
              <li>{t("1. Toque em Copiar código Pix.")}</li>
              <li>{t("2. Abra o app do seu banco, entre em Pix e escolha Pix Copia e Cola (às vezes aparece como \"Colar código\"). Não é em \"Pagar com chave\" nem em \"Transferir\".")}</li>
              <li>{`${t("3. Cole, confira o valor e confirme:")} ${reais(pagina.valorCentavos)}`}</li>
            </ol>
            {pagina.qrPng ? (
              <details className="mt-6 text-center">
                <summary className="cursor-pointer text-sm text-[#6b5a72] underline">{t("Vai pagar por outro celular? Mostrar QR Code")}</summary>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem hospedada pela Stripe, de uso único */}
                <img src={pagina.qrPng} alt={t("QR Code do Pix")} className="mx-auto mt-3 h-56 w-56" />
              </details>
            ) : null}
            <p className="mt-6 text-center text-xs text-[#6b5a72]">
              {t("Este link vale sempre: se o código passar da validade, é só abrir de novo que vem outro, no mesmo valor. Depois de pagar, volte para a conversa.")}
            </p>
          </section>
        ) : null}

        {pagina.estado === "pago" ? (
          <section className={`${cartao} text-center`}>
            <p className="text-5xl" aria-hidden>✓</p>
            <p className="mt-2 text-xl font-semibold">{t("Pagamento confirmado")}</p>
            <p className="mt-1 text-[#6b5a72]">{`${reais(pagina.valorCentavos)} · ${pagina.descricao || t("Pagamento")}`}</p>
            <p className="mt-4 text-sm">{t("Pode voltar para a conversa: a continuação segue por lá.")}</p>
          </section>
        ) : null}

        {pagina.estado === "em_analise" ? (
          <section className={`${cartao} text-center`}>
            <p className="text-xl font-semibold">{t("Pagamento em processamento")}</p>
            <p className="mt-2 text-sm">{t("O banco ainda está confirmando. Em alguns minutos chega a confirmação na conversa.")}</p>
          </section>
        ) : null}

        {pagina.estado === "indisponivel" ? (
          <section className={`${cartao} text-center`}>
            <p className="text-xl font-semibold">{t("Este pagamento não está disponível")}</p>
            <p className="mt-2 text-sm">{t("Volte para a conversa e peça um novo código.")}</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
