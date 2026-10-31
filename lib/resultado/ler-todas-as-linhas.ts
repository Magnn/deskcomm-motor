/**
 * LER TODAS AS LINHAS, EM PÁGINAS. A REST do Supabase entrega no máximo 1.000 linhas por pedido, sem erro e
 * sem aviso. Medido em 31/10/2026: a aba Atendimento mostrava 996 leads atendidos contra 3.576 no banco, e a
 * soma das colunas do funil era exatamente 1.000 contra 3.597 negócios.
 *
 * `pedir` precisa ordenar por uma coluna única: sem isso, duas páginas podem repetir ou pular linhas.
 */
const PAGINA = 1000;

export async function lerTodasAsLinhas<T>(
  pedir: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pedir(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return linhas;
  }
}
