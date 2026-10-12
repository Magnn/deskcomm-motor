/**
 * DEPOIMENTO DEPOIS DO PREÇO — os áudios de clientes que a empresa cadastrou saem logo depois da mensagem em que o
 * agente diz o valor pela primeira vez.
 *
 * Quem decide a hora é o código, não o modelo: a mensagem que traz o preço é reconhecida pelo valor (o cheio ou um
 * degrau), e os áudios saem uma vez por conversa. O modelo só fica sabendo, pelo histórico, que eles foram enviados
 * (a legenda começa com `MARCA_DA_PROVA`; canal nenhum envia a legenda de um áudio).
 *
 * Os arquivos moram em `whatsapp-media/<org>/provas/…` e são copiados para a pasta da conversa, que é de onde o
 * envio sabe mandar mídia (mesmo caminho das fotos do catálogo e das cartas da leitura).
 */
import type { PricingConfig } from "./tipos";

export const MARCA_DA_PROVA = "[depoimento de cliente]";
/** Quantos áudios saem depois do preço. Mais que isso vira parede de áudio antes do pagamento. */
export const MAX_PROVAS_POR_CONVERSA = 2;

export interface ProvaSocial {
  storage_path: string;
  mime: string;
  descricao: string;
}

interface Mensagem {
  direction: string;
  body?: string | null;
}

export function provasDaConfig(pricing: PricingConfig | null | undefined): ProvaSocial[] {
  return pricing?.social_proof?.audios ?? [];
}

/** O corpo diz um dos valores por que o produto sai (o cheio ou um degrau)? */
export function corpoDizOPreco(corpo: string, pricing: PricingConfig): boolean {
  const valores = [pricing.list_price_cents, ...pricing.steps.map((d) => d.price_cents)].filter(
    (v): v is number => typeof v === "number" && v > 0,
  );
  return valores.some((cents) => {
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    const numero = centavos === 0 ? `${reais}(?:,00)?` : `${reais},${String(centavos).padStart(2, "0")}`;
    return new RegExp(`R\\$\\s?${numero}(?![\\d,])`).test(corpo);
  });
}

/** Os depoimentos já saíram nesta conversa? */
export function provasJaEnviadas(mensagens: readonly Mensagem[]): boolean {
  return mensagens.some((m) => m.direction === "outbound" && (m.body ?? "").startsWith(MARCA_DA_PROVA));
}

/**
 * Os áudios que acompanham ESTA mensagem: só quando ela diz o preço, a conversa ainda não recebeu depoimento e o
 * agente tem depoimento cadastrado.
 */
export function provasParaEnviar(
  pricing: PricingConfig | null | undefined,
  corpo: string,
  mensagens: readonly Mensagem[],
): ProvaSocial[] {
  const provas = provasDaConfig(pricing);
  if (!pricing || provas.length === 0) return [];
  if (!corpoDizOPreco(corpo, pricing)) return [];
  if (provasJaEnviadas(mensagens)) return [];
  return provas.slice(0, MAX_PROVAS_POR_CONVERSA);
}

/** Destino na pasta da conversa (determinístico: o replay do job reaproveita a cópia). */
export function destinoDaProva(orgId: string, conversaId: string, origem: string): string {
  const nome = origem.split("/").pop() ?? "depoimento";
  return `${orgId}/${conversaId}/prova-${nome}`;
}

export function legendaDaProva(prova: ProvaSocial): string {
  return `${MARCA_DA_PROVA} ${prova.descricao}`.trim();
}
