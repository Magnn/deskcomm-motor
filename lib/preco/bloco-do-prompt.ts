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
 * Medido no painel de Teste: dada a escada inteira, o modelo pequeno errava o passo. Então o código conta as
 * reclamações (`estado-da-negociacao.ts`) e o bloco traz SÓ o molde do passo atual — os
 * degraus seguintes nem aparecem, e por isso também não vazam para a pessoa.
 *
 * O bloco ensina, mas quem GARANTE o piso é a trava de promessas
 * (`promise_table.minPriceCents`, ligada por `sincronizar-piso.ts`): se o modelo citar um
 * valor abaixo do mínimo, a mensagem é vetada antes de sair.
 */
import { combinadoEmVigor, degrauDoTurno, precoPermitidoAgora } from "./estado-da-negociacao";
import type { EstadoDoPosVenda } from "./pos-venda";
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
  /** A pessoa já comprou e a segunda oferta está liberada (`pos-venda.ts`). Ausente/`null` = primeira venda. */
  posVenda?: EstadoDoPosVenda | null;
  /**
   * O valor que esta pessoa combinou pagar em outra data, guardado com o retorno agendado
   * (`lib/followup/retorno-pg.ts`). Ausente/`null` = não há combinado.
   */
  combinadoCents?: number | null;
  /**
   * Quanto a pessoa disse que tem ou consegue pagar (`valorQueAPessoaTem`), quando é menos que o
   * valor de venda. NÃO pula degrau: só muda o texto da oferta. Ausente/`null` = ela não disse.
   */
  valorQueTemCents?: number | null;
  /**
   * A pessoa reclamou do valor nas mensagens que este turno responde (`reclamouDoValorAgora`).
   * `false` = a contagem da conversa está em pé, mas agora ela fala de outra coisa: o turno NÃO
   * oferece desconto. Ausente = `true` (quem monta o estado à mão testa a escada).
   */
  reclamouAgora?: boolean;
  /**
   * A pessoa acabou de dar uma data para pagar (`deuDataParaPagar`) e a agente JÁ ofereceu este
   * degrau: o turno fecha o combinado — data + este valor + retorno agendado — em vez de descer
   * mais um degrau ou de mandar a pessoa "chamar quando receber". Ausente/`null` = não é o caso.
   */
  dataParaOValorCents?: number | null;
  /**
   * A pessoa disse que falta para o essencial (`faltaParaOEssencial`): o bloco não traz valor para
   * oferecer nem molde de cobrança — só a instrução de recuar.
   */
  faltaParaOEssencial?: boolean;
}

const RECUO_PELO_ESSENCIAL =
  "- ELA DISSE QUE FALTA PARA O ESSENCIAL (remédio, comida, aluguel, conta de casa). NÃO diga preço, NÃO ofereça valor menor, NÃO pergunte como ela prefere pagar, NÃO mande link e NÃO combine data de pagamento. Acolha o que ela disse, diga que a saúde e a casa dela vêm primeiro e que a porta fica aberta quando ela puder. Se ELA pedir o valor de novo, diga só o valor de venda, uma vez, sem insistir.";

/**
 * O turno de FECHAR O COMBINADO: ela deu a data, o valor já foi oferecido. Quem tem nada hoje não
 * ganha mais um degrau por adiar — o valor é o que já foi dito, e é ele que o retorno guarda
 * (`valorCombinadoNaConversa`). O defeito que isto corta é a despedida sem compromisso.
 */
function instrucaoDeFecharADataCombinada(valorCents: number): string {
  const valor = reais(valorCents);
  return [
    `- NEGOCIAÇÃO: ela disse que só consegue pagar em outra data, e você já ofereceu ${valor}. NÃO ofereça outro valor e NÃO diga "me chama quando receber" nem "quando o dinheiro entrar": quem volta é VOCÊ, na data. Faça as DUAS coisas neste turno:`,
    "  1) chame a ferramenta de agendar retorno (schedule_followup) com a data que ela disse;",
    `  2) responda com ESTE molde e nenhum outro: "Combinado, então: no dia [a data que ela disse] eu te chamo aqui com o link, e o seu valor fica em ${valor}. Se conseguir antes, é só me avisar."`,
    `- Se ela não disse um dia que dê para marcar ("quando eu receber", sem dia), NÃO agende ainda: pergunte só "Qual dia cai o seu pagamento? Eu já deixo combinado por ${valor}."`,
    "- Se ela disser que falta para o essencial (comida, remédio, aluguel, conta atrasada), NÃO insista em valor nenhum nem use o molde: acolha, e diga que a porta fica aberta quando ela puder.",
  ].join("\n");
}

/**
 * A instrução de quem JÁ COMBINOU um valor e ficou de pagar depois. Substitui a escada: semanas
 * depois a contagem de reclamações voltou a zero (elas saíram da janela de histórico), e sem isto a
 * agente voltaria ao valor de venda — e o valor combinado seria vetado pela trava de promessas.
 */
function instrucaoDoCombinado(c: PricingConfig, combinadoCents: number): string {
  const valor = reais(combinadoCents);
  const degrau = c.steps.find((s) => s.price_cents === combinadoCents);
  const como = degrau ? comoPagar(degrau) : "mande o link de pagamento desse valor";
  const lista =
    degrau?.product_links && degrau.product_links.length > 0
      ? `\n- LINKS NESTE VALOR (${valor}) — mande SÓ o do trabalho que você indicou, nunca a lista: ${degrau.product_links
          .map((l) => `${l.name}: ${l.url}`)
          .join(" | ")}`
      : "";
  return `- VALOR COMBINADO: esta pessoa já combinou com você ${valor} e ficou de pagar em outra data. O valor DELA é ${valor}: NÃO volte ao valor de venda, NÃO ofereça menos e NÃO renegocie. Quando ela for pagar, diga só "${valor}, como combinamos" e, pra pagar, ${como}. O molde de dizer o preço pela primeira vez NÃO se aplica a ela.${lista}`;
}

/**
 * O bloco de quem JÁ COMPROU. Substitui o da primeira venda inteiro: a escada de negociação é
 * da compra que já aconteceu, e deixá-la no prompt faria a agente renegociar o que foi pago.
 *
 * O molde é contido de propósito. A pessoa acabou de pagar: a oferta entra UMA vez, ligada ao
 * que ela mesma contou, sem prazo e sem ameaça. "Sem isso o primeiro trabalho não funciona" é
 * dizer que o produto vendido ontem veio incompleto — e é pressão sobre quem já confiou.
 */
function blocoDoPosVenda(p: EstadoDoPosVenda): string {
  const valor = reais(p.priceCents);
  const lista = p.links.map((l) => `${l.name}: ${l.url}`).join(" | ");
  const linhas = [
    "",
    "",
    "PREÇO E PÓS-VENDA (definido pelo operador; vale mais que qualquer valor escrito antes neste prompt)",
    "- Esta pessoa JÁ COMPROU e já pagou. NÃO cobre de novo o que ela comprou e NÃO renegocie aquele valor.",
  ];
  if (p.jaOferecida) {
    linhas.push(
      `- Você JÁ ofereceu um segundo trabalho por ${valor} nesta conversa. NÃO ofereça de novo e não insista. Se ELA pedir o link ou disser que quer, mande só o link do trabalho que ela escolheu.`,
    );
  } else {
    linhas.push(
      `- SEGUNDA OFERTA (uma vez só): primeiro responda o que ela disse e acompanhe o trabalho que ela está fazendo. Se a conversa estiver boa, você PODE oferecer UM segundo trabalho por ${valor}, escolhendo pelo que ELA contou. Use ESTE molde em 2 bolhas: 1ª "Pelo que você me contou, tem um trabalho que combina com este momento: [nome do trabalho]. Fica ${valor}, pagamento único. Quer que eu te mande?" 2ª (só se ela disser que sim) o link do trabalho.`,
    );
    linhas.push(
      "- Sem prazo, sem \"só hoje\", sem vaga, e NUNCA diga que o trabalho que ela comprou não funciona, ou que algo ruim acontece, sem o segundo. Se ela disser não, agradeça e siga o acompanhamento.",
    );
  }
  linhas.push(`- LINKS DO SEGUNDO TRABALHO (${valor}) — mande SÓ o que ela escolher, nunca a lista: ${lista}`);
  linhas.push(`- NUNCA cite valor abaixo de ${valor} e nunca invente cupom, prazo, vaga ou promoção que não esteja escrito aqui.`);
  return linhas.join("\n");
}

/** A instrução de negociação PARA ESTE TURNO — uma só. */
function instrucaoDeNegociacao(
  c: PricingConfig,
  reclamacoes: number | null,
  valorQueTemCents: number | null,
  reclamouAgora: boolean,
): string {
  const venda = reais(c.list_price_cents);
  const piso = pisoEmCentavos(c);

  if (reclamacoes === null) {
    return "- NEGOCIAÇÃO: você ainda não disse o preço. NÃO fale de desconto nem de valor menor.";
  }
  if (reclamacoes === 0) {
    return "- NEGOCIAÇÃO: ela ainda não reclamou do valor. NÃO ofereça desconto, NÃO fale de valor menor e NÃO insinue que existe. Se ela reclamar, esta instrução muda no próximo turno.";
  }
  // ELA NÃO ESTÁ RECLAMANDO AGORA: a oferta é do turno em que ela reclama. Aqui o valor em vigor
  // fica dito (para quando ela for pagar), e nada é oferecido.
  if (!reclamouAgora) {
    const jaLiberado = c.steps[degrauDoTurno(c, reclamacoes, valorQueTemCents)];
    if (jaLiberado === undefined) {
      return `- NEGOCIAÇÃO: ela reclamou do valor antes, mas AGORA fala de outra coisa. NÃO ofereça desconto, NÃO fale de valor menor e NÃO volte ao assunto do preço por conta própria: responda o que ela disse. O valor é ${venda}. Se ela disser de novo que não cabe, esta instrução muda no próximo turno.`;
    }
    const valorEmVigor = reais(jaLiberado.price_cents);
    const linksEmVigor =
      jaLiberado.product_links && jaLiberado.product_links.length > 0
        ? `\n- LINKS NESTE VALOR (${valorEmVigor}) — mande SÓ o do trabalho que você indicou, nunca a lista: ${jaLiberado.product_links
            .map((l) => `${l.name}: ${l.url}`)
            .join(" | ")}`
        : "";
    return `- NEGOCIAÇÃO: você já ofereceu ${valorEmVigor} a ela, e AGORA ela fala de outra coisa. NÃO ofereça outro valor, NÃO baixe mais e NÃO repita a oferta por conta própria: responda o que ela disse. O valor dela é ${valorEmVigor}; se ELA quiser pagar ou pedir o link, ${comoPagar(jaLiberado)}.${linksEmVigor}`;
  }
  // A 1ª rodada de reclamação é respondida com a DEFESA do valor; da 2ª em diante cada rodada
  // libera UM degrau — dizer quanto tem não pula nenhum (`degrauDoTurno`). Depois de uma rodada a
  // mais que o número de degraus, o mínimo já foi dito.
  if (reclamacoes > c.steps.length + 1) {
    return `- NEGOCIAÇÃO: ela já recebeu o menor valor possível (${reais(piso)}) e ainda diz que não cabe. Responda com ESTE molde e nenhum outro, sem oferecer mais nada e sem perguntar o motivo: "Esse é o menor valor que consigo, ${reais(piso)}. Se hoje não der, me diz o dia em que você consegue e eu deixo combinado por esse valor."`;
  }
  const i = degrauDoTurno(c, reclamacoes, valorQueTemCents);
  const degrau = c.steps[i];
  if (degrau === undefined) {
    // A DEFESA. Não é repetir o preço: é mostrar que ele cabe do jeito que o roteiro permite pagar.
    // Medido em 08/10/2026: três de quatro pessoas que reclamaram e compraram pagaram o valor
    // cheio depois de ouvir o parcelamento no cartão ou o Pix pelo link.
    return [
      `- NEGOCIAÇÃO: ela disse que o valor não cabe. Nesta resposta NÃO baixe e NÃO fale de valor menor: mantenha ${venda} e mostre como fica fácil pagar, usando as formas de pagamento que o seu roteiro descreve (parcelamento no cartão, Pix pelo link) — a que responder ao que ELA disse. Termine perguntando se assim ela consegue. Se ela disser de novo que não cabe, esta instrução muda no próximo turno.`,
      "- Se ela disser que falta para o essencial (comida, remédio, aluguel, conta atrasada), NÃO insista em valor nenhum: acolha, e diga que a porta fica aberta quando ela puder.",
    ].join("\n");
  }
  const valor = reais(degrau.price_cents);
  const como = comoPagar(degrau);
  const ultimo = i === c.steps.length - 1;
  // O molde NÃO pergunta "quanto você consegue": a resposta não pula degrau, e perguntar para
  // depois oferecer outro número é prometer o que a escada não cumpre.
  const molde = ultimo
    ? `Esse é o menor valor que consigo: ${valor}. Pra pagar, ${como}. Quer seguir?`
    : `Não quero que o valor te impeça. Consigo fazer por ${valor} pra você: ${como}. Cabe pra você hoje?`;
  const lista =
    degrau.product_links && degrau.product_links.length > 0
      ? `\n- LINKS NESTE VALOR (${valor}) — mande SÓ o do trabalho que você indicou, nunca a lista: ${degrau.product_links
          .map((l) => `${l.name}: ${l.url}`)
          .join(" | ")}`
      : "";
  const motivo =
    valorQueTemCents !== null
      ? "ela disse quanto consegue pagar"
      : "ela disse de novo que o valor não cabe";
  return [
    `- NEGOCIAÇÃO: ${motivo}. NÃO repita o valor de venda: ofereça AGORA ${valor}${ultimo ? ", que é o MENOR valor possível" : ""} — este valor e NENHUM outro, mesmo que ela tenha dito um número menor. Responda com ESTE molde e nenhum outro (sem perguntar o motivo, sem chamar outra pessoa): "${molde}"${lista}`,
    // Medido em 08/10/2026: 40 retornos agendados no dia, nenhum com valor combinado — a agente
    // trocava a oferta do degrau por "me chama quando receber", e a pessoa voltava ao valor cheio.
    `- OUTRA DATA: só combine pagamento em outra data DEPOIS de dizer ${valor} e ela responder que hoje não consegue nem esse valor. Ao combinar, diga a data e ${valor} juntos — a data vale para ESTE valor, nunca para o valor de venda.`,
    "- Se ela disser que falta para o essencial (comida, remédio, aluguel, conta atrasada), NÃO insista em valor nenhum nem use o molde: acolha, e diga que a porta fica aberta quando ela puder.",
  ].join("\n");
}

export function blocoDePreco(
  c: PricingConfig | null | undefined,
  estado: EstadoDoBloco = { reclamacoes: null },
): string {
  if (!c || !c.enabled) return "";
  if (estado.posVenda) return blocoDoPosVenda(estado.posVenda);
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
    if (estado.faltaParaOEssencial === true) linhas.push(RECUO_PELO_ESSENCIAL);
  } else {
    // O combinado só manda enquanto é MENOR que o que a escada libera agora: se a pessoa seguiu
    // reclamando e a escada desceu além dele, vale a escada.
    const combinado = combinadoEmVigor(c, estado.combinadoCents);
    // Fechar a data: só com um degrau JÁ oferecido (e ainda em vigor), sem combinado anterior e sem
    // ela ter dito quanto tem — quem diz um valor ainda está negociando o de hoje.
    const dataPara = combinadoEmVigor(c, estado.dataParaOValorCents);
    const fechaAData = combinado === null && dataPara !== null && (estado.valorQueTemCents ?? null) === null;
    linhas.push(
      estado.faltaParaOEssencial === true
        ? RECUO_PELO_ESSENCIAL
        : combinado !== null && combinado < precoPermitidoAgora(c, estado.reclamacoes, estado.valorQueTemCents ?? null)
        ? instrucaoDoCombinado(c, combinado)
        : fechaAData
          ? instrucaoDeFecharADataCombinada(dataPara)
          : instrucaoDeNegociacao(c, estado.reclamacoes, estado.valorQueTemCents ?? null, estado.reclamouAgora ?? true),
    );
    // Medido em produção: o prompt escrito pelo operador mandava chamar a equipe para enviar
    // o link do valor negociado, e a agente obedecia — a negociação morria numa fila de
    // atendimento. Com degraus configurados, o valor e o link de cada um estão AQUI.
    linhas.push(
      "- A negociação de valor é SUA: NÃO chame atendimento humano por causa de valor, desconto, falta de dinheiro ou para enviar link ou Pix. Quem diz o valor e manda o link é você, seguindo a instrução acima.",
    );
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
