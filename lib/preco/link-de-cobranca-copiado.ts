/**
 * LINK DE CARTÃO É CRIADO PELO SISTEMA, NUNCA COPIADO PELA AGENTE.
 *
 * Todo link `buy.stripe.com` que chega à pessoa é criado na hora do envio, para UM valor, a partir da marca de
 * cobrança ou do link oficial do trabalho — e não muda de valor depois. Em 20/11/2026 a agente gerou o link da
 * pergunta de R$ 7, mudou para a de R$ 27 no balão seguinte e passou a COPIAR aquele link do histórico dizendo que
 * era de R$ 81: a cliente pagou R$ 7 no cartão, e a agente inventou que "o link é o mesmo para todos os valores".
 *
 * Por isso, no texto que a agente escreve (antes de o sistema trocar as marcas), um endereço do provedor que não
 * esteja cadastrado em lugar nenhum da configuração é cópia de cobrança antiga: o envio é recusado. Pura.
 */
const HOST_DE_COBRANCA_GERADA = /^(?:buy|checkout)\.stripe\.com$/i;

const semProtocolo = (url: string): string => url.replace(/^https?:\/\//i, "").replace(/[/.,;:!?)]+$/, "");

/** Todo endereço escrito em qualquer lugar da configuração do agente (preço, catálogo, pós-venda…). */
function urlsCadastradas(configuracao: unknown): Set<string> {
  const achados = new Set<string>();
  (function andar(v: unknown): void {
    if (typeof v === "string") {
      for (const m of v.matchAll(/https?:\/\/\S+/gi)) achados.add(semProtocolo(m[0]));
    } else if (Array.isArray(v)) v.forEach(andar);
    else if (v && typeof v === "object") Object.values(v).forEach(andar);
  })(configuracao);
  return achados;
}

export function linkDeCobrancaCopiado(corpo: string, configuracao: unknown): string | null {
  let cadastradas: Set<string> | null = null;
  for (const m of corpo.matchAll(/(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s)]*)?/gi)) {
    if (!HOST_DE_COBRANCA_GERADA.test(m[1]!)) continue;
    const url = semProtocolo(m[0]);
    cadastradas ??= urlsCadastradas(configuracao);
    if (cadastradas.has(url)) continue;
    return (
      `O link ${url} é de uma cobrança anterior e NÃO pode ser reenviado: cada link de cartão é criado para UM valor e esse valor nunca muda. ` +
      `Reescreva sem esse link. Para cobrar, escreva a marca [[PIX: nome da cobrança]] (com a quantidade, se forem várias) ou o link oficial do trabalho: ` +
      `o sistema manda a chave e um link de cartão NOVO no valor certo. Nunca diga que o link aceita outro valor ou que o valor se digita na tela.`
    );
  }
  return null;
}
