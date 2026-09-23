import { ErroDeVoz } from "./erros";

/** Chamada HTTP com teto de espera — um provedor que pendura não pode pendurar o turno. */
export async function fetchComTempo(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    // Rede caída, DNS, timeout: tudo é "fora do ar" para quem chama. A mensagem
    // crua do `fetch` não sobe — não carrega nada que ajude e nada que devesse vazar.
    throw new ErroDeVoz("provedor_fora_do_ar");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Traduz uma resposta NÃO-OK do provedor para o vocabulário de `ErroDeVoz`.
 *
 * O corpo da resposta é lido só para procurar sinais conhecidos (ex.: plano sem
 * clonagem) e NUNCA é copiado para a exceção: o erro de um provedor de síntese
 * pode ecoar o texto que a pessoa ia ouvir.
 */
export async function erroDaResposta(res: Response, contexto: "sintese" | "clonagem" | "outro" = "outro"): Promise<ErroDeVoz> {
  const status = res.status;
  let corpo = "";
  try {
    corpo = (await res.text()).slice(0, 2000).toLowerCase();
  } catch {
    // sem corpo legível: o status basta
  }
  if (status === 401) return new ErroDeVoz("chave_invalida", status);
  if (status === 403) {
    if (contexto === "clonagem" || /clon|instant_voice|can_use_instant|subscription|plan/.test(corpo)) {
      return new ErroDeVoz("sem_permissao_de_clonagem", status);
    }
    return new ErroDeVoz("chave_invalida", status);
  }
  if (status === 404) return new ErroDeVoz("voz_inexistente", status);
  if (status === 429 || /quota|limit_exceeded|rate_limit|insufficient_quota/.test(corpo)) {
    return new ErroDeVoz("limite_do_provedor", status);
  }
  if (contexto === "clonagem" && (status === 400 || status === 422)) {
    if (/clon|instant_voice|can_use_instant|subscription|plan|upgrade/.test(corpo)) {
      return new ErroDeVoz("sem_permissao_de_clonagem", status);
    }
    return new ErroDeVoz("amostra_invalida", status);
  }
  if (status >= 500) return new ErroDeVoz("provedor_fora_do_ar", status);
  return new ErroDeVoz("recusado", status);
}
