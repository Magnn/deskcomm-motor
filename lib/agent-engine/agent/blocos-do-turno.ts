/**
 * A FILA DE BLOCOS que o turno anexa ao FIM do system prompt.
 *
 * O modelo pequeno só obedece a molde literal — regra em prosa é ignorada perto de
 * um terço das vezes —, então o que depende de ONDE a conversa está (o preço já
 * dito, a carta sorteada, o trabalho pago, o anúncio de origem) é contado pelo
 * código e entra no prompt como um bloco pronto. Cada bloco nasce no seu módulo
 * (`lib/anuncio`, `lib/leitura`, `lib/preco`, `lib/entrega`); este arquivo é a
 * única autoridade sobre EM QUE ORDEM eles entram.
 *
 * ── Por que a ordem tem dono ───────────────────────────────────────────────
 *
 * Ela era uma linha de `inbound-turn.ts` (`${system}${a}${b}${c}${d}`), e dois
 * testes fixavam essa linha inteira como texto: cada bloco novo quebrava os dois
 * sem que nenhuma regra tivesse mudado, e um deles ficou vermelho na `main`
 * quando o bloco do anúncio entrou. Aqui a ordem é DADO (`BLOCOS_DO_TURNO`) e o
 * teste a afirma sobre a função, não sobre o texto do arquivo.
 *
 * ── A ordem, e por quê ─────────────────────────────────────────────────────
 *
 *   1. `anuncio`  — INFORMATIVO: de que anúncio a pessoa veio. Abre a fila.
 *   2. `estilo`   — ESTILO UNIVERSAL: o que a agente já repetiu (abertura, fecho,
 *                   frase feita, emoji). Regra de forma, a mais fraca do prompt.
 *   3. `leitura`  — DIRETIVO: qual carta revelar agora (ou a causa raiz).
 *   4. `preco`    — DIRETIVO: o degrau de preço e o que dizer.
 *   5. `entrega`  — DIRETIVO: o guia do trabalho que a pessoa já pagou.
 *
 * O informativo e o estilo vão ANTES dos diretivos para que, num conflito,
 * leitura, preço e entrega vençam: o modelo dá mais peso ao que vem por último.
 * (O estilo ainda diz, no próprio texto, que molde literal manda.) Entre os três
 * diretivos a ordem é a do funil (revelar → cobrar → entregar).
 *
 * ── Bloco novo ─────────────────────────────────────────────────────────────
 *
 * Um nome em `BLOCOS_DO_TURNO`, na posição certa, e a chave no objeto que
 * `inbound-turn.ts` passa. `BlocosDoTurno` exige TODAS as chaves e o objeto
 * literal recusa chave que não esteja na fila: esquecer um dos dois lados é erro
 * de `pnpm typecheck`, não um bloco que some em silêncio.
 *
 * Sem nenhum bloco (todos ''), o system sai idêntico ao de entrada — o prefixo
 * estável e cacheável não muda.
 */
export const BLOCOS_DO_TURNO = ['anuncio', 'estilo', 'leitura', 'preco', 'entrega'] as const;

export type NomeDoBlocoDoTurno = (typeof BLOCOS_DO_TURNO)[number];

/** Um texto por bloco; '' quando o bloco não se aplica a este turno. */
export type BlocosDoTurno = Record<NomeDoBlocoDoTurno, string>;

/** O system do turno: a base + os blocos que se aplicam, na ordem de `BLOCOS_DO_TURNO`. */
export function comporSystemDoTurno(system: string, blocos: BlocosDoTurno): string {
  return BLOCOS_DO_TURNO.reduce((texto, nome) => texto + blocos[nome], system);
}
