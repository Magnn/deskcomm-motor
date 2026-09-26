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
 *   1. `identidade` — BASE: quem o agente é e como fala (aba Identidade, definida
 *                     pelo dono do negócio). Abre a fila: é o contexto-base.
 *   2. `oferta`   — BASE: o que a empresa vende, em fatos (aba Oferta, definida pelo
 *                   dono do negócio). Sem preço: o valor mora no bloco de preço.
 *   3. `objecoes` — BASE: como responder ao que a pessoa levanta para não fechar (aba
 *                   Objeções, definida pelo dono do negócio). Vem depois da oferta, de que
 *                   depende, e ANTES do preço: valor e desconto são do bloco de preço, que vence.
 *   4. `anuncio`  — INFORMATIVO: de que anúncio a pessoa veio.
 *   5. `estilo`   — ESTILO UNIVERSAL: o que a agente já repetiu (abertura, fecho,
 *                   frase feita, emoji). Regra de forma, a mais fraca do prompt.
 *   6. `fluxo`    — DIRETIVO: o objetivo da etapa de um fluxo que pôs este agente no comando (nó
 *                   "Agente de IA") e quantas respostas restam. Geral: vem ANTES dos diretivos
 *                   específicos do funil, que vencem se houver conflito.
 *   7. `leitura`  — DIRETIVO: qual carta revelar agora (ou a causa raiz).
 *   8. `preco`    — DIRETIVO: o degrau de preço e o que dizer.
 *   9. `entrega`  — DIRETIVO: o guia do trabalho que a pessoa já pagou.
 *  10. `limites`  — PROIBIÇÃO DO DONO: o que o agente nunca diz nem promete e os assuntos que não
 *                   discute (aba Limites). ÚLTIMO de propósito: o que o dono PROÍBE tem de vencer o que
 *                   o funil manda — se um limite conflita com leitura, preço ou entrega, o limite ganha.
 *
 * A base, o informativo e o estilo vão ANTES dos diretivos para que, num
 * conflito, leitura, preço e entrega vençam: o modelo dá mais peso ao que vem por
 * último. (O estilo ainda diz, no próprio texto, que molde literal manda; e a
 * identidade também.) A identidade vem ANTES do estilo de propósito: o estilo
 * universal é a regra mais fraca e não desfaz uma escolha explícita do cliente.
 * Entre os diretivos a ordem é a do funil (revelar → cobrar → entregar). Os limites do
 * dono fecham a fila: a proibição vence o funil, e não o contrário.
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
export const BLOCOS_DO_TURNO = ['identidade', 'oferta', 'objecoes', 'anuncio', 'estilo', 'fluxo', 'leitura', 'preco', 'entrega', 'limites'] as const;

export type NomeDoBlocoDoTurno = (typeof BLOCOS_DO_TURNO)[number];

/** Um texto por bloco; '' quando o bloco não se aplica a este turno. */
export type BlocosDoTurno = Record<NomeDoBlocoDoTurno, string>;

/** O system do turno: a base + os blocos que se aplicam, na ordem de `BLOCOS_DO_TURNO`. */
export function comporSystemDoTurno(system: string, blocos: BlocosDoTurno): string {
  return BLOCOS_DO_TURNO.reduce((texto, nome) => texto + blocos[nome], system);
}
