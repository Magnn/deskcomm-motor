/**
 * A MEDITAÇÃO DA SEMANA — uma meditação guiada feita para a pessoa, com o céu dela: o Sol e a Lua do nascimento
 * (`ceu.ts`), a fase da lua desta semana (`lua.ts`) e o foco que ela escolheu na entrada (`perfil.ts`).
 *
 * Veio dos comentários das lojas (02/11/2026): a meditação guiada semanal, falada, sobre o céu da semana, é o
 * recurso mais elogiado do CHANI, e no MagicWay pedem "meditação por signo". Aqui ela é escrita por regra, sem
 * custo de IA, e narrada pela voz do servidor (`meditacao-voz.ts`). Muda toda segunda-feira.
 *
 * Tom da casa: acolhe, não promete acontecimento, não fala de doença, morte ou prazo.
 *
 * O roteiro é uma lista de TRECHOS, cada um com o silêncio que vem depois: é esse silêncio que deixa a pessoa
 * respirar. A narração junta os trechos com silêncio de verdade; o texto na tela mostra os mesmos trechos.
 */
import { createHash } from "node:crypto";

import { elementoDoSigno, ehSigno, type Elemento } from "./horoscopo";
import { faseDaLua, type FaseDaLua } from "./lua";
import type { Foco } from "./perfil";

export interface TrechoDaMeditacao {
  texto: string;
  /** Segundos de silêncio depois do trecho. */
  pausa: number;
}

export interface MeditacaoDaSemana {
  /** A segunda-feira da semana (AAAA-MM-DD): a meditação muda com ela. */
  semana: string;
  titulo: string;
  /** O que fez esta meditação ser dela, numa linha ("Sol em Leão · Lua em Peixes · lua crescente"). */
  feitaCom: string;
  trechos: TrechoDaMeditacao[];
}

export interface CeuDaMeditacao {
  sol: string | null;
  lua: string | null;
}

/** A segunda-feira da semana de `dia` (AAAA-MM-DD, no fuso da empresa). */
export function semanaDaMeditacao(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const desdeSegunda = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desdeSegunda);
  return d.toISOString().slice(0, 10);
}

/** A fase da lua que marca a semana: a do meio dela (quinta-feira). */
export function faseDaSemana(semana: string): FaseDaLua {
  return faseDaLua(new Date(Date.parse(`${semana}T12:00:00Z`) + 3 * 86_400_000));
}

const NOME_DA_FASE: Record<FaseDaLua, string> = { nova: "lua nova", crescente: "lua crescente", cheia: "lua cheia", minguante: "lua minguante" };

/** A imagem do corpo, pelo elemento do Sol: onde a pessoa se apoia. */
const IMAGEM_DO_SOL: Record<Elemento, string[]> = {
  fogo: [
    "Imagine uma pequena chama acesa no meio do seu peito. Ela não queima. Ela aquece.",
    "A cada vez que você solta o ar, a chama fica um pouco mais calma, mais firme, mais dourada.",
  ],
  terra: [
    "Sinta o peso do seu corpo apoiado. Imagine raízes saindo dos seus pés e descendo devagar para dentro da terra.",
    "A terra segura você. Você não precisa segurar tudo sozinha agora.",
  ],
  ar: [
    "Imagine uma brisa leve entrando pela janela e passando por você.",
    "A cada respiração, ela leva embora um pensamento que estava pesando, e deixa espaço.",
  ],
  agua: [
    "Imagine o mar à noite, calmo, com a lua refletida na água.",
    "As ondas chegam e voltam no ritmo da sua respiração. Chegam… e voltam.",
  ],
};

/** O que a Lua do nascimento pede, pelo elemento dela: a necessidade do coração. */
const PEDIDO_DA_LUA: Record<Elemento, string> = {
  fogo: "ser vista, se mover e ter coragem de sentir",
  terra: "segurança, rotina e o conforto das coisas simples",
  ar: "conversar, entender e ter espaço para respirar",
  agua: "acolhimento, silêncio e alguém que sinta junto",
};

/** O convite da fase da lua desta semana. */
const CONVITE_DA_FASE: Record<FaseDaLua, string[]> = {
  nova: [
    "Esta é uma semana de lua nova: o céu escuro, pronto para começar de novo.",
    "É tempo de plantar uma intenção. Pequena, verdadeira, só sua.",
  ],
  crescente: [
    "Esta semana a lua está crescendo, um pouco mais iluminada a cada noite.",
    "É tempo de dar um passo, mesmo pequeno, na direção do que você quer.",
  ],
  cheia: [
    "Esta semana a lua está cheia, iluminando tudo.",
    "É tempo de agradecer o que já chegou e de enxergar com clareza o que você sente.",
  ],
  minguante: [
    "Esta semana a lua está minguando, recolhendo a sua luz.",
    "É tempo de soltar. O que já não cabe pode ir, com carinho.",
  ],
};

/** A intenção pelo foco escolhido na entrada; sem foco, uma geral. */
const INTENCAO: Record<Foco | "geral", string> = {
  amor: "Eu me abro para um amor que me trate com cuidado, e começo cuidando de mim.",
  dinheiro: "Eu mereço prosperar, e dou hoje um passo firme pelo meu sustento.",
  familia: "Eu levo paz para a minha casa, começando pela paz dentro de mim.",
  saude: "Eu respeito o meu corpo e devolvo a ele o descanso que ele pede.",
  caminhos: "Eu confio no meu passo, mesmo quando ainda não vejo o caminho inteiro.",
  autoconhecimento: "Eu me escuto com paciência, e o que eu sinto tem lugar aqui.",
  geral: "Eu me permito descansar, e confio no que está chegando para mim.",
};

/** Abertura e fechamento variam de semana para semana, para não virar repetição. */
const ABERTURAS = [
  "Procure um lugar tranquilo, onde ninguém vá te interromper pelos próximos minutos.",
  "Se puder, apague uma luz, deixe o celular de lado e se acomode do jeito mais confortável.",
  "Sente-se ou deite-se. Afrouxe o que estiver apertando. Este tempo é só seu.",
];

function escolha<T>(lista: readonly T[], semente: string): T {
  const n = createHash("sha256").update(semente, "utf8").digest().readUInt32BE(0);
  return lista[n % lista.length]!;
}

/**
 * O roteiro da meditação da semana. `nome` é o primeiro nome (vazio = sem nome); `ceu` vem da data de
 * nascimento (sem ela, a meditação fica só com a lua da semana e o foco).
 */
export function meditacaoDaSemana(d: {
  semente: string;
  dia: string;
  nome: string;
  ceu: CeuDaMeditacao | null;
  foco: Foco | null;
}): MeditacaoDaSemana {
  const semana = semanaDaMeditacao(d.dia);
  const fase = faseDaSemana(semana);
  const sol = d.ceu?.sol && ehSigno(d.ceu.sol) ? d.ceu.sol : null;
  const lua = d.ceu?.lua && ehSigno(d.ceu.lua) ? d.ceu.lua : null;
  const elementoDoSol: Elemento = sol ? elementoDoSigno(sol) : fase === "cheia" || fase === "nova" ? "agua" : "ar";
  const nome = d.nome.trim();
  const semente = `${d.semente}:${semana}`;

  const trechos: TrechoDaMeditacao[] = [
    { texto: `${nome ? `${nome}, esta` : "Esta"} é a sua meditação da semana.`, pausa: 1 },
    { texto: escolha(ABERTURAS, `abertura:${semente}`), pausa: 3 },
    { texto: "Quando estiver pronta, feche os olhos.", pausa: 3 },
    { texto: "Puxe o ar devagar pelo nariz, contando até quatro.", pausa: 4 },
    { texto: "Segure um instante.", pausa: 2 },
    { texto: "E solte pela boca, bem devagar, como quem apaga uma vela sem pressa.", pausa: 5 },
    { texto: "Mais uma vez. Puxe o ar…", pausa: 4 },
    { texto: "e solte.", pausa: 5 },
    { texto: "Agora deixe a respiração voltar ao ritmo dela. Você não precisa controlar nada.", pausa: 6 },
  ];

  if (sol) {
    trechos.push({ texto: `Você nasceu com o Sol em ${sol}.`, pausa: 2 });
  }
  IMAGEM_DO_SOL[elementoDoSol].forEach((texto, i) => trechos.push({ texto, pausa: i === 0 ? 6 : 8 }));

  if (lua) {
    const pedido = PEDIDO_DA_LUA[elementoDoSigno(lua)];
    trechos.push({ texto: `A sua Lua de nascimento está em ${lua}. O seu coração pede ${pedido}.`, pausa: 4 });
    trechos.push({ texto: "Coloque uma mão sobre o peito e pergunte, em silêncio: do que eu preciso esta semana?", pausa: 12 });
    trechos.push({ texto: "Seja o que for que apareceu, está tudo bem. Só receba.", pausa: 6 });
  }

  CONVITE_DA_FASE[fase].forEach((texto, i) => trechos.push({ texto, pausa: i === 0 ? 3 : 8 }));

  const intencao = INTENCAO[d.foco ?? "geral"];
  trechos.push({ texto: "Repita comigo, em pensamento.", pausa: 2 });
  trechos.push({ texto: intencao, pausa: 7 });
  trechos.push({ texto: "Mais uma vez, devagar.", pausa: 1 });
  trechos.push({ texto: intencao, pausa: 10 });

  trechos.push({ texto: "Agora, aos poucos, volte a sentir o seu corpo. Mexa os dedos das mãos e dos pés.", pausa: 5 });
  trechos.push({ texto: "Respire fundo uma última vez.", pausa: 4 });
  trechos.push({
    texto: `E quando quiser, abra os olhos. ${nome ? `Boa semana, ${nome}.` : "Boa semana."} Na semana que vem tem outra, feita para você.`,
    pausa: 1,
  });

  const feitaCom = [sol ? `Sol em ${sol}` : null, lua ? `Lua em ${lua}` : null, NOME_DA_FASE[fase]].filter(Boolean).join(" · ");
  return { semana, titulo: TITULO_DA_FASE[fase], feitaCom, trechos };
}

const TITULO_DA_FASE: Record<FaseDaLua, string> = {
  nova: "Plantar uma intenção",
  crescente: "Um passo de cada vez",
  cheia: "Clareza e gratidão",
  minguante: "Soltar com carinho",
};

/** Quanto dura, em minutos inteiros (fala estimada em ~2,4 palavras por segundo + silêncios). */
export function duracaoEstimada(m: MeditacaoDaSemana): number {
  const s = m.trechos.reduce((t, x) => t + x.texto.split(/\s+/).length / 2.4 + x.pausa, 0);
  return Math.max(1, Math.round(s / 60));
}
