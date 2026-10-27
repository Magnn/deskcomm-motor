/**
 * /pix/<org>/<pi_…> — a página do Pix que vai na conversa: valor, botão "Copiar código Pix", QR e o passo a
 * passo. Quem chega é quem vai pagar, sem conta nenhuma; o direito é saber o id da cobrança, e a página só
 * mostra o que a própria Stripe mostraria a ele. Regra e porquê em `lib/pagamentos/pagina-do-pix.ts`.
 */
import type { Metadata } from "next";

import { estadoDaPaginaDoPix } from "@/lib/pagamentos/pagina-do-pix";
import { reais } from "@/lib/preco/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

import { CopiarCodigo } from "./_copiar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Pagamento por Pix",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ org: string; cobranca: string }> };

export default async function PaginaDoPix({ params }: Props) {
  const { org, cobranca } = await params;
  const admin = createAdminClient();
  const pagina = await estadoDaPaginaDoPix({ admin, organizationId: org, cobrancaId: cobranca });
  const { data: organizacao } = pagina.estado === "indisponivel"
    ? { data: null }
    : await admin.from("organizations").select("name").eq("id", org).maybeSingle();
  const nome = (organizacao as { name?: string } | null)?.name ?? "";

  return (
    <main className="min-h-dvh bg-[#f6f3ee] px-4 py-8 text-[#22192e]">
      <div className="mx-auto w-full max-w-md">
        {nome ? <p className="text-center text-sm tracking-wide text-[#6b5a72]">{nome}</p> : null}

        {pagina.estado === "pagar" ? (
          <section className="mt-3 rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-center text-sm text-[#6b5a72]">{pagina.descricao || "Pagamento"}</p>
            <p className="mt-1 text-center text-4xl font-semibold">{reais(pagina.valorCentavos)}</p>
            <CopiarCodigo codigo={pagina.copiaECola} />
            <ol className="mt-6 space-y-3 text-[15px] leading-snug">
              <li><b>1.</b> Toque em <b>Copiar código Pix</b>.</li>
              <li><b>2.</b> Abra o app do seu banco, entre em <b>Pix</b> e escolha <b>Pix Copia e Cola</b> (às vezes aparece como &quot;Colar código&quot;). Não é em &quot;Pagar com chave&quot; nem em &quot;Transferir&quot;.</li>
              <li><b>3.</b> Cole, confira o valor <b>{reais(pagina.valorCentavos)}</b> e confirme.</li>
            </ol>
            {pagina.qrPng ? (
              <details className="mt-6 text-center">
                <summary className="cursor-pointer text-sm text-[#6b5a72] underline">Vai pagar por outro celular? Mostrar QR Code</summary>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem hospedada pela Stripe, de uso único */}
                <img src={pagina.qrPng} alt="QR Code do Pix" className="mx-auto mt-3 h-56 w-56" />
              </details>
            ) : null}
            <p className="mt-6 text-center text-xs text-[#6b5a72]">
              Este link vale sempre: se o código passar da validade, é só abrir de novo que vem outro, no mesmo valor.
              Depois de pagar, volte para a conversa.
            </p>
          </section>
        ) : null}

        {pagina.estado === "pago" ? (
          <section className="mt-3 rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-5xl" aria-hidden>✓</p>
            <p className="mt-2 text-xl font-semibold">Pagamento confirmado</p>
            <p className="mt-1 text-[#6b5a72]">{reais(pagina.valorCentavos)} · {pagina.descricao || "Pagamento"}</p>
            <p className="mt-4 text-sm">Pode voltar para a conversa: a continuação segue por lá.</p>
          </section>
        ) : null}

        {pagina.estado === "em_analise" ? (
          <section className="mt-3 rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-xl font-semibold">Pagamento em processamento</p>
            <p className="mt-2 text-sm">O banco ainda está confirmando. Em alguns minutos chega a confirmação na conversa.</p>
          </section>
        ) : null}

        {pagina.estado === "indisponivel" ? (
          <section className="mt-3 rounded-3xl bg-white p-6 text-center shadow-sm">
            <p className="text-xl font-semibold">Este pagamento não está disponível</p>
            <p className="mt-2 text-sm">Volte para a conversa e peça um novo código.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
