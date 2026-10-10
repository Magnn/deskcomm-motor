/**
 * O CONJUNTO DE DADOS DA CONTA DO WHATSAPP BUSINESS — onde a plataforma aceita conversão de mensageria.
 *
 * Mora em `lib/channels/` porque é aqui que o endereço do transporte da Meta pode ser escrito
 * (doutrina de restrição de canal, invariante 1). Quem precisa do destino pede a esta função.
 *
 * A leitura devolve o conjunto que a conta já tem; sem nenhum, a criação é o caminho que a própria
 * plataforma indica quando recusa um evento enviado ao conjunto errado. Nunca lança.
 */
import { VERSAO_PADRAO_DA_GRAPH } from "@/lib/graph-version";

const TEMPO_LIMITE_MS = 10_000;

/** O id do conjunto de dados que a resposta da plataforma traz — nos dois formatos que ela usa. Pura. */
export function idDoConjuntoDeDados(corpo: unknown): string | null {
  const c = corpo as { id?: unknown; data?: Array<{ id?: unknown }> } | null;
  const direto = typeof c?.id === "string" && c.id.trim() !== "" ? c.id.trim() : null;
  if (direto) return direto;
  const daLista = c?.data?.find((d) => typeof d?.id === "string" && d.id.trim() !== "")?.id;
  return typeof daLista === "string" ? daLista.trim() : null;
}

export async function conjuntoDeDadosDaConta(
  conta: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string } | { erro: string }> {
  const url = `https://graph.facebook.com/${VERSAO_PADRAO_DA_GRAPH}/${encodeURIComponent(conta)}/dataset`;
  const cabecalho = { authorization: `Bearer ${token}` };
  try {
    const leitura = await fetchImpl(url, { headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    const existente = leitura.ok ? idDoConjuntoDeDados(await leitura.json().catch(() => null)) : null;
    if (existente) return { id: existente };
    if (!leitura.ok && leitura.status !== 404) return { erro: `leitura do conjunto de dados: ${leitura.status}` };

    const criacao = await fetchImpl(url, { method: "POST", headers: cabecalho, signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
    const criado = criacao.ok ? idDoConjuntoDeDados(await criacao.json().catch(() => null)) : null;
    return criado ? { id: criado } : { erro: `criação do conjunto de dados: ${criacao.status}` };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "falha de rede" };
  }
}
