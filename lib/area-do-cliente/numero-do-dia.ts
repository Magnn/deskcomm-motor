/**
 * O NÚMERO E A COR DO DIA — pedido dos comentários das lojas (02/11/2026): "queria saber minha cor e meu número
 * de hoje".
 *
 * O número é o DIA PESSOAL da numerologia popular: o ano pessoal (dia + mês do nascimento + ano em curso) somado ao
 * mês e ao dia de hoje, reduzido a um algarismo de 1 a 9. Quem não contou o nascimento recebe o DIA UNIVERSAL (só a
 * data de hoje), e a tela diz que é "o número do dia", não "o seu". A cor segue a correspondência mais usada na
 * numerologia (1 vermelho … 9 dourado). Conta pura, sem IA e sem custo: muda à meia-noite no fuso da organização.
 */
export interface NumeroDoDia {
  numero: number;
  /** `true` = conta feita com o nascimento dela; `false` = dia universal. */
  pessoal: boolean;
  cor: string;
  hex: string;
  sentido: string;
}

function reduzir(n: number): number {
  let v = n;
  while (v > 9) v = String(v).split("").reduce((s, d) => s + Number(d), 0);
  return v;
}

/** A cor e o sentido de cada número (1–9). Os textos passam pelo `t()` da tela. */
export const CORES_DOS_NUMEROS: Record<number, { cor: string; hex: string; sentido: string }> = {
  1: { cor: "Vermelho", hex: "#e2574c", sentido: "Dia de começar: dê o primeiro passo naquilo que vem adiando." },
  2: { cor: "Laranja", hex: "#f0954a", sentido: "Dia de parceria: escute, combine, faça junto." },
  3: { cor: "Amarelo", hex: "#f2cf5b", sentido: "Dia de se expressar: fale o que sente, com leveza." },
  4: { cor: "Verde", hex: "#6cc48a", sentido: "Dia de organizar: uma tarefa resolvida já muda o dia." },
  5: { cor: "Azul-claro", hex: "#7cc3e8", sentido: "Dia de movimento: aceite uma mudança pequena de rota." },
  6: { cor: "Azul-anil", hex: "#6f7fe0", sentido: "Dia de cuidar: de casa, de quem você ama e de você." },
  7: { cor: "Violeta", hex: "#a77ce8", sentido: "Dia de silêncio: um momento só seu traz a resposta." },
  8: { cor: "Rosa", hex: "#ee8fb5", sentido: "Dia de colher: olhe para o que você já construiu." },
  9: { cor: "Dourado", hex: "#e8c987", sentido: "Dia de soltar: encerre o que já cumpriu o seu tempo." },
};

/**
 * O número de hoje (`hojeIso` = `AAAA-MM-DD` no fuso da organização). Com `nascimentoIso`, o dia pessoal; sem, o dia
 * universal.
 */
export function numeroDoDia(hojeIso: string, nascimentoIso: string | null | undefined): NumeroDoDia {
  const [ano, mes, dia] = hojeIso.split("-").map(Number) as [number, number, number];
  const nasc = nascimentoIso && /^\d{4}-\d{2}-\d{2}/.test(nascimentoIso) ? nascimentoIso : null;
  let numero: number;
  if (nasc) {
    const [, mm, dd] = nasc.split("-").map(Number) as [number, number, number];
    const anoPessoal = reduzir(reduzir(dd) + reduzir(mm) + reduzir(ano));
    numero = reduzir(anoPessoal + reduzir(mes) + reduzir(dia));
  } else {
    numero = reduzir(reduzir(ano) + reduzir(mes) + reduzir(dia));
  }
  return { numero, pessoal: nasc !== null, ...CORES_DOS_NUMEROS[numero]! };
}
