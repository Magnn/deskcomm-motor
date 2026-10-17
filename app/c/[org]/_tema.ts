/**
 * A cara da área do cliente: uma noite estrelada no alto, papel marfim embaixo,
 * dourado nos detalhes e títulos com serifa. Mora aqui, num lugar só, para que
 * página, recibo, presente e as partes do navegador falem a mesma língua visual.
 *
 * A cor da empresa (`config.cor`) continua sendo a cor de AÇÃO — botões e
 * links. O resto da paleta é fixo de propósito: é o que faz a área parecer um
 * lugar, e não um formulário.
 *
 * A fonte (o Fraunces) é carregada em `_fonte.ts`, só pelas páginas do
 * servidor; aqui ficam apenas as classes, que as partes do navegador também usam.
 */
/** Títulos: a serifa, com a forma "macia" do Fraunces. */
export const SERIF = "font-[family-name:var(--font-area-serif)] [font-variation-settings:'SOFT'_100]";

/** O fundo da página e a tinta do texto. */
export const PAGINA = "min-h-screen bg-[#f8f4ec] text-[#241f31]";

/** O céu do topo: noite funda com um brilho da cor da empresa e estrelas. */
export const CEU =
  "relative overflow-hidden bg-[#140f26] text-[#f6f0e4] " +
  "bg-[radial-gradient(1px_1px_at_12%_22%,rgba(255,255,255,0.75),transparent),radial-gradient(1px_1px_at_68%_14%,rgba(255,255,255,0.6),transparent),radial-gradient(1.5px_1.5px_at_84%_48%,rgba(240,214,150,0.8),transparent),radial-gradient(1px_1px_at_32%_64%,rgba(255,255,255,0.5),transparent),radial-gradient(1px_1px_at_52%_36%,rgba(255,255,255,0.45),transparent),radial-gradient(1.5px_1.5px_at_22%_86%,rgba(240,214,150,0.6),transparent),radial-gradient(1px_1px_at_92%_80%,rgba(255,255,255,0.5),transparent)]";

/** Cartão padrão: papel branco, borda quente, sombra longa e baixa. */
export const CARTAO =
  "rounded-3xl border border-[#ebe3d3] bg-white p-6 shadow-[0_1px_2px_rgba(36,31,49,0.04),0_12px_32px_-16px_rgba(36,31,49,0.18)]";

/** Cartão escuro, para o que é especial (Círculo, Ano Pessoal). */
export const CARTAO_NOTURNO =
  "relative overflow-hidden rounded-3xl border border-[#c9a54e]/40 bg-[#1b1433] p-6 text-[#f6f0e4] shadow-[0_18px_40px_-18px_rgba(20,15,38,0.7)]";

/** A linha dourada pequena acima de um título. */
export const SOBRETITULO = "text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a8842f]";
export const SOBRETITULO_NOTURNO = "text-[11px] font-semibold uppercase tracking-[0.22em] text-[#e2c47a]";

export const TEXTO_SUAVE = "text-[15px] leading-relaxed text-[#5f586c]";
export const DETALHE = "text-xs text-[#8b8497]";

export const CAMPO =
  "w-full rounded-2xl border border-[#e4dccb] bg-[#fdfbf7] px-4 py-3 text-base text-[#241f31] placeholder:text-[#a59eb0] outline-hidden transition focus:border-[#a8842f] focus:bg-white focus:ring-4 focus:ring-[#c9a54e]/15";

/** Botão principal: pílula cheia, na cor da empresa (vai no `style`). */
export const BOTAO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(36,31,49,0.6)] transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none motion-reduce:transition-none";

/** Botão secundário: contorno na cor da empresa. */
export const BOTAO_CONTORNO =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 bg-white px-6 text-[15px] font-semibold transition hover:bg-[#fbf8f2] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none";

export const OURO = "#c9a54e";
