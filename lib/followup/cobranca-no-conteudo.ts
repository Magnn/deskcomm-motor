/**
 * COBRANÇA POR PESSOA DENTRO DO CONTEÚDO DO FLUXO.
 *
 * ─── O que se via em produção ────────────────────────────────────────────────────────────────────────────
 * Medido em 12/10/2026: um funil de mensagens prontas cobrava com um link de pagamento reutilizável colado no
 * texto. O link é o mesmo para todo mundo, então o pagamento não diz de quem veio: a venda não era marcada, a
 * entrega não começava, e o fluxo terminava pedindo comprovante a alguém que ninguém ia conferir.
 *
 * ─── A régua ────────────────────────────────────────────────────────────────────────────────────────────
 * Num item de TEXTO de uma caixa de Conteúdo, a marca `[[COBRAR: 60]]` (ou `[[COBRAR: 60 | Nome do produto]]`)
 * vira, para AQUELA pessoa, uma cobrança criada no provedor conectado: a instrução com o valor, o Pix copia e
 * cola sozinho num balão, o QR code como imagem e o link de cartão. A cobrança leva o contato e a conversa, então
 * o aviso de pagamento marca a venda e inicia a entrega como em qualquer outra compra.
 *
 * O que falha, falha alto: sem provedor conectado, ou se nem o Pix nem o cartão saírem, a expansão lança e o envio
 * daquela caixa não acontece (o job tenta de novo). A marca crua nunca chega à pessoa.
 *
 * A parte de cima é pura; quem fala com o provedor chega por parâmetro.
 */
import { instrucaoDoPixCopiaECola } from "@/lib/pagamentos/como-pagar-pix";
const MARCA = /\[\[\s*COBRAR\s*:\s*(\d{1,5})(?:[.,](\d{2}))?\s*(?:\|\s*([^\]]{1,80}?))?\s*\]\]/i;

export interface MarcaDeCobranca {
  valorCentavos: number;
  produto: string | null;
  bruto: string;
}

export function marcaDeCobrancaNoTexto(texto: string): MarcaDeCobranca | null {
  const m = MARCA.exec(texto);
  if (!m) return null;
  const valorCentavos = Number(m[1]) * 100 + Number(m[2] ?? 0);
  if (valorCentavos <= 0) return null;
  const produto = (m[3] ?? "").trim();
  return { valorCentavos, produto: produto === "" ? null : produto, bruto: m[0] };
}

const reais = (cents: number): string => `R$ ${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2).replace(".", ",")}`;

export interface CobrancaCriada {
  copiaECola: string | null;
  /** Endereço da imagem do QR code, quando o provedor a fornece. */
  qrCodeUrl: string | null;
  urlDoCartao: string | null;
}

export type ItemDeCobranca =
  | { type: "text"; body: string }
  | { type: "image"; url: string; caption?: string };

/**
 * Os itens que entram no lugar do texto com a marca. O que vinha escrito antes e depois da marca é preservado,
 * em balões próprios. Pura. Lança se a cobrança não trouxe nenhum meio de pagar.
 */
export function itensDaCobranca(texto: string, marca: MarcaDeCobranca, c: CobrancaCriada): ItemDeCobranca[] {
  if (c.copiaECola === null && c.urlDoCartao === null) throw new Error("cobranca_indisponivel: o provedor não devolveu nenhum meio de pagamento");
  const [antes, depois] = texto.split(marca.bruto).map((t) => t.trim());
  const valor = reais(marca.valorCentavos);
  const itens: ItemDeCobranca[] = [];
  if (antes) itens.push({ type: "text", body: antes });
  if (c.copiaECola !== null) {
    itens.push({ type: "text", body: instrucaoDoPixCopiaECola(valor) });
    itens.push({ type: "text", body: c.copiaECola });
    if (c.qrCodeUrl !== null) itens.push({ type: "image", url: c.qrCodeUrl, caption: `Ou aponte a câmera do app do banco para este QR code (${valor}).` });
    if (c.urlDoCartao !== null) itens.push({ type: "text", body: `Se preferir cartão de crédito, é por este link: ${c.urlDoCartao}` });
  } else if (c.urlDoCartao !== null) {
    itens.push({ type: "text", body: `O pagamento de *${valor}* é por este link, no cartão de crédito: ${c.urlDoCartao}` });
  }
  if (depois) itens.push({ type: "text", body: depois });
  return itens;
}

/**
 * Troca cada texto com a marca pelos itens da cobrança daquela pessoa. Os outros itens passam intactos.
 * `criar` recebe o valor e o produto e devolve a cobrança; se lançar, a expansão lança junto.
 */
export async function expandirCobrancas<T extends { type: string }>(
  itens: readonly T[],
  criar: (pedido: { valorCentavos: number; produto: string | null; ordem: number }) => Promise<CobrancaCriada>,
): Promise<Array<T | ItemDeCobranca>> {
  const saida: Array<T | ItemDeCobranca> = [];
  let ordem = 0;
  for (const item of itens) {
    const corpo = item.type === "text" ? (item as unknown as { body?: unknown }).body : undefined;
    const marca = typeof corpo === "string" ? marcaDeCobrancaNoTexto(corpo) : null;
    if (marca === null || typeof corpo !== "string") {
      saida.push(item);
      continue;
    }
    ordem += 1;
    saida.push(...itensDaCobranca(corpo, marca, await criar({ valorCentavos: marca.valorCentavos, produto: marca.produto, ordem })));
  }
  return saida;
}
