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

export type MarcaNoCorpo =
  | { tipo: "nenhuma" }
  | { tipo: "uma"; extra: Extra; texto: string }
  | { tipo: "invalida"; motivo: string };

/** Lê a marca de cobrança do corpo: nenhuma, exatamente uma de um extra conhecido, ou um erro com o motivo. */
export function marcaDeExtraNoCorpo(corpo: string, extras: readonly Extra[]): MarcaNoCorpo {
  const achadas = [...corpo.matchAll(MARCA)];
  if (achadas.length === 0) return { tipo: "nenhuma" };
  const nomes = extras.map((e) => `"${e.name}"`).join(", ");
  if (achadas.length > 1) return { tipo: "invalida", motivo: "Mande UMA cobrança por resposta." };
  const pedido = slugDoExtra(achadas[0]![1] ?? "");
  const extra = extras.find((e) => slugDoExtra(e.name) === pedido);
  if (!extra) {
    return {
      tipo: "invalida",
      motivo: nomes === "" ? "Não há cobrança avulsa configurada: não use a marca [[PIX: …]]." : `Cobrança desconhecida. As que existem são: ${nomes}. Escreva o nome exatamente assim.`,
    };
  }
  return { tipo: "uma", extra, texto: achadas[0]![0] };
}

/**
 * Troca o balão da marca pela instrução e pelo código, cada um no seu balão. O texto que vinha junto da marca
 * (o modelo às vezes escreve uma frase antes) é preservado no balão anterior. Pura.
 */
export function corpoComPixDoExtra(corpo: string, marca: { extra: Extra; texto: string }, copiaECola: string): string {
  const baloes = corpo.split(/\n{2,}/);
  const i = baloes.findIndex((b) => b.includes(marca.texto));
  if (i < 0) return corpo;
  const resto = baloes[i]!.replace(marca.texto, "").trim();
  const novos = [
    `Pra pagar no Pix é só copiar o código abaixo e colar no app do seu banco, na opção *Pix Copia e Cola*. Valor: *${reais(marca.extra.price_cents)}*. No banco aparece o nome da empresa de pagamentos, é assim mesmo.`,
    copiaECola,
  ];
  return [...baloes.slice(0, i), ...(resto ? [resto] : []), ...novos, ...baloes.slice(i + 1)].join("\n\n");
}

/** A referência da cobrança: a mesma conversa pedindo o mesmo extra na mesma hora recebe o MESMO Pix. */
export function referenciaDoExtra(conversaId: string, extra: Extra, agora: Date): string {
  return `extra-${conversaId}-${slugDoExtra(extra.name)}-${extra.price_cents}-${Math.floor(agora.getTime() / 3_600_000)}`;
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
    linhas.push(`- *${e.name}* — ${reais(e.price_cents)}. Quando cobrar: ${e.when} Para cobrar, escreva sozinho num balão: ${marcaDoExtra(e.name)}`);
  }
  linhas.push(
    "- COMO COBRAR, numa resposta só: 1º um balão curto dizendo o que é e o valor; 2º a marca sozinha no balão seguinte (o sistema troca a marca pelo código do Pix); 3º um balão final: \"Assim que o Pix cair eu vejo aqui e já te atendo. Conseguiu copiar o código?\"",
    "- NÃO chame atendimento humano para cobrar isto, NÃO peça comprovante e NÃO entregue antes de o pagamento aparecer neste bloco como PAGO.",
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
    linhas.push(
      `- PAGO: ela pagou *${extra.name}* às ${p.hora}. Se depois desse horário você ainda NÃO entregou o que ela pagou (confira as suas falas acima), entregue AGORA, completo, sem cobrar de novo. Se já entregou, esse pagamento foi usado: um pedido novo é uma cobrança nova.`,
    );
  }
  return linhas.join("\n");
}
