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
}

export const PLANOS_PADRAO: readonly Plano[] = [
  { id: "start", nome: "Start", precoMensalCentavos: 9_700, numeros: 1 },
  { id: "pro", nome: "Pro", precoMensalCentavos: 19_700, numeros: 3 },
  { id: "scale", nome: "Scale", precoMensalCentavos: 39_700, numeros: 10 },
];

const FORMA_DO_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * O catálogo declarado no `.env`: `id:Nome:centavos:números`, separados por
 * vírgula (ex.: `start:Start:9700:1,pro:Pro:19700:3`). `null` quando a
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
    const [id, nome, centavos, numeros] = item.split(":").map((p) => p.trim());
    if (!id || !nome || !centavos || !numeros) return null;
    if (!FORMA_DO_ID.test(id) || !/^\d{1,9}$/.test(centavos) || !/^\d{1,4}$/.test(numeros)) return null;
    if (planos.some((p) => p.id === id)) return null;
    planos.push({ id, nome, precoMensalCentavos: Number(centavos), numeros: Number(numeros) });
  }
  return planos;
}

export function planoPorId(planos: readonly Plano[], id: string | null | undefined): Plano | null {
  if (!id) return null;
  return planos.find((p) => p.id === id) ?? null;
}

/** "R$ 97" / "R$ 97,50" — o preço como a pessoa lê. */
export function precoLegivel(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = centavos % 100;
  const inteiro = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return resto === 0 ? `R$ ${inteiro}` : `R$ ${inteiro},${resto.toString().padStart(2, "0")}`;
}
