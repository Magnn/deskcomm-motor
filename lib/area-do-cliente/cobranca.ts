/**
 * A COBRANÇA de dentro da área do cliente — a mesma para o Círculo, o presente
 * e o Ano Pessoal. Pix devolve o código para mostrar na própria área; cartão
 * devolve o link da Stripe. Os metadados levam a organização, a pessoa e o
 * `extra` que diz ao aviso de pagamento o que liberar.
 */
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { criarClienteStripe } from "@/lib/pagamentos/stripe";

import type { SupabaseClient } from "@supabase/supabase-js";

export type FormaDePagamento = "pix" | "cartao";

export type CobrancaCriada =
  | { forma: "pix"; copiaECola: string; qrPng: string | null }
  | { forma: "cartao"; url: string };

export class SemPagamento extends Error {
  constructor() {
    super("organização sem Stripe conectada");
  }
}

export async function criarCobrancaDaArea(
  admin: SupabaseClient,
  d: {
    organizationId: string;
    contactId: string;
    forma: FormaDePagamento;
    valorCentavos: number;
    descricao: string;
    produto: string;
    extra: string;
    /** Determinística — a mesma referência devolve a MESMA cobrança, não duas. */
    referencia: string;
    metadados?: Record<string, string>;
    mensagemDepoisDePagar: string;
  },
): Promise<CobrancaCriada> {
  const conexao = await lerConexaoStripe(admin, d.organizationId);
  if (!conexao) throw new SemPagamento();
  const stripe = criarClienteStripe({ chave: conexao.chave });
  const metadados = {
    organization_id: d.organizationId,
    contact_id: d.contactId,
    produto: d.produto,
    extra: d.extra,
    ...(d.metadados ?? {}),
  };
  if (d.forma === "pix") {
    const pix = await stripe.criarPix({
      valorCentavos: d.valorCentavos,
      descricao: d.descricao,
      referencia: `${d.referencia}-pix`,
      metadados,
      expiraEmSegundos: 3600,
    });
    return { forma: "pix", copiaECola: pix.copiaECola, qrPng: pix.qrPng };
  }
  const link = await stripe.criarLinkDePagamento({
    valorCentavos: d.valorCentavos,
    moeda: "BRL",
    descricao: d.descricao,
    referencia: `${d.referencia}-link`,
    metadados,
    mensagemDepoisDePagar: d.mensagemDepoisDePagar,
  });
  return { forma: "cartao", url: link.url };
}
