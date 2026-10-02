/**
 * AS REGRAS DO LANÇAMENTO EM GRUPOS — puras, sem banco e sem WhatsApp.
 *
 * Um lançamento são VÁRIOS grupos (o WhatsApp tem teto de participantes) atrás de
 * UM link. As três decisões que erram em silêncio moram aqui, testáveis sem nada
 * externo:
 *
 *   1. para qual grupo o link manda a próxima pessoa;
 *   2. quando abrir o próximo grupo — ANTES de o atual lotar, senão quem clica no
 *      segundo em que ele enche cai num convite que o WhatsApp recusa;
 *   3. como o grupo se chama.
 *
 * Os vocabulários abaixo são os mesmos dos CHECKs da migration 0909.
 */

export const STATUS_DO_LANCAMENTO = ["active", "paused", "archived"] as const;
export type StatusDoLancamento = (typeof STATUS_DO_LANCAMENTO)[number];

export const STATUS_DO_GRUPO = ["open", "full", "closed"] as const;
export type StatusDoGrupo = (typeof STATUS_DO_GRUPO)[number];

export const STATUS_DO_DISPARO = ["scheduled", "sending", "sent", "failed", "cancelled"] as const;
export type StatusDoDisparo = (typeof STATUS_DO_DISPARO)[number];

export const STATUS_DA_ENTREGA = ["pending", "sent", "failed"] as const;
export type StatusDaEntrega = (typeof STATUS_DA_ENTREGA)[number];

/** Teto do próprio WhatsApp para um grupo comum. */
export const TETO_DO_WHATSAPP = 1024;
/** Lotação padrão: abaixo do teto, com folga para quem entra por convite antigo. */
export const LOTACAO_PADRAO = 900;
/**
 * Com quantas vagas restantes o próximo grupo já é aberto. A contagem que o link
 * usa pode estar alguns segundos velha; a folga cobre quem entrou nesse intervalo.
 */
export const FOLGA_PARA_ABRIR_O_PROXIMO = 20;

export interface GrupoParaVaga {
  id: string;
  position: number;
  status: StatusDoGrupo;
  membersCount: number;
  inviteUrl: string | null;
}

/** O grupo ainda aceita gente pelo link? */
export function temVaga(g: GrupoParaVaga, lotacao: number): boolean {
  return g.status === "open" && g.inviteUrl !== null && g.membersCount < lotacao;
}

/**
 * Para onde o link manda a PRÓXIMA pessoa: o grupo aberto mais antigo com vaga.
 * Encher um grupo antes de começar o seguinte é o que faz o lançamento parecer
 * cheio; espalhar deixaria vários grupos meio vazios. `null` = nenhum com vaga.
 */
export function grupoComVaga(grupos: readonly GrupoParaVaga[], lotacao: number): GrupoParaVaga | null {
  return [...grupos].sort((a, b) => a.position - b.position).find((g) => temVaga(g, lotacao)) ?? null;
}

/**
 * É hora de abrir mais um grupo? Sim quando, somando TODOS os grupos com vaga,
 * sobram menos lugares que a folga. Olha a soma, e não só o grupo atual: se o
 * seguinte já existe e está vazio, não há por que abrir um terceiro.
 */
export function precisaAbrirOutroGrupo(grupos: readonly GrupoParaVaga[], lotacao: number): boolean {
  const vagas = grupos.filter((g) => temVaga(g, lotacao)).reduce((soma, g) => soma + (lotacao - g.membersCount), 0);
  return vagas <= Math.min(FOLGA_PARA_ABRIR_O_PROXIMO, Math.max(1, Math.floor(lotacao / 2)));
}

/** O estado que a contagem impõe a um grupo: lotou → `full`; esvaziou → volta a `open`. Fechado à mão não muda. */
export function statusPelaContagem(atual: StatusDoGrupo, membros: number, lotacao: number): StatusDoGrupo {
  if (atual === "closed") return "closed";
  return membros >= lotacao ? "full" : "open";
}

const MARCA_DO_NUMERO = /#\{n\}|\{n\}/g;
/** O WhatsApp corta o assunto do grupo em 100 caracteres; cortamos antes para o número nunca sumir. */
const TAMANHO_MAXIMO_DO_NOME = 100;

/**
 * O nome do grupo de número `posicao`. `{n}` no modelo vira o número ("VIP #{n}"
 * → "VIP #3"); modelo sem a marca ganha o número no fim, porque dois grupos com o
 * mesmo nome são indistinguíveis para quem administra.
 */
export function nomeDoGrupo(modelo: string, posicao: number): string {
  const base = modelo.trim();
  const n = String(posicao);
  if (MARCA_DO_NUMERO.test(base)) {
    MARCA_DO_NUMERO.lastIndex = 0;
    return base.replace(MARCA_DO_NUMERO, (m) => (m.startsWith("#") ? `#${n}` : n)).slice(0, TAMANHO_MAXIMO_DO_NOME);
  }
  const sufixo = ` #${n}`;
  return `${base.slice(0, TAMANHO_MAXIMO_DO_NOME - sufixo.length)}${sufixo}`;
}

const SEM_ACENTO = /[̀-ͯ]/g;

/** Um slug de link a partir do nome: minúsculas, sem acento, com hífen. Pode sair vazio — quem chama completa. */
export function slugDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(SEM_ACENTO, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Telefone só com dígitos (com DDI), como o WhatsApp identifica a pessoa. `null` = não é um telefone. */
export function telefoneSoDigitos(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  return /^[0-9]{10,15}$/.test(digitos) ? digitos : null;
}

/** `chat.whatsapp.com/<código>` a partir do código de convite que o WhatsApp devolve. */
export function linkDoConvite(codigo: string): string | null {
  const limpo = codigo.trim().replace(/^https?:\/\/chat\.whatsapp\.com\//i, "");
  return /^[A-Za-z0-9_-]{10,40}$/.test(limpo) ? `https://chat.whatsapp.com/${limpo}` : null;
}
