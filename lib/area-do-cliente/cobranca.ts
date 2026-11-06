/**
 * A COBRANÇA de dentro da área do cliente — a mesma para o Círculo, o presente
 * e o Ano Pessoal. Pix devolve o código para mostrar na própria área; cartão
 * devolve o link da Stripe. Os metadados levam a organização, a pessoa e o
 * `extra` que diz ao aviso de pagamento o que liberar.
 */
import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
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
    /** Em centavos DESTA moeda. Fora do real só há cartão (`moeda-do-visitante.ts`). Padrão: reais. */
    moeda?: "BRL" | "EUR" | "USD";
    descricao: string;
    produto: string;
    extra: string;
    /** Determinística — a mesma referência devolve a MESMA cobrança, não duas. */
    referencia: string;
    metadados?: Record<string, string>;
    mensagemDepoisDePagar: string;
    /** O plano que renova sozinho: o cartão fica guardado na conta da empresa (`stripe.ts`). */
    guardarCartao?: boolean;
    /** O e-mail que a pessoa já deu: a página da Stripe abre com ele preenchido. */
    email?: string;
  },
): Promise<CobrancaCriada> {
  const conexao = await lerConexaoStripe(admin, d.organizationId);
  if (!conexao) throw new SemPagamento();
  const stripe = criarClienteStripe(conexao);
  const metadados = {
    organization_id: d.organizationId,
    contact_id: d.contactId,
    produto: d.produto,
    extra: d.extra,
    ...(d.metadados ?? {}),
  };
  const moeda = d.moeda ?? "BRL";
  if (d.forma === "pix") {
    if (moeda !== "BRL") throw new Error("Pix é só em reais");
    const pix = await stripe.criarPix({
      valorCentavos: d.valorCentavos,
      descricao: d.descricao,
      referencia: `${d.referencia}-pix`,
      metadados,
      expiraEmSegundos: 3600,
    });
    return { forma: "pix", copiaECola: pix.copiaECola, qrPng: pix.qrPng };
  }
  // O topo da página da Stripe mostra o nome da CONTA; o produto leva a marca da área, que é a que a pessoa conhece.
  const { data: org } = await admin.from("organizations").select("settings").eq("id", d.organizationId).maybeSingle();
  const marca = (lerConfigDaArea((org as { settings: unknown } | null)?.settings).titulo ?? "").trim();
  const link = await stripe.criarLinkDePagamento({
    valorCentavos: d.valorCentavos,
    moeda,
    descricao: descricaoComMarca(d.descricao, marca),
    referencia: `${d.referencia}-link`,
    metadados,
    mensagemDepoisDePagar: d.mensagemDepoisDePagar,
    ...(d.guardarCartao ? { guardarCartao: true } : {}),
  });
  return { forma: "cartao", url: comEmailPreenchido(link.url, d.email) };
}

/** Puro: "Meu Mistério · O Código da Conexão" — sem repetir a marca quando a descrição já a traz. */
export function descricaoComMarca(descricao: string, marca: string): string {
  if (!marca || descricao.toLowerCase().includes(marca.toLowerCase())) return descricao;
  return `${marca} · ${descricao}`;
}

/** Puro: o link de pagamento da Stripe aceita `prefilled_email` — a pessoa não digita de novo no celular. */
export function comEmailPreenchido(url: string, email: string | undefined): string {
  const e = (email ?? "").trim();
  if (!e || !/^\S+@\S+\.\S+$/.test(e)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}prefilled_email=${encodeURIComponent(e)}`;
}
