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
import { ehOptOutProvavel, ehRecusaDaOferta } from "@/lib/opt-out/deteccao";
import type { ProdutoDoCatalogo } from "@/lib/catalogo/tipos";
import { cobrancaDoTema } from "@/lib/preco/extras";
import { slugDoProduto } from "@/lib/preco/pos-venda";
import { reais, type Extra, type PricingConfig } from "@/lib/preco/tipos";

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
  /** Cada compra com a data — o que `so_se_comprou` e `compra_ha_pelo_menos_dias` leem. Ausente = sem datas. */
  compras?: readonly { produto: string; em: Date }[];
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

/**
 * As duas condições de compra da oferta. Sem nenhuma delas, cabe sempre. Com `so_se_comprou`, a pessoa precisa
 * ter comprado um produto que casa; com `compra_ha_pelo_menos_dias`, a compra mais recente (dentre as que casam,
 * ou qualquer uma) precisa ter ao menos tantos dias — sem compra datada, não cabe.
 */
export function compraCabe(
  o: Pick<Oferta, "so_se_comprou" | "compra_ha_pelo_menos_dias">,
  p: Pick<PessoaParaOferta, "produtosComprados" | "compras">,
  agora: Date,
): boolean {
  if (o.so_se_comprou === undefined && o.compra_ha_pelo_menos_dias === undefined) return true;
  const datadas = p.compras ?? [];
  if (o.so_se_comprou !== undefined && !casa(o.so_se_comprou, [...p.produtosComprados, ...datadas.map((c) => c.produto)])) {
    return false;
  }
  if (o.compra_ha_pelo_menos_dias === undefined) return true;
  const re = o.so_se_comprou === undefined ? null : new RegExp(o.so_se_comprou, "i");
  const relevantes = datadas.filter((c) => re === null || re.test(c.produto));
  if (relevantes.length === 0) return false;
  const maisRecente = Math.max(...relevantes.map((c) => c.em.getTime()));
  return agora.getTime() - maisRecente >= o.compra_ha_pelo_menos_dias * DIA_MS;
}

/** A pessoa disse algo que tira qualquer oferta da mesa. */
export function naoOferecer(cfg: Pick<OfertaProativa, "nao_oferecer_se_cliente_disse">, falas: readonly string[]): boolean {
  const padrao = new RegExp(NAO_OFERECER_PADRAO, "i");
  const daOrg = cfg.nao_oferecer_se_cliente_disse === undefined ? null : new RegExp(cfg.nao_oferecer_se_cliente_disse, "i");
  return falas.some((f) => padrao.test(f) || (daOrg?.test(f) ?? false) || ehOptOutProvavel(f) || ehRecusaDaOferta(f));
}

/** A oferta cabe nesta pessoa agora? Todas as condições dela, menos a ordem. */
function cabe(o: Oferta, p: PessoaParaOferta, agora: Date, tudoQueOAgenteDisse: readonly string[]): boolean {
  if (o.so_quem_comprou === true && !p.comprou) return false;
  if (o.so_quem_comprou === false && p.comprou) return false;
  if (o.ja_tem_se_comprou !== undefined && casa(o.ja_tem_se_comprou, p.produtosComprados)) return false;
  if (!compraCabe(o, p, agora)) return false;
  if (!casa(o.agente_ja_disse, tudoQueOAgenteDisse)) return false;
  if (!casa(o.cliente_disse, p.falas)) return false;
  const desde = agora.getTime() - o.dias_entre_repeticoes * DIA_MS;
  if (p.ofertasFeitas.some((f) => f.id === o.id && f.em.getTime() > desde)) return false;
  if (
    o.ja_ofertada_se_agente_disse !== undefined &&
    casa(
      o.ja_ofertada_se_agente_disse,
      p.saidas.filter((s) => s.em.getTime() > desde).map((s) => s.texto),
    )
  ) {
    return false;
  }
  return true;
}

/** Quando esta oferta foi feita a ela pela última vez. `null` = nunca, no registro. */
function ultimaVez(id: string, p: PessoaParaOferta): number | null {
  const vezes = p.ofertasFeitas.filter((f) => f.id === id).map((f) => f.em.getTime());
  return vezes.length === 0 ? null : Math.max(...vezes);
}

/**
 * QUAL oferta: entre as que cabem — as da lista da organização e, depois delas, as automáticas do catálogo
 * (`ofertasDoCatalogo`) —, a primeira, na ordem, que ela ainda não ouviu; ouviu todas, a que ouviu há mais tempo.
 * Medido em 26/11/2026: era sempre "a primeira que cabe", e a Pergunta nova cabia em quase todo mundo — 290 das 321
 * ofertas da semana, nenhuma simpatia, nenhum produto do catálogo. O rodízio faz o catálogo inteiro passar.
 */
export function escolherOferta(
  p: PessoaParaOferta,
  cfg: OfertaProativa,
  agora: Date,
  automaticas: readonly Oferta[] = [],
): Escolha {
  if (naoOferecer(cfg, p.falas)) return { oferta: null, porque: "recusou_ou_fragil" };
  const tudoQueOAgenteDisse = p.saidas.map((s) => s.texto);
  const cabem = [...cfg.ofertas, ...automaticas].filter((o) => cabe(o, p, agora, tudoQueOAgenteDisse));
  if (cabem.length === 0) return { oferta: null, porque: "nenhuma_cabe" };
  const nova = cabem.find((o) => ultimaVez(o.id, p) === null);
  if (nova !== undefined) return { oferta: nova };
  return { oferta: cabem.reduce((a, b) => ((ultimaVez(b.id, p) ?? 0) < (ultimaVez(a.id, p) ?? 0) ? b : a)) };
}

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idDe = (prefixo: string, nome: string) => `${prefixo}-${slugDoProduto(nome)}`.slice(0, 40);

export interface CatalogoParaOferta {
  /** As cobranças avulsas da aba Preço. Entra a que tem palavra do tema e a pessoa disse uma delas. */
  extras: readonly Pick<Extra, "name" | "when" | "themes">[];
  /** O produto do catálogo que a oferta da vez (`ofertaDaVez`) libera para ela agora, se ainda não foi oferecido. */
  produto: Pick<ProdutoDoCatalogo, "nome" | "preco_cents" | "descricao" | "recebe"> | null;
}

/**
 * AS OFERTAS AUTOMÁTICAS: o catálogo vira oferta proativa sem ninguém escrever uma por uma. O produto da vez (a
 * mesma regra que o turno usa, então a agente sabe cobrar o que ofereceu) e cada cobrança avulsa cujo tema a pessoa
 * trouxe — a do assunto mais recente primeiro. Cobrança que a lista da organização já oferece (`{{preco:Nome}}` no
 * motivo) não entra de novo; cobrança sem palavras de tema não entra (a `when` dela pede que a pessoa traga o
 * assunto, e oferecer sem ele é oferecer no escuro). Pura.
 */
export function ofertasDoCatalogo(
  catalogo: CatalogoParaOferta,
  falas: readonly string[],
  cfg: Pick<OfertaProativa, "ofertas">,
): Oferta[] {
  const daLista = new Set<string>();
  for (const o of cfg.ofertas) for (const m of o.motivo.matchAll(MARCA_DE_PRECO)) daLista.add(semAcento(m[1]!));
  const mensagens = [...falas].reverse().map((body) => ({ direction: "inbound", body }));
  const doTema = catalogo.extras.filter(
    (e) => !daLista.has(semAcento(e.name)) && cobrancaDoTema([e], mensagens) !== null,
  );
  const primeira = cobrancaDoTema(doTema, mensagens);
  const ordem = primeira === null ? doTema : [primeira, ...doTema.filter((e) => e !== primeira)];

  const ofertas: Oferta[] = [];
  const pr = catalogo.produto;
  // Produto que a lista da organização já oferece pelo nome (ex.: uma oferta escrita da Oração dos Sonhos) não entra de novo.
  const listaJaOferece = pr !== null && cfg.ofertas.some((o) => semAcento(o.motivo).includes(semAcento(pr.nome)));
  if (pr !== null && !listaJaOferece) {
    ofertas.push({
      id: idDe("cat", pr.nome),
      motivo:
        [
          `ofereça, pelo nome, o ${pr.nome} (${reais(pr.preco_cents)}), do catálogo.`,
          pr.descricao,
          pr.recebe ? `Ela recebe: ${pr.recebe}.` : undefined,
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 2000),
      ja_tem_se_comprou: escapar(pr.nome),
      dias_entre_repeticoes: 7,
    });
  }
  for (const e of ordem) {
    ofertas.push({
      id: idDe("x", e.name),
      motivo: `ofereça, pelo nome, o ${e.name} ({{preco:${e.name}}}), pelo assunto que ela trouxe. Quando cabe: ${e.when}`.slice(0, 2000),
      ja_tem_se_comprou: escapar(e.name),
      dias_entre_repeticoes: 7,
    });
  }
  return ofertas;
}

/**
 * O motivo que vai para o turno: o da organização mais a salvaguarda que nenhuma configuração tira. O turno
 * pode decidir não enviar — e é isso que a salvaguarda pede quando a conversa mostra que não é hora.
 */
/** `{{preco:Nome}}` no motivo: o valor sai do cadastro de preços na hora, nunca do texto escrito à mão. */
const MARCA_DE_PRECO = /\{\{\s*preco\s*:\s*([^}]+?)\s*\}\}/gi;

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Troca cada `{{preco:Nome}}` pelo valor do extra de mesmo nome (sem diferenciar acento nem caixa) ou, com o nome
 * "trabalho", pelo preço de tabela. Devolve `null` quando alguma marca não acha preço: oferta com valor
 * desconhecido não sai — melhor calar um dia do que dizer um preço que o Pix não cobra (21/11/2026: o texto da
 * Pergunta nova dizia R$ 5 com o cadastro em R$ 27).
 */
export function motivoComPrecos(
  motivo: string,
  pricing: Pick<PricingConfig, "list_price_cents" | "extras"> | null,
): string | null {
  let faltou = false;
  const texto = motivo.replace(MARCA_DE_PRECO, (_, nome: string) => {
    const alvo = semAcento(nome);
    const cents =
      alvo === "trabalho"
        ? pricing?.list_price_cents
        : pricing?.extras?.find((e) => semAcento(e.name) === alvo)?.price_cents;
    if (typeof cents !== "number") {
      faltou = true;
      return "";
    }
    return reais(cents);
  });
  return faltou ? null : texto;
}

export function motivoDaOferta(o: Oferta, motivo: string = o.motivo): string {
  return (
    `oferta proativa (${o.id}): ${motivo} ` +
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
