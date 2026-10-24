/**
 * AS COMPRAS RECENTES DE UMA PÁGINA DE VENDAS — o aviso "Fulana acabou de adquirir" com vendas REAIS.
 *
 * Pedido do dono em 24/10/2026: a página das mandalas mostra o aviso de quem comprou, como a do sócio, mas
 * sem inventar compradora. A fonte é o próprio aviso da Cakto que já chega em `webhook_events_log`:
 *
 * - SÓ fontes marcadas `cakto_somente_registro` (migration 0948) — as de página de vendas. A compra que chega
 *   pela fonte do atendimento (cliente do WhatsApp) nunca aparece numa página pública.
 * - SÓ o primeiro nome e a hora. Nada de sobrenome, e-mail, telefone ou valor.
 * - SÓ o que o arquivo ainda tem corpo: a retenção esvazia o corpo depois de
 *   `WEBHOOK_LOG_BODY_RETENTION_DAYS` (7 por padrão), e o aviso só faz sentido com compra recente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CompraRecente {
  nome: string;
  em: string;
}

const LIMITE_DE_LINHAS = 60;
export const MAXIMO_DE_COMPRAS = 12;

/** "MARIA  da silva" → "Maria". `null` quando não sobra um nome que se possa mostrar. */
export function primeiroNomeVisivel(nome: unknown): string | null {
  if (typeof nome !== "string") return null;
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  if (!/^\p{L}[\p{L}'-]{1,19}$/u.test(primeiro)) return null;
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/** Comparação de nome de produto sem caixa, acento nem emoji: "🌀 MEGA PACK 3.7 …" casa com "mega pack 3.7". */
export function normalizarProduto(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .trim();
}

interface LinhaDoArquivo {
  received_at: string;
  external_id: string | null;
  payload_parsed: unknown;
}

function lerCompra(linha: LinhaDoArquivo, produto: string): CompraRecente | null {
  const p = linha.payload_parsed as { data?: { product?: { name?: unknown }; customer?: { name?: unknown } } } | null;
  const nomeDoProduto = p?.data?.product?.name;
  if (typeof nomeDoProduto !== "string" || !normalizarProduto(nomeDoProduto).includes(produto)) return null;
  const nome = primeiroNomeVisivel(p?.data?.customer?.name);
  return nome ? { nome, em: linha.received_at } : null;
}

export async function comprasRecentesDaPagina(
  admin: SupabaseClient,
  organizationId: string,
  produto: string,
  dias = 7,
): Promise<CompraRecente[]> {
  const alvo = normalizarProduto(produto);
  if (alvo.length < 3) return [];

  const { data: fontes, error: erroFontes } = await admin
    .from("webhook_sources")
    .select("path_token")
    .eq("organization_id", organizationId)
    .eq("cakto_somente_registro", true)
    .eq("is_active", true);
  if (erroFontes) throw new Error(erroFontes.message);
  const tokens = (fontes ?? []).map((f) => (f as { path_token: string }).path_token);
  if (tokens.length === 0) return [];

  const { data, error } = await admin
    .from("webhook_events_log")
    .select("received_at, external_id, payload_parsed")
    .eq("organization_id", organizationId)
    .in("webhook_path_token", tokens)
    .eq("event_type", "cakto.purchase_approved")
    .eq("status", "processed")
    .is("archived_at", null)
    .gte("received_at", new Date(Date.now() - dias * 86_400_000).toISOString())
    .order("received_at", { ascending: false })
    .limit(LIMITE_DE_LINHAS);
  if (error) throw new Error(error.message);

  // A Cakto reenvia o mesmo aviso: o pedido conta uma vez só.
  const vistos = new Set<string>();
  const compras: CompraRecente[] = [];
  for (const linha of (data ?? []) as LinhaDoArquivo[]) {
    if (linha.external_id) {
      if (vistos.has(linha.external_id)) continue;
      vistos.add(linha.external_id);
    }
    const compra = lerCompra(linha, alvo);
    if (compra) compras.push(compra);
    if (compras.length >= MAXIMO_DE_COMPRAS) break;
  }
  return compras;
}
