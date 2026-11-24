/**
 * A NOTA DO PIXEL — a qualidade de correspondência (EMQ, 0–10) que a Meta dá a cada evento do conjunto
 * de dados do site. É o que decide se a campanha otimizada por compra acha comprador: nota baixa é a
 * Meta sem saber QUEM comprou.
 *
 * Lida pela API de qualidade de dataset com o token de ENVIO (o que já manda as conversões). Só existe
 * para eventos de SITE: conjunto só de mensageria devolve vazio, e vazio aqui é "sem nota", não erro.
 * Falha vira `null` e não derruba o painel — a nota é um sinal, não a tela.
 *
 * Token no cabeçalho, nunca na URL (CLAUDE.md, anti-pattern 12).
 */
import { graphVersion } from "@/lib/graph-version";

const TETO_MS = 6_000;

export interface NotaDoEvento {
  evento: string;
  nota: number;
}

interface Resposta {
  web?: Array<{ event_name?: string; event_match_quality?: { composite_score?: number } }>;
}

/** Os eventos que importam para a venda, nesta ordem; o resto do conjunto não entra no painel. */
const EVENTOS = ["Purchase", "Lead", "Contact", "InitiateCheckout"];

export async function lerNotaDoConjunto(
  token: string,
  datasetId: string,
  buscar: typeof fetch = fetch,
): Promise<NotaDoEvento[] | null> {
  if (!/^\d{5,25}$/.test(datasetId)) return null;
  const qs = new URLSearchParams({
    dataset_id: datasetId,
    fields: "web{event_name,event_match_quality{composite_score}}",
  });
  try {
    const res = await buscar(`https://graph.facebook.com/${graphVersion()}/dataset_quality?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
    if (!res.ok) return null;
    const corpo = (await res.json()) as Resposta;
    const notas = (corpo.web ?? [])
      .filter((e) => e.event_name && typeof e.event_match_quality?.composite_score === "number")
      .map((e) => ({ evento: e.event_name as string, nota: Number((e.event_match_quality?.composite_score as number).toFixed(1)) }))
      .filter((e) => EVENTOS.includes(e.evento));
    return notas.sort((a, b) => EVENTOS.indexOf(a.evento) - EVENTOS.indexOf(b.evento));
  } catch {
    return null;
  }
}
