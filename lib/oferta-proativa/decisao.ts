/**
 * OFERTA PROATIVA — a regra de QUAL oferta cabe nesta pessoa, agora. Pura: sem banco, sem relógio próprio.
 *
 * Uma oferta por pessoa: a PRIMEIRA da lista que ela pode receber. A ordem é a prioridade que a organização
 * escreveu (ex.: o produto seguinte para quem comprou antes do produto de entrada para quem não comprou).
 *
 * Ninguém recebe oferta se disse, numa mensagem recente, que não quer, que desconfia, que está sem dinheiro
 * para o básico ou que está em sofrimento — a lista padrão (`NAO_OFERECER_PADRAO`) mais a da organização,
 * e o detector de pedido de parar do produto.
 */
import { ehOptOutProvavel } from "@/lib/opt-out/deteccao";

import { NAO_OFERECER_PADRAO, type Oferta, type OfertaProativa } from "./config";

const DIA_MS = 24 * 3_600_000;

export interface MensagemDatada {
  texto: string;
  em: Date;
}

export interface PessoaParaOferta {
  /** Tem ao menos uma compra registrada. */
  comprou: boolean;
  /** O produto de cada compra, como o pagamento o registrou. */
  produtosComprados: readonly string[];
  /** O que a pessoa disse, nas mensagens recentes. */
  falas: readonly string[];
  /** O que o agente disse, com a hora. */
  saidas: readonly MensagemDatada[];
  /** As ofertas proativas já feitas a ela, pelo id. */
  ofertasFeitas: readonly { id: string; em: Date }[];
}

export type MotivoDeNaoOferecer = "recusou_ou_fragil" | "nenhuma_cabe";

export type Escolha = { oferta: Oferta } | { oferta: null; porque: MotivoDeNaoOferecer };

function casa(padrao: string | undefined, textos: readonly string[]): boolean {
  if (padrao === undefined) return true;
  const re = new RegExp(padrao, "i");
  return textos.some((t) => re.test(t));
}

/** A pessoa disse algo que tira qualquer oferta da mesa. */
export function naoOferecer(cfg: Pick<OfertaProativa, "nao_oferecer_se_cliente_disse">, falas: readonly string[]): boolean {
  const padrao = new RegExp(NAO_OFERECER_PADRAO, "i");
  const daOrg = cfg.nao_oferecer_se_cliente_disse === undefined ? null : new RegExp(cfg.nao_oferecer_se_cliente_disse, "i");
  return falas.some((f) => padrao.test(f) || (daOrg?.test(f) ?? false) || ehOptOutProvavel(f));
}

export function escolherOferta(p: PessoaParaOferta, cfg: OfertaProativa, agora: Date): Escolha {
  if (naoOferecer(cfg, p.falas)) return { oferta: null, porque: "recusou_ou_fragil" };
  const tudoQueOAgenteDisse = p.saidas.map((s) => s.texto);

  for (const o of cfg.ofertas) {
    if (o.so_quem_comprou === true && !p.comprou) continue;
    if (o.so_quem_comprou === false && p.comprou) continue;
    if (o.ja_tem_se_comprou !== undefined && casa(o.ja_tem_se_comprou, p.produtosComprados)) continue;
    if (!casa(o.agente_ja_disse, tudoQueOAgenteDisse)) continue;
    if (!casa(o.cliente_disse, p.falas)) continue;

    const desde = agora.getTime() - o.dias_entre_repeticoes * DIA_MS;
    if (p.ofertasFeitas.some((f) => f.id === o.id && f.em.getTime() > desde)) continue;
    if (
      o.ja_ofertada_se_agente_disse !== undefined &&
      casa(
        o.ja_ofertada_se_agente_disse,
        p.saidas.filter((s) => s.em.getTime() > desde).map((s) => s.texto),
      )
    ) {
      continue;
    }
    return { oferta: o };
  }
  return { oferta: null, porque: "nenhuma_cabe" };
}

/**
 * O motivo que vai para o turno: o da organização mais a salvaguarda que nenhuma configuração tira. O turno
 * pode decidir não enviar — e é isso que a salvaguarda pede quando a conversa mostra que não é hora.
 */
export function motivoDaOferta(o: Oferta): string {
  return (
    `oferta proativa (${o.id}): ${o.motivo} ` +
    "Uma mensagem só, curta, pelo nome. Não mande cobrança nem link nesta mensagem: só depois que a pessoa disser que quer. " +
    "Sem urgência inventada, sem prazo, sem prometer resultado. Se a conversa mostra que a pessoa pediu para não ser procurada, " +
    "desconfiou, está sem dinheiro para o básico ou em sofrimento grave, não envie nada."
  );
}

/** A hora cheia no fuso da organização (0–23). Fuso inválido cai em UTC, como o resto do worker. */
export function horaNoFuso(agora: Date, timezone: string | null): number {
  try {
    return Number(
      new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone ?? "UTC" }).format(agora),
    );
  } catch {
    return agora.getUTCHours();
  }
}

/** A oferta pode sair agora, pela faixa do dia da organização? */
export function dentroDaFaixa(cfg: Pick<OfertaProativa, "hora_inicio" | "hora_fim">, agora: Date, timezone: string | null): boolean {
  const h = horaNoFuso(agora, timezone);
  return h >= cfg.hora_inicio && h < cfg.hora_fim;
}
