/**
 * COBRANÇAS AVULSAS — o que o agente vende À PARTE do produto principal, por Pix, dentro da conversa.
 *
 * ─── Por que existe ───────────────────────────────────────────────────────────────────
 * Medido em produção (08 a 12/10/2026): 146 conversas pediram uma pergunta nova depois da leitura gratuita e
 * o agente falou do valor da pergunta 3 vezes. Quase metade de tudo o que ele escreveu foi para quem já tinha
 * recebido a leitura e não pagou nada. Duas travas do sistema impediam a cobrança: o piso de preço do turno
 * vetava qualquer valor menor que o do produto principal, e o roteiro mandava chamar uma pessoa para passar a
 * chave Pix — com a equipe ocupada, a venda de R$ 15 morria numa fila.
 *
 * ─── Como funciona ────────────────────────────────────────────────────────────────────
 * O operador cadastra cada cobrança avulsa com nome, valor e QUANDO cobrar. O bloco do turno as lista para o
 * agente. Para cobrar, o agente escreve, sozinho num balão, a marca `[[PIX: nome]]`; o envio troca a marca
 * pela instrução e pelo código do Pix daquele valor (`pix-do-extra-no-envio.ts`). O modelo nunca escolhe o
 * valor e nunca digita código. Se a cobrança não sair, o envio é recusado: marca crua não chega à pessoa.
 *
 * O pagamento NÃO marca a pessoa como compradora do produto principal: o aviso grava a receita com
 * `metadata.extra`, e o turno seguinte lê esse pagamento e diz ao agente o que foi pago e quando.
 *
 * Tudo aqui é puro.
 */
import type { Extra, PricingConfig } from "./tipos";
import { reais } from "./tipos";
import { comoEntregarRelatorio } from "./relatorio-pronto";

/** "Pergunta nova" → "pergunta-nova": é o que vai na marca, nos metadados da cobrança e no registro da receita. */
export function slugDoExtra(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extrasDaConfig(pricing: Pick<PricingConfig, "enabled" | "extras"> | null | undefined): Extra[] {
  return pricing?.enabled ? (pricing.extras ?? []) : [];
}

/** A marca que o agente escreve para pedir a cobrança. */
export const marcaDoExtra = (nome: string): string => `[[PIX: ${nome}]]`;

const MARCA = /\[\[\s*PIX\s*:\s*([^\]\n]{1,80}?)\s*\]\]/gi;

/**
 * VÁRIAS DE UMA VEZ: `[[PIX: Pergunta nova x3]]` cobra três perguntas num Pix só. Pedido do dono em 20/10/2026: quem
 * tem três perguntas pagava uma, esperava a resposta, pagava a outra — três Pix, três esperas, e a venda esfriava no
 * meio. Só para a cobrança de uso único (a de período, como o acompanhamento, não se multiplica).
 */
const QUANTIDADE = /^(.*?)\s*[x×]\s*(\d{1,3})$/i;
/** O teto de unidades numa cobrança: o mesmo múltiplo que a trava do valor dito aceita (`valor-do-extra.ts`). */
export const MAXIMO_DE_UNIDADES = 10;

/** `[[PIX: Pergunta nova x3]]`: a marca de várias unidades. */
export const marcaDoExtraEmLote = (nome: string, quantidade: number): string => `[[PIX: ${nome} x${quantidade}]]`;

export type MarcaNoCorpo =
  | { tipo: "nenhuma" }
  | { tipo: "uma"; extra: Extra; texto: string; quantidade: number }
  | { tipo: "invalida"; motivo: string };

/** Lê a marca de cobrança do corpo: nenhuma, exatamente uma de um extra conhecido, ou um erro com o motivo. */
export function marcaDeExtraNoCorpo(corpo: string, extras: readonly Extra[]): MarcaNoCorpo {
  const achadas = [...corpo.matchAll(MARCA)];
  if (achadas.length === 0) return { tipo: "nenhuma" };
  const nomes = extras.map((e) => `"${e.name}"`).join(", ");
  if (achadas.length > 1) return { tipo: "invalida", motivo: "Mande UMA cobrança por resposta." };
  const bruto = (achadas[0]![1] ?? "").trim();
  const emLote = QUANTIDADE.exec(bruto);
  const quantidade = emLote ? Number(emLote[2]) : 1;
  const pedido = slugDoExtra(emLote ? emLote[1]! : bruto);
  const extra = extras.find((e) => slugDoExtra(e.name) === pedido);
  if (!extra) {
    return {
      tipo: "invalida",
      motivo: nomes === "" ? "Não há cobrança avulsa configurada: não use a marca [[PIX: …]]." : `Cobrança desconhecida. As que existem são: ${nomes}. Escreva o nome exatamente assim.`,
    };
  }
  if (quantidade < 1 || quantidade > MAXIMO_DE_UNIDADES) {
    return { tipo: "invalida", motivo: `Numa cobrança cabem de 1 a ${MAXIMO_DE_UNIDADES} unidades.` };
  }
  if (quantidade > 1 && (extra.valid_days ?? 1) > 1) {
    return { tipo: "invalida", motivo: `*${extra.name}* vale por um período e não se cobra em quantidade: use ${marcaDoExtra(extra.name)}.` };
  }
  return { tipo: "uma", extra, texto: achadas[0]![0], quantidade };
}

/** O valor de uma cobrança com a quantidade: o preço cadastrado vezes as unidades. */
export const valorDaCobranca = (extra: Pick<Extra, "price_cents">, quantidade = 1): number => extra.price_cents * quantidade;

/** "Pergunta nova" ou "3× Pergunta nova": o nome que vai na cobrança. */
export const descricaoDaCobranca = (extra: Pick<Extra, "name">, quantidade = 1): string =>
  quantidade > 1 ? `${quantidade}× ${extra.name}` : extra.name;

/**
 * Troca o balão da marca pela instrução e pelo código, cada um no seu balão. O texto que vinha junto da marca
 * (o modelo às vezes escreve uma frase antes) é preservado no balão anterior. Pura.
 */
export function corpoComPixDoExtra(
  corpo: string,
  marca: { extra: Extra; texto: string; quantidade?: number },
  copiaECola: string | null,
  /** Link de cartão do mesmo valor, para quem não tem saldo no Pix. Ausente = só o Pix. */
  linkDoCartao?: string | null,
): string {
  const baloes = corpo.split(/\n{2,}/);
  const i = baloes.findIndex((b) => b.includes(marca.texto));
  if (i < 0) return corpo;
  const resto = baloes[i]!.replace(marca.texto, "").trim();
  const quantidade = marca.quantidade ?? 1;
  // Com várias unidades, o total vem com o que ele paga: "*R$ 15* (3× Pergunta nova)".
  const valor =
    quantidade > 1
      ? `*${reais(valorDaCobranca(marca.extra, quantidade))}* (${descricaoDaCobranca(marca.extra, quantidade)})`
      : `*${reais(marca.extra.price_cents)}*`;
  const novos: string[] = [];
  if (copiaECola) {
    novos.push(
      `Pra pagar no Pix é só copiar o código abaixo e colar no app do seu banco, na opção *Pix Copia e Cola*. Valor: ${valor}. No banco aparece o nome da empresa de pagamentos, é assim mesmo.`,
      copiaECola,
    );
  }
  if (linkDoCartao) {
    novos.push(
      copiaECola
        ? `Se preferir cartão de crédito, é por este link: ${linkDoCartao}`
        : `Pra pagar no cartão de crédito, valor ${valor}, é por este link: ${linkDoCartao}`,
    );
  }
  if (novos.length === 0) return corpo;
  return [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n");
}

/** A referência da cobrança: a mesma conversa pedindo o mesmo extra na mesma hora recebe o MESMO Pix. */
export function referenciaDoExtra(conversaId: string, extra: Extra, agora: Date, quantidade = 1, pagamentosAntes = 0): string {
  // A unidade sozinha mantém a referência de antes: um Pix já criado nesta hora segue sendo o mesmo. Depois de um
  // pagamento, a cobrança seguinte é OUTRA (`pagamentosAntes`, ver `pagamentosRecentesDoContato`).
  const lote = quantidade > 1 ? `-x${quantidade}` : "";
  const depois = pagamentosAntes > 0 ? `-p${pagamentosAntes}` : "";
  return `extra-${conversaId}-${slugDoExtra(extra.name)}-${extra.price_cents}${lote}-${Math.floor(agora.getTime() / 3_600_000)}${depois}`;
}

/** Um extra pago há pouco, lido do livro de receita. */
export interface ExtraPago {
  slug: string;
  /** "HH:MM", no fuso da organização. */
  hora: string;
  /** "DD/MM" do pagamento e quantos dias inteiros se passaram desde ele. Ausentes = pagamento de hoje. */
  dia?: string;
  diasAtras?: number;
  /** "DD/MM" em que um período pago termina; calculado por quem lê o livro de receita. */
  ateDia?: string;
  /** Há quantos minutos o pagamento caiu. Hora de relógio confunde o modelo quando o fuso da organização não é o da conversa. */
  minutosAtras?: number;
  /** Quantas unidades foram pagas nessa cobrança (`[[PIX: nome x3]]`). Ausente = uma. */
  quantidade?: number;
}

/** Até quantos dias atrás vale a pena ler pagamentos: o maior período entre os extras, e no mínimo um dia. */
export function janelaDeLeituraDosExtras(extras: readonly Extra[]): number {
  return Math.max(1, ...extras.map((e) => e.valid_days ?? 1));
}

/**
 * O bloco das cobranças avulsas. Só entra depois que a oferta principal foi apresentada (ou para quem já
 * comprou): antes disso, cobrar uma pergunta atropelaria a venda do produto principal.
 */
export function blocoDosExtras(extras: readonly Extra[], pagos: readonly ExtraPago[] = []): string {
  if (extras.length === 0) return "";
  const linhas = [
    "",
    "",
    "COBRANÇAS À PARTE (definidas pelo operador; valem mais que qualquer regra de cobrança avulsa escrita antes neste prompt)",
    "- O que está abaixo NÃO faz parte do que é gratuito nem do trabalho principal. Quando a situação descrita acontecer, NÃO atenda de graça: diga o valor e cobre.",
  ];
  for (const e of extras) {
    // O valor vai dito como É DESTA cobrança: em 19/10/2026 a agente trocou o da pergunta (R$ 5) pelo do trabalho (R$ 130).
    linhas.push(
      `- *${e.name}* — ${reais(e.price_cents)} (o valor DESTA cobrança; não é o valor do trabalho principal). Quando cobrar: ${e.when} Para cobrar, escreva sozinho num balão: ${marcaDoExtra(e.name)}`,
    );
    // A conta pronta: em 20/10/2026 a agente somou 6 perguntas de R$ 5 como "R$ 35 o pacote" e defendeu o erro.
    if ((e.valid_days ?? 1) <= 1) {
      const tabela = Array.from({ length: MAXIMO_DE_UNIDADES - 1 }, (_, i) => `${i + 2} = ${reais((i + 2) * e.price_cents)}`).join(", ");
      linhas.push(`  Total de *${e.name}* (NÃO faça conta de cabeça, use esta tabela): ${tabela}. Não existe pacote nem desconto: o total é sempre o da tabela, e a quantidade da marca é a quantidade combinada.`);
    }
  }
  linhas.push(
    `- VÁRIAS DE UMA VEZ: se ela tem mais de uma pergunta (ou quer mais de uma unidade da mesma cobrança), ANOTE todas, confirme a lista com ela em um balão e cobre TUDO num Pix só, escrevendo a quantidade na marca: ${marcaDoExtraEmLote("nome", 3)} (até ${MAXIMO_DE_UNIDADES}). O valor é o da cobrança vezes a quantidade. Nunca cobre uma, responda, e cobre a próxima.`,
    "- COMO COBRAR, numa resposta só: 1º um balão curto dizendo o que é e o valor; 2º a marca sozinha no balão seguinte (o sistema troca a marca pelo código do Pix e pelo link de cartão de crédito); 3º um balão final: \"Assim que o pagamento cair eu vejo aqui e já te atendo. Conseguiu copiar o código?\"",
    "- Se ela disser que não tem Pix, que só tem cartão ou pedir o link do cartão: o link de cartão vai junto com o Pix. Mande a marca de novo, sozinha no balão, e diga que o link do cartão está logo abaixo do código. NUNCA peça nem aceite foto ou número de cartão na conversa: os dados do cartão são digitados só na página do pagamento.",
    "- NÃO chame atendimento humano para cobrar isto, NÃO peça comprovante e NÃO entregue antes de o pagamento aparecer neste bloco como PAGAMENTO CONFIRMADO.",
    "- Foto ou comprovante enviado pela pessoa NÃO é pagamento confirmado: NUNCA diga que o pagamento caiu nem cite um valor de comprovante. Diga que está conferindo e que abre assim que o sistema confirmar.",
    "- Dúvida sobre o trabalho principal, sobre o pagamento ou sobre o que você já leu para ela NÃO é cobrança à parte: responda normalmente.",
  );
  for (const p of pagos) {
    const extra = extras.find((e) => slugDoExtra(e.name) === p.slug);
    if (!extra) continue;
    const dias = extra.valid_days ?? 1;
    // Pagamento mais velho que o período do extra já não vale nada.
    if ((p.diasAtras ?? 0) >= dias) continue;
    if (dias > 1) {
      linhas.push(
        `- ATIVO: ela pagou *${extra.name}* em ${p.dia ?? "hoje"} e tem direito a ele${p.ateDia ? ` até ${p.ateDia}` : ` por ${dias} dias`}. Atenda normalmente, todos os dias, SEM cobrar de novo por isto e sem dizer que acabou. Outras cobranças deste bloco continuam valendo.`,
      );
      continue;
    }
    const ha = p.minutosAtras === undefined ? `às ${p.hora}` : p.minutosAtras < 1 ? "agora mesmo" : `há ${p.minutosAtras} min`;
    const q = p.quantidade ?? 1;
    linhas.push(
      `- PAGAMENTO CONFIRMADO PELO SISTEMA: ela pagou *${descricaoDaCobranca(extra, q)}* ${ha}.${q > 1 ? ` São ${q}: entregue as ${q} (as que ela listou antes de pagar), e só depois das ${q} uma nova é cobrança nova.` : ""} O sistema viu o dinheiro cair; isto NÃO depende de comprovante. É PROIBIDO dizer que vai conferir ou que pediu para conferirem, pedir ou comentar comprovante, perguntar se ela pagou ou por qual meio, e cobrar de novo por isto.`,
      `  COMO ENTREGAR *${extra.name}*: ${extra.report ? comoEntregarRelatorio(extra) : (extra.delivery ?? "entregue o que ela pagou, completo, nesta resposta.")}`,
      `  Se depois do pagamento você ainda NÃO entregou (confira as suas falas acima), comece a entrega AGORA, dizendo primeiro em meia frase que o pagamento caiu. Se já entregou, esse pagamento foi usado: um pedido NOVO é uma cobrança nova.`,
    );
  }
  return linhas.join("\n");
}

/** Até quantos minutos depois do pagamento a entrega ainda conta como "acabou de cair". */
const MINUTOS_DA_ENTREGA_PENDENTE = 30;

/**
 * A ENTREGA QUE AINDA NÃO COMEÇOU: uma cobrança avulsa de uso único paga há pouco, e nenhuma fala da agente depois
 * do pagamento. Medido em 19/10/2026: o Pix de uma pergunta caiu no MESMO minuto em que a pessoa mandou a foto do
 * comprovante; o turno do pagamento caiu no modo "resposta atropelada", respondeu só à foto (que não leu) e a
 * entrega nunca começou — a agente seguiu cobrando um Pix já pago. Pura.
 */
export function entregaPendente(
  extras: readonly Extra[],
  pagos: readonly ExtraPago[],
  mensagens: ReadonlyArray<{ direction: string; sent_at: string }>,
  agora: Date,
): { extra: Extra; minutos: number } | null {
  for (const p of pagos) {
    const extra = extras.find((e) => slugDoExtra(e.name) === p.slug);
    if (!extra || (extra.valid_days ?? 1) > 1) continue;
    const minutos = p.minutosAtras;
    if (minutos === undefined || minutos >= MINUTOS_DA_ENTREGA_PENDENTE) continue;
    const pagoEm = agora.getTime() - minutos * 60_000 - 60_000; // um minuto de folga: o registro é por minuto
    const falouDepois = mensagens.some((m) => m.direction === "outbound" && new Date(m.sent_at).getTime() > pagoEm);
    if (!falouDepois) return { extra, minutos };
  }
  return null;
}

/** O bloco que põe a entrega na frente de tudo neste turno. */
export function blocoDaEntregaPendente(pendente: { extra: Extra; minutos: number } | null): string {
  if (!pendente) return "";
  const ha = pendente.minutos < 1 ? "agora mesmo" : `há ${pendente.minutos} min`;
  return [
    "",
    "",
    `UM PAGAMENTO ACABOU DE CAIR (vale mais que qualquer outra instrução deste turno): ela pagou *${pendente.extra.name}* ${ha}. Esta resposta É A ENTREGA.`,
    "- Diga em meia frase que o pagamento caiu e está tudo certo, e comece a entrega agora, como está em COBRANÇAS À PARTE.",
    "- Se ela mandou imagem ou print (o comprovante), não comente a imagem e não peça comprovante: o sistema já viu o dinheiro.",
    "- Não fale de outro assunto antes da entrega, não cobre de novo e não repita o código do Pix.",
  ].join("\n");
}

/**
 * A cobrança avulsa abre uma nova leitura de 3 cartas? Explícito em `opens_reading`; sem ele, a "pergunta" do nome
 * (a pergunta nova de quem já recebeu a leitura grátis). Medido em 19/10/2026: sem rodada própria, o motor da
 * leitura dizia "a leitura terminou, NUNCA revele outra carta" enquanto a cobrança paga mandava abrir as cartas.
 */
export function abreLeitura(extra: Pick<Extra, "name" | "opens_reading">): boolean {
  return extra.opens_reading ?? /pergunta/i.test(extra.name);
}

/** A pergunta paga mais recente que abre leitura e ainda vale (um dia), com o instante aproximado do pagamento. */
export function perguntaPagaRecente(
  extras: readonly Extra[],
  pagos: readonly ExtraPago[],
  agora: Date,
): { extra: Extra; pagoEm: Date; chave: string; quantidade: number } | null {
  for (const p of pagos) {
    const extra = extras.find((e) => slugDoExtra(e.name) === p.slug);
    if (!extra || !abreLeitura(extra) || (p.diasAtras ?? 0) >= 1 || p.minutosAtras === undefined) continue;
    // Um minuto de folga: o registro é por minuto e o pedido dos números pode sair no mesmo minuto do pagamento.
    const pagoEm = new Date(agora.getTime() - (p.minutosAtras + 1) * 60_000);
    return { extra, pagoEm, chave: `${p.slug}:${p.dia ?? ""}:${p.hora}`, quantidade: p.quantidade ?? 1 };
  }
  return null;
}
