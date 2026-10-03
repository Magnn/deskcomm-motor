/**
 * AS IMAGENS DA LEITURA — a mesa fechada e a carta sorteada, na hora certa.
 *
 * Pedido do dono do produto: a pessoa vê a mesa com as cartas fechadas e numeradas
 * quando é convidada a escolher, e vê a carta de verdade quando ela é revelada. O
 * texto já existia (bloco da leitura + marcador "CARTA N:"); faltava a imagem.
 *
 * Quem decide é o CÓDIGO, pelo texto que a agente está mandando — nunca o modelo
 * escolhendo arquivo:
 *   - mensagem com o pedido do baralho ("1 a 22", "3 números"…) e a mesa ainda não
 *     mostrada nesta conversa → vai a MESA;
 *   - mensagem que abre com "CARTA N:" num turno em que o código manda revelar a
 *     carta N → vai a imagem DAQUELA carta sorteada (nunca a que o modelo nomear).
 *
 * As imagens moram no Storage da organização (`catalog-photos/<org>/leitura/…`),
 * as mesmas para sempre: `mesa.jpg` e `cartas/01.jpg`…`cartas/22.jpg` (o número é o
 * `id` do baralho). Trocar o baralho = subir arquivos com os mesmos nomes. Arquivo
 * que falta não derruba nada: a mensagem sai só em texto (a cópia falha e a foto
 * fica de fora, como na foto do produto).
 */
import type { FotoParaEnvio } from "@/lib/agent-engine/agent/fotos-do-produto";

import { MARCA_CARTA, PEDIDO_DO_BARALHO, type PassoDaLeitura } from "./estado-da-leitura";

/** Pasta da leitura dentro do bucket de fotos da organização. */
export function pastaDaLeitura(orgId: string): string {
  return `${orgId}/leitura`;
}

export function caminhoDaMesa(orgId: string): string {
  return `${pastaDaLeitura(orgId)}/mesa.jpg`;
}

export function caminhoDaCarta(orgId: string, cartaId: number): string {
  return `${pastaDaLeitura(orgId)}/cartas/${String(cartaId).padStart(2, "0")}.jpg`;
}

export interface MensagemDaConversa {
  direction: string;
  body: string | null | undefined;
}

/** A agente já ofereceu o baralho antes, nesta conversa? (a mesa vai uma vez só) */
export function mesaJaMostrada(mensagens: readonly MensagemDaConversa[]): boolean {
  return mensagens.some((m) => m.direction === "outbound" && PEDIDO_DO_BARALHO.test(m.body ?? ""));
}

/**
 * Qual imagem da leitura acompanha ESTA mensagem da agente. `null` = nenhuma.
 * `mesaJaFoi` cobre a conversa anterior E as mensagens já enviadas neste turno.
 */
export function imagemDaLeitura(
  orgId: string,
  corpo: string,
  passo: PassoDaLeitura | null,
  mesaJaFoi: boolean,
): { caminho: string; tipo: "mesa" | "carta" } | null {
  const marca = MARCA_CARTA.exec(corpo);
  if (marca) {
    if (passo?.passo !== "revelar_carta") return null;
    if (Number(marca[1]) !== passo.indice) return null;
    return { caminho: caminhoDaCarta(orgId, passo.carta.id), tipo: "carta" };
  }
  if (!mesaJaFoi && passo === null && PEDIDO_DO_BARALHO.test(corpo)) {
    return { caminho: caminhoDaMesa(orgId), tipo: "mesa" };
  }
  return null;
}

/** Destino na pasta da conversa (determinístico: replay reaproveita a cópia). */
export function destinoNaConversa(orgId: string, conversaId: string, origem: string): string {
  const nome = origem.slice(pastaDaLeitura(orgId).length + 1).replace(/\//g, "-");
  return `${orgId}/${conversaId}/leitura-${nome}`;
}

export function fotoDaLeitura(storagePath: string): FotoParaEnvio {
  return { storagePath, mime: "image/jpeg" };
}
