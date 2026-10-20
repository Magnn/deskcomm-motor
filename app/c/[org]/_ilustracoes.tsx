/**
 * AS ILUSTRAÇÕES DA VITRINE — traço dourado sobre a noite, uma por tema.
 *
 * Desenhadas em vetor, à mão (20/10/2026): os cartões do Explorar levavam só um ícone apagado no canto, e o que
 * faz uma área como esta parecer um lugar (Co-Star, Labyrinthos) é a ilustração própria. Vetor porque fica nítido
 * em qualquer tela, pesa quase nada e segue o MESMO traço em todas — imagem gerada não manteria o conjunto.
 *
 * São por TEMA, não por produto: a área serve qualquer empresa, e o nome do produto é dela. `temaDaIlustracao`
 * escolhe pelo nome ("Simpatia da Prosperidade" → moedas); o que não casa fica com a vela.
 */
import type { ReactNode } from "react";

export type TemaDaIlustracao =
  | "coracao"
  | "moedas"
  | "protecao"
  | "chave"
  | "mel"
  | "ervas"
  | "sal"
  | "vela"
  | "lua"
  | "estrela"
  | "presente"
  | "livro"
  | "fases"
  | "cartas";

/** O tema pelo nome do produto. A ordem importa: o mais específico vem antes. */
const REGRAS: ReadonlyArray<[RegExp, TemaDaIlustracao]> = [
  [/\bmel\b|pote|ado[çc]/i, "mel"],
  [/banho|alecrim|erva|arruda|folha/i, "ervas"],
  [/\bsal\b|copo|[aá]gua/i, "sal"],
  [/prosper|dinheiro|moeda|abund/i, "moedas"],
  [/prote[çc]|limpeza|casa|lar|inveja|olho/i, "protecao"],
  [/caminho|desbloq|emprego|chave|recome/i, "chave"],
  [/amor|cora[çc]|sinastria|la[çc]o|casal|paix/i, "coracao"],
  [/c[ií]rculo|\blua\b/i, "lua"],
  [/ano pessoal|numerolog|estrela/i, "estrela"],
  [/presente/i, "presente"],
  [/grim[oó]rio|livro/i, "livro"],
  [/pergunta|tar[oô]|carta|leitura|mesa/i, "cartas"],
];

export function temaDaIlustracao(nome: string): TemaDaIlustracao {
  return REGRAS.find(([re]) => re.test(nome))?.[1] ?? "vela";
}

/** Pontinhos de estrela que dão a "noite" ao redor de cada desenho. */
function Estrelas({ pontos }: { pontos: ReadonlyArray<[number, number, number]> }) {
  return (
    <g fill="#e2c47a">
      {pontos.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} opacity={0.35 + (i % 3) * 0.2} />
      ))}
    </g>
  );
}

/** A estrela de quatro pontas, o "brilho" que se repete em todas. */
function Brilho({ x, y, r = 6 }: { x: number; y: number; r?: number }) {
  return <path d={`M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`} fill="#f0dca8" />;
}

const DESENHOS: Record<TemaDaIlustracao, ReactNode> = {
  coracao: (
    <>
      <circle cx="100" cy="102" r="62" strokeDasharray="2 6" opacity="0.5" />
      <path d="M100 150C64 124 46 104 46 82a24 24 0 0 1 54-14a24 24 0 0 1 54 14c0 22-18 42-54 68Z" fill="#c9a54e" fillOpacity="0.12" />
      <path d="M100 136C76 118 64 104 64 88a16 16 0 0 1 36-9" opacity="0.6" />
      <path d="M100 44V28M70 52 62 38M130 52 138 38" />
      <Brilho x={150} y={60} r={7} />
      <Brilho x={56} y={140} r={5} />
    </>
  ),
  moedas: (
    <>
      <ellipse cx="100" cy="146" rx="46" ry="10" fill="#c9a54e" fillOpacity="0.12" />
      <path d="M54 146v-12M146 146v-12" />
      <ellipse cx="100" cy="134" rx="46" ry="10" />
      <path d="M62 134v-12M138 134v-12" />
      <ellipse cx="100" cy="122" rx="38" ry="9" fill="#c9a54e" fillOpacity="0.1" />
      <circle cx="100" cy="78" r="30" fill="#c9a54e" fillOpacity="0.14" />
      <circle cx="100" cy="78" r="22" />
      <path d="M100 64v28M92 70c0-6 16-6 16 0s-16 6-16 14 16 6 16 0" />
      <Brilho x={148} y={54} r={7} />
      <Brilho x={52} y={70} r={5} />
    </>
  ),
  protecao: (
    <>
      <path d="M100 34 152 54v38c0 34-22 56-52 70-30-14-52-36-52-70V54Z" fill="#c9a54e" fillOpacity="0.1" />
      <path d="M68 96c14-18 50-18 64 0-14 18-50 18-64 0Z" />
      <circle cx="100" cy="96" r="9" fill="#c9a54e" fillOpacity="0.35" />
      <path d="M100 60v8M78 66l4 7M122 66l-4 7" opacity="0.7" />
      <Brilho x={160} y={36} r={6} />
    </>
  ),
  chave: (
    <>
      <path d="M40 160 92 108" strokeDasharray="3 6" opacity="0.55" />
      <circle cx="122" cy="76" r="26" fill="#c9a54e" fillOpacity="0.12" />
      <circle cx="122" cy="76" r="12" />
      <path d="M104 94 66 132l10 10M78 120l10 10" />
      <path d="M150 40l8-8M160 60h10M140 30V20" opacity="0.7" />
      <Brilho x={48} y={58} r={6} />
    </>
  ),
  mel: (
    <>
      <path d="M68 70h64l-4 14c10 8 14 20 14 34 0 26-18 38-42 38s-42-12-42-38c0-14 4-26 14-34Z" fill="#c9a54e" fillOpacity="0.14" />
      <path d="M66 58h68v12H66Z" />
      <path d="M72 112c10 6 46 6 56 0" opacity="0.6" />
      <path d="M150 44v26c0 6-8 6-8 0" />
      <path d="M150 44c-4-4-12 0-8 6" opacity="0.6" />
      <Brilho x={52} y={52} r={6} />
      <Brilho x={156} y={130} r={5} />
    </>
  ),
  ervas: (
    <>
      <path d="M100 160C100 120 96 84 84 46" />
      <path d="M96 118c-16-4-26-14-28-28 14 2 24 10 28 28ZM94 90c14-4 22-14 22-26-12 2-20 10-22 26ZM90 70c-12-4-18-12-18-22 10 2 16 8 18 22Z" fill="#c9a54e" fillOpacity="0.16" />
      <path d="M100 134c16-4 26-14 28-28-14 2-24 10-28 28Z" fill="#c9a54e" fillOpacity="0.16" />
      <path d="M46 150c14-10 30-10 44 0M110 150c14-10 30-10 44 0" opacity="0.5" />
      <Brilho x={142} y={56} r={6} />
    </>
  ),
  sal: (
    <>
      <path d="M68 60h64l-8 92H76Z" fill="#c9a54e" fillOpacity="0.08" />
      <path d="M72 96h56" opacity="0.6" />
      <path d="M78 140c8-10 36-10 44 0" />
      <g fill="#f0dca8">
        <rect x="88" y="128" width="5" height="5" transform="rotate(20 90 130)" />
        <rect x="102" y="130" width="4" height="4" transform="rotate(-15 104 132)" />
        <rect x="112" y="126" width="5" height="5" transform="rotate(35 114 128)" />
      </g>
      <Brilho x={150} y={50} r={7} />
      <Brilho x={50} y={110} r={5} />
    </>
  ),
  vela: (
    <>
      <path d="M100 40c10 14 10 26 0 34-10-8-10-20 0-34Z" fill="#f0dca8" fillOpacity="0.55" />
      <circle cx="100" cy="62" r="26" fill="#c9a54e" fillOpacity="0.12" stroke="none" />
      <path d="M100 74v8" />
      <path d="M82 82h36v66H82Z" fill="#c9a54e" fillOpacity="0.1" />
      <path d="M82 98c6 4 10 0 12 6" opacity="0.6" />
      <path d="M60 148h80" />
      <Brilho x={148} y={58} r={6} />
      <Brilho x={54} y={84} r={5} />
    </>
  ),
  lua: (
    <>
      <circle cx="100" cy="100" r="62" strokeDasharray="2 6" opacity="0.5" />
      <path d="M118 52a50 50 0 1 0 20 76 40 40 0 1 1-20-76Z" fill="#c9a54e" fillOpacity="0.16" />
      <Brilho x={128} y={86} r={7} />
      <Brilho x={146} y={118} r={4} />
      <Brilho x={60} y={52} r={5} />
    </>
  ),
  estrela: (
    <>
      <circle cx="100" cy="100" r="60" opacity="0.4" />
      <path d="M100 46 114 86 156 88 122 112 134 152 100 128 66 152 78 112 44 88 86 86Z" fill="#c9a54e" fillOpacity="0.14" />
      <circle cx="100" cy="102" r="12" />
      <Brilho x={158} y={50} r={6} />
    </>
  ),
  presente: (
    <>
      <path d="M58 92h84v58H58Z" fill="#c9a54e" fillOpacity="0.1" />
      <path d="M52 78h96v14H52ZM100 78v72" />
      <path d="M100 78c-10-22-34-22-30-6 2 6 20 6 30 6ZM100 78c10-22 34-22 30-6-2 6-20 6-30 6Z" />
      <Brilho x={150} y={50} r={7} />
      <Brilho x={50} y={56} r={5} />
    </>
  ),
  livro: (
    <>
      <path d="M100 66c-16-10-38-12-56-6v86c18-6 40-4 56 6 16-10 38-12 56-6V60c-18-6-40-4-56 6Z" fill="#c9a54e" fillOpacity="0.1" />
      <path d="M100 66v86" />
      <path d="M58 84c12-3 24-2 32 2M58 100c12-3 24-2 32 2M110 86c8-4 20-5 32-2M110 102c8-4 20-5 32-2" opacity="0.55" />
      <Brilho x={100} y={42} r={8} />
    </>
  ),
  fases: (
    <>
      <circle cx="46" cy="100" r="14" fill="#c9a54e" fillOpacity="0.1" />
      <path d="M78 86a14 14 0 1 0 0 28 10 14 0 0 1 0-28Z" fill="#c9a54e" fillOpacity="0.3" />
      <circle cx="122" cy="100" r="18" fill="#c9a54e" fillOpacity="0.4" />
      <path d="M160 86a14 14 0 1 1 0 28 10 14 0 0 0 0-28Z" fill="#c9a54e" fillOpacity="0.3" />
      <path d="M40 140c40 16 80 16 120 0" strokeDasharray="2 6" opacity="0.5" />
      <Brilho x={100} y={56} r={6} />
    </>
  ),
  cartas: (
    <>
      <path d="M58 62 104 52l16 92-46 10Z" fill="#c9a54e" fillOpacity="0.08" transform="rotate(-6 88 104)" />
      <path d="M90 56h46v92H90Z" fill="#c9a54e" fillOpacity="0.12" />
      <path d="M96 62h34v80H96Z" opacity="0.5" />
      <Brilho x={113} y={102} r={9} />
      <Brilho x={150} y={56} r={5} />
    </>
  ),
};

/** A ilustração do tema, em traço dourado. `classe` define o tamanho. */
export function Ilustracao({ tema, classe = "size-24" }: { tema: TemaDaIlustracao; classe?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden
      className={classe}
      fill="none"
      stroke="#e2c47a"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Estrelas pontos={[[30, 40, 1.4], [176, 92, 1.2], [160, 168, 1.6], [28, 170, 1.1], [70, 24, 1]]} />
      {DESENHOS[tema]}
    </svg>
  );
}
