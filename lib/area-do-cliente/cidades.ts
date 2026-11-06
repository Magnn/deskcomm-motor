/**
 * A BUSCA DE CIDADE do mapa natal: nome → coordenadas e fuso (o fuso é o que acerta a hora do nascimento).
 *
 * Dados: GeoNames (CC BY 4.0, https://www.geonames.org), gerados por `scripts/cidades-geonames.py` — o mundo com 15
 * mil habitantes ou mais e o Brasil com 5 mil ou mais. Só no servidor: são 2,7 MB, carregados na primeira busca.
 * Cidade pequena que não está na lista: a pessoa escolhe a vizinha maior (alguns quilômetros mudam o Ascendente em
 * menos de um grau).
 */
export interface Cidade {
  id: number;
  nome: string;
  pais: string;
  estado: string;
  latitude: number;
  longitude: number;
  fuso: string;
}

type Linha = [number, string, string, string, number, number, string, number];

let indice: { linha: Linha; chave: string }[] | null = null;

export const semAcento = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

async function carregar(): Promise<NonNullable<typeof indice>> {
  if (!indice) {
    const { default: linhas } = (await import("./dados/cidades.json")) as unknown as { default: Linha[] };
    indice = linhas.map((linha) => ({ linha, chave: semAcento(linha[1]) }));
  }
  return indice;
}

const cidadeDa = (l: Linha): Cidade => ({ id: l[0], nome: l[1], pais: l[2], estado: l[3], latitude: l[4], longitude: l[5], fuso: l[6] });

/**
 * As cidades que começam pelo texto (sem acento nem maiúscula), da mais populosa para a menor, com as do país de
 * preferência primeiro. "chapeco" acha Chapecó; "sao paulo" acha São Paulo antes de São Paulo de Olivença.
 */
export async function buscarCidades(texto: string, paisPreferido: string | null, limite = 8): Promise<Cidade[]> {
  const q = semAcento(texto);
  if (q.length < 2) return [];
  const lista = await carregar(); // já vem da mais populosa para a menor
  const achadas: Linha[] = [];
  for (const { linha, chave } of lista) if (chave.startsWith(q)) achadas.push(linha);
  if (paisPreferido) achadas.sort((a, b) => Number(b[2] === paisPreferido) - Number(a[2] === paisPreferido));
  return achadas.slice(0, limite).map(cidadeDa);
}

export async function cidadePorId(id: number): Promise<Cidade | null> {
  const l = (await carregar()).find((x) => x.linha[0] === id);
  return l ? cidadeDa(l.linha) : null;
}
