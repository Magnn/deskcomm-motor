/**
 * O DESENHO da marca do produto — símbolo e logotipo — como geometria pura.
 *
 * Mora aqui, e não num `.svg` em `public/`, por duas razões que a doutrina de
 * marca própria já paga:
 *
 *  1. `public/` é servido a todo mundo, sempre. Um arquivo fixo ali seria a
 *     marca do PRODUTO na instalação de um revendedor que configurou a dele —
 *     é exatamente o vazamento que `tests/unit/branding.test.ts` vigia. Como
 *     geometria, o desenho só aparece onde um componente decide que a marca em
 *     vigor é a padrão (`marcaEhADoProduto`, em `lib/branding.ts`).
 *  2. O favicon (`app/icon.tsx`) é gerado em runtime pelo `ImageResponse`, que
 *     aceita SVG inline mas não lê arquivo do disco. Um único desenho alimenta
 *     a tela e o ícone — dois arquivos divergiriam na primeira revisão da marca.
 *
 * As cores NÃO estão aqui de propósito: quem desenha escolhe (a tela lê os
 * tokens do tema; o favicon lê a régua do produto). A fonte deste arquivo são
 * os SVGs em `docs/brand/`; ao trocar a arte, regenere os dois lados a partir
 * deles.
 */

/** Glifo com a transformação que o posiciona no `viewBox` do logotipo. */
export type Glifo = { readonly transform: string; readonly d: string };

const A_ABERTO =
  "M28 196L88 28H128L188 196H158L146 162H70L58 196ZM83 132H133L108 62Z";

/**
 * O símbolo da AcassIA: um A geométrico com um módulo quadrado sob o travessão —
 * o ponto de IA dentro da letra. Quadrado de 216.
 */
export const SIMBOLO = {
  viewBox: "0 0 216 216",
  transform: "translate(0 0)",
  d: A_ABERTO,
  modulo: { x: 98, y: 174, width: 20, height: 20, rx: 3 },
} as const;

/**
 * O logotipo: símbolo + "Acass" + "IA", com o texto já convertido em caminhos
 * (Geist Regular, a fonte que o Next já embarca) — não depende de fonte
 * instalada nem de `@font-face`. "IA" leva a cor da marca; "Acass", a do texto.
 */
export const LOGOTIPO = {
  viewBox: "0 20 764 176",
  /** Proporção largura/altura do `viewBox`, para dimensionar por altura. */
  proporcao: 764 / 176,
  simbolo: { transform: "translate(-21 10) scale(0.9)", d: A_ABERTO, modulo: SIMBOLO.modulo },
  nome: [
    {
      transform: "translate(186 163) scale(0.15493 -0.15493)",
      d: "M20 0L276 710L392 710L648 0L554 0L483 202L185 202L114 0ZM214 286L454 286L334 635Z",
    },
    {
      transform: "translate(286.7 163) scale(0.15493 -0.15493)",
      d: "M287 -12Q213 -12 158.5 22Q104 56 74 118.5Q44 181 44 265Q44 349 74 411Q104 473 158.5 507.5Q213 542 287 542Q379 542 439 494.5Q499 447 512 358L424 352Q415 405 378 433.5Q341 462 287 462Q214 462 173 409.5Q132 357 132 265Q132 173 173 120.5Q214 68 287 68Q341 68 378 98Q415 128 424 188L512 182Q499 94 439 41Q379 -12 287 -12Z",
    },
    {
      transform: "translate(371.92 163) scale(0.15493 -0.15493)",
      d: "M223 -12Q141 -12 92.5 26Q44 64 44 132Q44 200 84 239Q124 278 211 294L399 329Q399 462 273 462Q218 462 186 437.5Q154 413 142 367L53 374Q68 449 125.5 495.5Q183 542 273 542Q375 542 429 484.5Q483 427 483 326L483 107Q483 74 511 74L532 74L532 0Q520 -2 500 -2Q454 -2 430.5 16.5Q407 35 401 77L400 82Q380 41 331 14.5Q282 -12 223 -12ZM231 62Q311 62 355 107Q399 152 399 218L399 256L227 224Q173 214 152.5 193.5Q132 173 132 140Q132 103 158.5 82.5Q185 62 231 62Z",
    },
    {
      transform: "translate(456.35 163) scale(0.15493 -0.15493)",
      d: "M273 -12Q164 -12 107 38.5Q50 89 44 167L132 173Q140 125 171.5 96.5Q203 68 273 68Q327 68 356.5 85.5Q386 103 386 142Q386 163 376.5 177Q367 191 339 201.5Q311 212 257 222Q183 236 141 257Q99 278 82 308Q65 338 65 380Q65 451 117.5 496.5Q170 542 266 542Q336 542 380.5 517.5Q425 493 448 454Q471 415 476 372L388 366Q384 404 356.5 433Q329 462 264 462Q207 462 180 440Q153 418 153 384Q153 345 178 326.5Q203 308 273 296Q351 283 395 263Q439 243 456.5 213.5Q474 184 474 142Q474 69 417.5 28.5Q361 -12 273 -12Z",
    },
    {
      transform: "translate(535.37 163) scale(0.15493 -0.15493)",
      d: "M273 -12Q164 -12 107 38.5Q50 89 44 167L132 173Q140 125 171.5 96.5Q203 68 273 68Q327 68 356.5 85.5Q386 103 386 142Q386 163 376.5 177Q367 191 339 201.5Q311 212 257 222Q183 236 141 257Q99 278 82 308Q65 338 65 380Q65 451 117.5 496.5Q170 542 266 542Q336 542 380.5 517.5Q425 493 448 454Q471 415 476 372L388 366Q384 404 356.5 433Q329 462 264 462Q207 462 180 440Q153 418 153 384Q153 345 178 326.5Q203 308 273 296Q351 283 395 263Q439 243 456.5 213.5Q474 184 474 142Q474 69 417.5 28.5Q361 -12 273 -12Z",
    },
  ] as readonly Glifo[],
  sufixo: [
    {
      transform: "translate(615.93 163) scale(0.15493 -0.15493)",
      d: "M92 0L92 710L178 710L178 0Z",
    },
    {
      transform: "translate(656.21 163) scale(0.15493 -0.15493)",
      d: "M20 0L276 710L392 710L648 0L554 0L483 202L185 202L114 0ZM214 286L454 286L334 635Z",
    },
  ] as readonly Glifo[],
} as const;

/**
 * As cores da marca do produto, por tema — os mesmos graus da régua
 * (`regua-do-produto.ts`): índigo 600/400 para o símbolo e o "IA", neutro
 * 900/0 para o nome. Copiadas dos SVGs de `docs/brand/`.
 */
export const CORES_DA_MARCA = {
  claro: { simbolo: "#4b3fb8", nome: "#1c1a16", sufixo: "#4b3fb8" },
  escuro: { simbolo: "#7c79fa", nome: "#f5f4ef", sufixo: "#7c79fa" },
} as const;
