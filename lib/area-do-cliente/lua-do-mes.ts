/**
 * "SUA LUA DO MÊS" (o modelo Spotify Wrapped): um cartão bonito com o mês da pessoa na área — a carta que mais
 * saiu para ela, quantas perguntas fez às cartas e quantas páginas escreveu no diário —, feito para mandar no
 * WhatsApp. É a divulgação que a própria cliente faz, de graça; o rodapé leva o endereço da área.
 *
 * Privacidade: o cartão NUNCA leva a pergunta nem o texto do diário, só números, o nome de uma carta e o
 * primeiro nome dela.
 *
 * Puro: a rota da imagem (`app/c/[org]/lua-do-mes/route.tsx`) lê os dados e chama `resumoDaLuaDoMes`.
 */

export interface ResumoDaLuaDoMes {
  /** `AAAA-MM`. */
  mes: string;
  /** A carta que mais saiu nas leituras do mês; no empate, a que saiu por último. `null` = nenhuma leitura. */
  cartaDoMes: string | null;
  perguntas: number;
  paginas: number;
}

/** O cartão só vale com alguma coisa vivida no mês: uma leitura ou uma página de diário. */
export function temLuaDoMes(r: ResumoDaLuaDoMes): boolean {
  return r.perguntas > 0 || r.paginas > 0;
}

export function resumoDaLuaDoMes(d: {
  mes: string;
  leituras: ReadonlyArray<{ quando: string; cartas: ReadonlyArray<{ nome: string }> }>;
  diario: ReadonlyArray<{ quando: string }>;
  /** O `AAAA-MM-DD` do instante no fuso da organização. */
  diaDe: (iso: string) => string;
}): ResumoDaLuaDoMes {
  const doMes = (iso: string) => d.diaDe(iso).slice(0, 7) === d.mes;
  const leituras = d.leituras.filter((l) => doMes(l.quando)).sort((a, b) => a.quando.localeCompare(b.quando));
  const contagem = new Map<string, { vezes: number; ultima: number }>();
  leituras.forEach((l, i) => {
    for (const nome of new Set(l.cartas.map((c) => c.nome))) {
      const atual = contagem.get(nome);
      contagem.set(nome, { vezes: (atual?.vezes ?? 0) + 1, ultima: i });
    }
  });
  let cartaDoMes: string | null = null;
  let melhor = { vezes: 0, ultima: -1 };
  for (const [nome, c] of contagem) {
    if (c.vezes > melhor.vezes || (c.vezes === melhor.vezes && c.ultima > melhor.ultima)) {
      cartaDoMes = nome;
      melhor = c;
    }
  }
  return { mes: d.mes, cartaDoMes, perguntas: leituras.length, paginas: d.diario.filter((p) => doMes(p.quando)).length };
}

export const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** O nome do mês de `AAAA-MM`, em português (a tela traduz). */
export function nomeDoMes(mes: string): string {
  return NOMES_DOS_MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
}
