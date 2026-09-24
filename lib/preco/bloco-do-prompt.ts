/**
 * O BLOCO DE PREÇO — o que a agente lê sobre valor e negociação, montado da configuração.
 *
 * Vai na camada do agente, depois do prompt dele, a cada turno. Assim trocar o valor na
 * tela vale no PRÓXIMO turno, sem publicar versão nova do prompt e sem número escrito em
 * dois lugares. A frase "vale mais que qualquer valor escrito antes" existe porque o prompt
 * de um agente antigo ainda pode trazer um preço fixo.
 *
 * ─── Por que a negociação é uma escada de MOLDES, e não uma regra em prosa ───────────
 * Medido no painel de Teste: com "na 1ª vez mantenha o valor, depois ofereça os degraus", o
 * modelo ofereceu o degrau já na primeira reclamação e, na segunda, recusou descer. Modelo
 * pequeno segue o texto pronto, não o raciocínio. Por isso a agente CONTA quantas vezes a
 * pessoa falou do valor e responde pelo número, com a frase escrita para cada degrau.
 *
 * O bloco ensina, mas quem GARANTE o piso é a trava de promessas
 * (`promise_table.minPriceCents`, ligada por `sincronizar-piso.ts`): se o modelo citar um
 * valor abaixo do mínimo, a mensagem é vetada antes de sair.
 */
import { pisoEmCentavos, reais, type PricingConfig } from "./tipos";

/** Como a pessoa paga aquele valor, numa frase que a agente pode dizer. */
function comoPagar(d: { coupon_code?: string | undefined; payment_url?: string | undefined }): string {
  if (d.coupon_code && d.payment_url) {
    return `use o cupom ${d.coupon_code} no pagamento, ou pague por este link: ${d.payment_url}`;
  }
  if (d.coupon_code) return `use o cupom ${d.coupon_code} no pagamento, no mesmo link`;
  return `pague por este link: ${d.payment_url ?? ""}`;
}

export function blocoDePreco(c: PricingConfig | null | undefined): string {
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
      `- Valor de referência: ${ref}. Ao dizer o preço pela primeira vez (depois da leitura), use ESTE molde em 2 bolhas: 1ª "O valor de referência do trabalho é ${ref}; pra você fica ${venda}, pagamento único e seguro." 2ª só o link do trabalho. Cite a referência só nessa vez, sem prazo, sem "só hoje", sem pressão.`,
    );
  } else {
    linhas.push(
      `- Ao dizer o preço pela primeira vez (depois da leitura), use ESTE molde em 2 bolhas: 1ª "O trabalho custa ${venda}, pagamento único e seguro." 2ª só o link do trabalho.`,
    );
  }

  if (c.steps.length === 0) {
    linhas.push(
      `- Este valor não tem desconto. Se ela pedir ou disser que está caro, explique com carinho que o valor é único e NÃO invente cupom, promoção ou condição.`,
    );
  } else {
    linhas.push(
      "- NEGOCIAÇÃO: só quando ELA pedir desconto, disser que está caro, sem condição, ou pedir menos. NUNCA ofereça antes. Conte quantas vezes ELA já falou do valor nesta conversa (inclusive a mensagem de agora) e responda PELO NÚMERO, com o molde:",
    );
    linhas.push(
      `  1ª vez: NÃO baixe e NÃO fale de valor menor. Molde: "Entendo. O valor é ${venda}, pagamento único, e você recebe o passo a passo completo. Faz sentido pra você?"`,
    );
    c.steps.forEach((s, i) => {
      const ultimo = i === c.steps.length - 1;
      const como = comoPagar(s);
      linhas.push(
        ultimo
          ? `  ${i + 2}ª vez: ofereça só ${reais(s.price_cents)}, o MENOR valor possível. Molde: "Esse é o menor valor que consigo: ${reais(s.price_cents)}. Pra pagar, ${como}. Quer seguir?"`
          : `  ${i + 2}ª vez: ofereça só ${reais(s.price_cents)}. Molde: "Vou ver o que consigo pra você. Fica ${reais(s.price_cents)}: ${como}. Fica bom assim?"`,
      );
    });
    linhas.push(
      `  Depois disso, se ela ainda pedir menos: "Esse é o menor valor que consigo, ${reais(piso)}. Se agora não der, sem problema: quer que eu te lembre amanhã?" e não ofereça mais nada.`,
    );
    linhas.push(
      "  Nunca conte os degraus seguintes. Nunca ofereça um valor que não esteja nesta lista, mesmo que ela peça um número específico.",
    );
  }

  linhas.push(
    `- NUNCA cite valor abaixo de ${reais(piso)} e nunca invente cupom, prazo, vaga ou promoção que não esteja escrito aqui.`,
  );
  return linhas.join("\n");
}
