/**
 * O BLOCO DE PREÇO — o que a agente lê sobre valor e negociação, montado da configuração
 * E do ponto em que a conversa está.
 *
 * Vai no FIM do prompt do turno (o prefixo estável fica intacto para o cache). Assim trocar o
 * valor na tela vale no PRÓXIMO turno, sem publicar versão do prompt e sem número escrito em
 * dois lugares. "Vale mais que qualquer valor escrito antes" existe porque o prompt de um
 * agente antigo ainda pode trazer um preço fixo.
 *
 * ─── Um molde só, escolhido pelo código ─────────────────────────────────────────────
 * Medido no painel de Teste: dada a escada inteira, o modelo pequeno errava o passo (repetia
 * a 1ª resposta na 2ª reclamação, ou oferecia o degrau na 1ª). Então o código conta as
 * reclamações (`estado-da-negociacao.ts`) e o bloco traz SÓ o molde do passo atual — os
 * degraus seguintes nem aparecem, e por isso também não vazam para a pessoa.
 *
 * O bloco ensina, mas quem GARANTE o piso é a trava de promessas
 * (`promise_table.minPriceCents`, ligada por `sincronizar-piso.ts`): se o modelo citar um
 * valor abaixo do mínimo, a mensagem é vetada antes de sair.
 */
import { pisoEmCentavos, reais, type PricingConfig } from "./tipos";

/** Como a pessoa paga aquele valor, numa frase que a agente pode dizer. */
function comoPagar(d: {
  coupon_code?: string | undefined;
  payment_url?: string | undefined;
  product_links?: readonly { name: string; url: string }[] | undefined;
}): string {
  // Um link por produto: o molde leva um marcador e a lista vem numa linha à parte, para a agente
  // mandar SÓ o link do produto que indicou (uma lista dentro do molde vazaria os outros).
  if ((d.product_links?.length ?? 0) > 0 && !d.coupon_code && !d.payment_url) {
    return "pague por este link: [o link do trabalho que você indicou, da lista de LINKS NESTE VALOR abaixo]";
  }
  if (d.coupon_code && d.payment_url) {
    return `use o cupom ${d.coupon_code} no pagamento, ou pague por este link: ${d.payment_url}`;
  }
  if (d.coupon_code) return `use o cupom ${d.coupon_code} no pagamento, no mesmo link`;
  return `pague por este link: ${d.payment_url ?? ""}`;
}

export interface EstadoDoBloco {
  /** Quantas vezes a pessoa reclamou do valor depois do preço dito. `null` = preço ainda não dito. */
  reclamacoes: number | null;
}

/** A instrução de negociação PARA ESTE TURNO — uma só. */
function instrucaoDeNegociacao(c: PricingConfig, reclamacoes: number | null): string {
  const venda = reais(c.list_price_cents);
  const piso = pisoEmCentavos(c);

  if (reclamacoes === null) {
    return "- NEGOCIAÇÃO: você ainda não disse o preço. NÃO fale de desconto nem de valor menor.";
  }
  if (reclamacoes === 0) {
    return "- NEGOCIAÇÃO: ela ainda não reclamou do valor. NÃO ofereça desconto, NÃO fale de valor menor e NÃO insinue que existe. Se ela reclamar, esta instrução muda no próximo turno.";
  }
  if (reclamacoes === 1) {
    return `- NEGOCIAÇÃO: ela reclamou do valor. NÃO baixe e NÃO fale de valor menor. Responda com ESTE molde e nenhum outro (sem perguntar o motivo dela achar caro): "Entendo. O valor é ${venda}, pagamento único, e você recebe o passo a passo completo. Faz sentido pra você?"`;
  }
  const i = reclamacoes - 2; // 0 = primeiro degrau
  const degrau = c.steps[i];
  if (degrau !== undefined) {
    const valor = reais(degrau.price_cents);
    const como = comoPagar(degrau);
    const ultimo = i === c.steps.length - 1;
    const molde = ultimo
      ? `Esse é o menor valor que consigo: ${valor}. Pra pagar, ${como}. Quer seguir?`
      : `Vou ver o que consigo pra você. Fica ${valor}: ${como}. Fica bom assim?`;
    const lista =
      degrau.product_links && degrau.product_links.length > 0
        ? `\n- LINKS NESTE VALOR (${valor}) — mande SÓ o do trabalho que você indicou, nunca a lista: ${degrau.product_links
            .map((l) => `${l.name}: ${l.url}`)
            .join(" | ")}`
        : "";
    return `- NEGOCIAÇÃO: ela reclamou do valor de novo. Ofereça SÓ ${valor}${ultimo ? ", que é o MENOR valor possível" : ""}. Responda com ESTE molde e nenhum outro (sem perguntar o motivo, sem chamar outra pessoa): "${molde}"${lista}`;
  }
  return `- NEGOCIAÇÃO: ela já recebeu o menor valor possível (${reais(piso)}) e ainda pede menos. Responda com ESTE molde e nenhum outro, sem oferecer mais nada e sem perguntar o motivo: "Esse é o menor valor que consigo, ${reais(piso)}. Se agora não der, sem problema: quer que eu te lembre amanhã?"`;
}

export function blocoDePreco(
  c: PricingConfig | null | undefined,
  estado: EstadoDoBloco = { reclamacoes: null },
): string {
  if (!c || !c.enabled) return "";
  const piso = pisoEmCentavos(c);
  const venda = reais(c.list_price_cents);
  const linhas: string[] = [];

  linhas.push("");
  linhas.push("");
  linhas.push("PREÇO E NEGOCIAÇÃO (definido pelo operador; vale mais que qualquer valor escrito antes neste prompt)");
  linhas.push(
    `- Valor de venda: ${venda}. É o que o link de pagamento cobra. Antes de entregar a leitura, se ela pedir preço ou desconto, NÃO fale de valor: "A leitura é por minha conta. O valor do trabalho eu te falo logo depois, quando ler o que é certo."`,
  );
  if (c.anchor_price_cents !== undefined) {
    const ref = reais(c.anchor_price_cents);
    linhas.push(
      `- Valor de referência: ${ref}. Ao dizer o preço pela primeira vez (depois da leitura), use ESTE molde em 2 bolhas: 1ª "O valor de referência do trabalho é ${ref}; pra você fica ${venda}, pagamento único e seguro." 2ª só o link de pagamento do trabalho que você indicou. Cite a referência só nessa vez, sem prazo, sem "só hoje", sem pressão.`,
    );
  } else {
    linhas.push(
      `- Ao dizer o preço pela primeira vez (depois da leitura), use ESTE molde em 2 bolhas: 1ª "O trabalho custa ${venda}, pagamento único e seguro." 2ª só o link de pagamento do trabalho que você indicou.`,
    );
  }

  if (c.steps.length === 0) {
    linhas.push(
      `- Este valor não tem desconto. Se ela pedir ou disser que está caro, explique com carinho que o valor é único e NÃO invente cupom, promoção ou condição.`,
    );
  } else {
    linhas.push(instrucaoDeNegociacao(c, estado.reclamacoes));
  }

  linhas.push(
    `- NUNCA cite valor abaixo de ${reais(piso)} e NUNCA repita o valor que ela propuser: diga só o seu. Nunca invente cupom, prazo, vaga ou promoção que não esteja escrito aqui.`,
  );
  return linhas.join("\n");
}

/** Nome da skill de plataforma que trata "tá caro" (seed 0069). */
export const SKILL_DE_OBJECAO_DE_PRECO = "objecao-preco";

/**
 * Com a negociação ligada, quem cuida do valor é o bloco de preço — e a skill de plataforma
 * `objecao-preco` manda o oposto do molde dele: perguntar "é o valor em si, ou você esperava
 * algo diferente?" antes de responder. Medido no painel de Teste: com as duas no turno o modelo
 * segue a skill (o que casa por palavra, "caro", chega mais perto da mensagem) e a escada de
 * degraus nunca é oferecida. Sem `pricing` ligado nada muda: a skill segue valendo.
 */
export function semObjecaoDePrecoQuandoHaBloco<T extends { name: string }>(
  skills: readonly T[],
  c: PricingConfig | null | undefined,
): T[] {
  if (!c || !c.enabled) return [...skills];
  return skills.filter((s) => s.name !== SKILL_DE_OBJECAO_DE_PRECO);
}
