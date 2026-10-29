/**
 * A PÁGINA DO PIX: um link que abre o valor, o QR e um botão "Copiar código Pix" — e que nunca vence.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * Medido em produção (22–26/10/2026, 314 pessoas que receberam o Pix na conversa): 24 travaram no próprio
 * Pix — "meu código não cola", "sua chave não dá certo", "não abriu", "não vai o pix, diz que é fraude". Duas
 * causas: copiar exige tocar e segurar no balão (quem não sabe não acha o "Copiar"), e o código vale uma hora,
 * enquanto um terço das respostas é "pago quando receber" — quem volta depois cola um código morto. No número
 * conectado por QR não existe botão de copiar no WhatsApp (o conector marca os botões como descontinuados), então
 * o botão mora numa página nossa.
 *
 * ─── Como funciona ────────────────────────────────────────────────────────────────────
 * O link carrega a organização e o id da cobrança da Stripe (`/pix/<org>/<pi_…>`); não há tabela nova. A cada
 * abertura a página lê a cobrança com a chave daquela organização (uma cobrança de outra conta simplesmente não
 * é encontrada) e decide:
 *   - paga (ou uma renovação dela paga) → "pagamento confirmado";
 *   - esperando e com mais de 2 minutos de validade → mostra o código dela;
 *   - vencida ou cancelada → cria outra no MESMO valor, com os MESMOS metadados (é por eles que o aviso de
 *     pagamento acha a pessoa e entrega) mais `pix_de_origem`, e mostra o código novo. A referência leva a
 *     janela de 50 minutos: reabrir a página dentro dela devolve a mesma renovação, não uma por clique.
 * O valor nunca vem do link: vem da cobrança original, que o turno criou no valor que a negociação liberou.
 */
import { urlPublicaUsavel } from "@/lib/escalacao/url-publica";
import { env } from "@/lib/env";
import { lerConexaoStripe, type ConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { criarClienteStripe, type PixLido } from "@/lib/pagamentos/stripe";

import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_DA_COBRANCA = /^pi_[A-Za-z0-9]{8,64}$/;
/** Validade de cada código mostrado na página. A página em si não vence. */
const VALIDADE_DO_CODIGO_S = 3600;
/** Abaixo disso o código mostrado venceria enquanto a pessoa ainda está no app do banco. */
const FOLGA_MINIMA_MS = 2 * 60_000;
const JANELA_DA_RENOVACAO_MS = 50 * 60_000;

/** O endereço da página, ou `null` quando não há como montá-lo (sem origem pública, id que não é de cobrança). Pura. */
export function urlDaPaginaDoPix(origem: string | null | undefined, organizationId: string, cobrancaId: string): string | null {
  const base = (origem ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base) || !UUID.test(organizationId) || !ID_DA_COBRANCA.test(cobrancaId)) return null;
  return `${base}/pix/${organizationId.toLowerCase()}/${cobrancaId}`;
}

/** O link da página para um Pix recém-criado com esta conexão. */
/**
 * `env.*` e NÃO `process.env.NEXT_PUBLIC_APP_URL`: no app a variável é substituída no BUILD, e a imagem é construída
 * com `https://placeholder.invalid`. Medido em 29/10/2026: o Pix enviado pelo botão do chat (rota do app) levou o
 * link `https://placeholder.invalid/pix/…`, enquanto o do worker saía certo. Endereço que não abre fora daqui não
 * vai na mensagem: sem página, a pessoa ainda recebe o código.
 */
export function paginaDoPixDaConexao(conexao: Pick<ConexaoStripe, "organizationId">, cobrancaId: string): string | null {
  const origem = env.NEXT_PUBLIC_APP_URL;
  return urlPublicaUsavel(origem) ? urlDaPaginaDoPix(origem, conexao.organizationId, cobrancaId) : null;
}

export function caminhoValido(organizationId: string, cobrancaId: string): boolean {
  return UUID.test(organizationId) && ID_DA_COBRANCA.test(cobrancaId);
}

export type EstadoDaPagina =
  | { estado: "pagar"; valorCentavos: number; descricao: string; copiaECola: string; qrPng: string | null; expiraEm: string | null }
  | { estado: "pago"; valorCentavos: number; descricao: string }
  | { estado: "em_analise"; valorCentavos: number; descricao: string }
  | { estado: "indisponivel" };

type Cliente = Pick<ReturnType<typeof criarClienteStripe>, "lerPix" | "criarPix" | "haPagamentoComMetadado">;

/** A decisão da página, dada a cobrança lida. Pura — quem fala com a Stripe é `estadoDaPaginaDoPix`. */
export function precisaRenovar(pix: Pick<PixLido, "estado" | "copiaECola" | "expiraEm">, agora: Date): boolean {
  if (pix.estado !== "requires_action" || !pix.copiaECola) return true;
  if (pix.expiraEm === null) return false;
  return new Date(pix.expiraEm).getTime() - agora.getTime() < FOLGA_MINIMA_MS;
}

export async function estadoDaPaginaDoPix(
  d: { admin: SupabaseClient; organizationId: string; cobrancaId: string; agora?: Date },
  injetar: { lerConexao?: typeof lerConexaoStripe; cliente?: (c: ConexaoStripe) => Cliente } = {},
): Promise<EstadoDaPagina> {
  if (!caminhoValido(d.organizationId, d.cobrancaId)) return { estado: "indisponivel" };
  const conexao = await (injetar.lerConexao ?? lerConexaoStripe)(d.admin, d.organizationId);
  if (!conexao) return { estado: "indisponivel" };
  const stripe = (injetar.cliente ?? criarClienteStripe)(conexao);
  const agora = d.agora ?? new Date();

  let original: PixLido;
  try {
    original = await stripe.lerPix(d.cobrancaId);
  } catch {
    return { estado: "indisponivel" };
  }
  if (!original.ehPix || original.moeda !== "BRL") return { estado: "indisponivel" };
  const base = { valorCentavos: original.valorCentavos, descricao: original.descricao };
  if (original.estado === "succeeded") return { estado: "pago", ...base };
  if (original.estado === "processing") return { estado: "em_analise", ...base };
  if (!precisaRenovar(original, agora)) {
    return { estado: "pagar", ...base, copiaECola: original.copiaECola!, qrPng: original.qrPng, expiraEm: original.expiraEm };
  }

  // Antes de gerar outro código: a pessoa pode já ter pago uma renovação anterior deste mesmo link.
  const origem = original.metadados.pix_de_origem ?? original.id;
  if (await stripe.haPagamentoComMetadado("pix_de_origem", origem).catch(() => false)) return { estado: "pago", ...base };

  try {
    const novo = await stripe.criarPix({
      valorCentavos: original.valorCentavos,
      descricao: original.descricao || "Pagamento",
      referencia: `pagina-pix-${origem}-${Math.floor(agora.getTime() / JANELA_DA_RENOVACAO_MS)}`,
      metadados: { ...original.metadados, pix_de_origem: origem },
      expiraEmSegundos: VALIDADE_DO_CODIGO_S,
    });
    return { estado: "pagar", ...base, copiaECola: novo.copiaECola, qrPng: novo.qrPng, expiraEm: novo.expiraEm };
  } catch {
    return { estado: "indisponivel" };
  }
}
