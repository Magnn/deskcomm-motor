/**
 * OS PLANOS DA INSTALAÇÃO — o que se vende e o que cada um libera.
 *
 * Quem vende esta instalação como serviço deixa o cliente criar conta, fluxos e
 * agentes de graça, e cobra na hora de CONECTAR UM NÚMERO. O plano diz quantos
 * números a empresa pode ter conectados; sem plano em dia, nenhum.
 *
 * DESLIGADO por padrão: sem `PLANS_ENFORCED=true` nada aqui tem efeito, e a
 * instalação de quem usa o sistema para a própria empresa segue como sempre.
 *
 * Sem I/O e sem `node:*`: a tela de planos importa este módulo.
 */

export interface Plano {
  /** Identificador estável — é ele que fica gravado na assinatura da empresa. */
  id: string;
  nome: string;
  precoMensalCentavos: number;
  /** Quantos números (QR code ou API oficial) a empresa pode ter conectados. */
  numeros: number;
  /**
   * Quanto de IA o plano cobre por mês, em centavos de DÓLAR (a moeda em que o
   * gasto é medido — `llm_calls.cost_cents`, ver `pricing.ts`). Vale só para a
   * empresa que usa a CHAVE DA PLATAFORMA: quem cadastra a própria chave paga a
   * própria IA e segue o teto que ela mesma escolher. `0` = o plano não inclui
   * IA da plataforma (a empresa precisa trazer chave).
   */
  iaMensalCentavosUsd: number;
}

export const PLANOS_PADRAO: readonly Plano[] = [
  // IA incluída ≈ 25–30% do preço (US$ 1 ≈ R$ 5,50): margem para o resto da
  // operação. Trocar é pelo `PLANS_CATALOG`, sem deploy.
  { id: "start", nome: "Start", precoMensalCentavos: 9_700, numeros: 1, iaMensalCentavosUsd: 500 },
  { id: "pro", nome: "Pro", precoMensalCentavos: 19_700, numeros: 3, iaMensalCentavosUsd: 1_200 },
  { id: "scale", nome: "Scale", precoMensalCentavos: 39_700, numeros: 10, iaMensalCentavosUsd: 2_500 },
];

const FORMA_DO_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * O catálogo declarado no `.env`: `id:Nome:centavos:números[:iaCentavosUsd]`,
 * separados por vírgula (ex.: `start:Start:9700:1:500,pro:Pro:19700:3:1200`). O
 * último campo é opcional: ausente, vale o do plano padrão de mesmo id, e 0 para
 * um id que o padrão não tem (o plano não inclui IA da plataforma). `null` quando a
 * declaração está vazia OU malformada — quem chama cai no padrão, e a segunda
 * situação é avisada no log por `planosDaInstalacao`.
 */
export function lerCatalogoDeclarado(declarado: string): Plano[] | null {
  const itens = declarado
    .split(",")
    .map((i) => i.trim())
    .filter((i) => i !== "");
  if (itens.length === 0) return null;
  const planos: Plano[] = [];
  for (const item of itens) {
    const [id, nome, centavos, numeros, ia, ...sobra] = item.split(":").map((p) => p.trim());
    if (!id || !nome || !centavos || !numeros || sobra.length > 0) return null;
    if (ia !== undefined && !/^\d{1,7}$/.test(ia)) return null;
    if (!FORMA_DO_ID.test(id) || !/^\d{1,9}$/.test(centavos) || !/^\d{1,4}$/.test(numeros)) return null;
    if (planos.some((p) => p.id === id)) return null;
    const iaMensalCentavosUsd = ia !== undefined ? Number(ia) : (PLANOS_PADRAO.find((p) => p.id === id)?.iaMensalCentavosUsd ?? 0);
    planos.push({ id, nome, precoMensalCentavos: Number(centavos), numeros: Number(numeros), iaMensalCentavosUsd });
  }
  return planos;
}

export function planoPorId(planos: readonly Plano[], id: string | null | undefined): Plano | null {
  if (!id) return null;
  return planos.find((p) => p.id === id) ?? null;
}

/** "R$ 97" / "R$ 97,50" — o preço como a pessoa lê. */
/** O teto de IA em dólar, legível: `US$ 5` ou `US$ 12,50`. */
export function iaLegivel(centavosUsd: number): string {
  const inteiro = Math.floor(centavosUsd / 100);
  const resto = centavosUsd % 100;
  return resto === 0 ? `US$ ${inteiro}` : `US$ ${inteiro},${resto.toString().padStart(2, "0")}`;
}

export function precoLegivel(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto === 0 ? `R$ ${inteiro}` : `R$ ${inteiro},${resto.toString().padStart(2, "0")}`;
}
