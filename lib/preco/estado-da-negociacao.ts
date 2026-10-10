/**
 * EM QUE PASSO DA NEGOCIAÇÃO A CONVERSA ESTÁ — contado pelo código, não deduzido pelo modelo.
 *
 * Medido no painel de Teste: com a escada inteira no prompt ("na 1ª reclamação mantenha, na
 * 2ª ofereça o degrau 1…"), o modelo pequeno errava o passo — repetia a 1ª resposta na 2ª
 * reclamação, ou já oferecia o degrau na 1ª. Contar é trabalho de código: aqui a conversa é
 * lida e o resultado (`reclamacoes`) escolhe UM molde, que é o único que o modelo vê. Os
 * degraus seguintes nem aparecem no prompt, então também não vazam.
 *
 * Conta as mensagens da PESSOA que reclamam do valor (caro, desconto, "faz por menos", "não
 * tenho como pagar"…) DEPOIS de a agente ter dito um preço. Antes disso não há o que
 * negociar: quem pergunta "quanto custa? tem desconto?" antes da leitura ainda não foi
 * apresentada ao valor. `null` = a agente ainda não disse preço nenhum nesta janela de
 * mensagens (ou a janela cortou o trecho): o bloco trata como "não negocie", que é a direção
 * segura.
 *
 * É heurística de palavras, e erra para os dois lados em casos raros ("caro" como vocativo).
 * Errar aqui custa pouco: a escada anda um passo a mais ou a menos, e o piso continua
 * garantido pela trava de promessas.
 */

import type { PromiseTable } from "@/lib/agent-engine/guardrails/promise/table";

import type { PricingConfig } from "./tipos";

export interface MensagemParaContar {
  direction: string;
  body: string | null | undefined;
}

export const PRECO_DITO = /R\$\s?\d|\b\d+(?:[.,]\d+)?\s*reais?\b/i;

export const RECLAMACAO_DE_VALOR = new RegExp(
  [
    "(?:t[áa]|est[áa]|ficou|muito|bem|meio|bastante|demais)\\s+car[oa]s?\\b",
    "\\bcar[oa]s?\\s+demais\\b",
    "\\bcar[ií]ssim[oa]\\b",
    "\\bdescont",
    "\\babatiment",
    "\\babaix(?:a|ar|e)\\b",
    "\\bdiminu(?:i|ir)\\b",
    "\\bbarat",
    "\\bpor\\s+menos\\b",
    "\\bmenos\\s+(?:que|de)\\b",
    "\\bfaz\\s+por\\b",
    "\\bfecha\\s+por\\b",
    "\\bd[áa]\\s+pra\\s+fazer\\s+(?:por|mais)\\b",
    // "não tenho O dinheiro", "não tenho ESSE valor", "não tenho tudo isso": medido em
    // produção — sem o artigo no meio a frase mais comum de quem não pode pagar não contava,
    // a escada não andava e a agente, sem valor menor para oferecer, chamava a equipe.
    "n[ãa]o\\s+(?:tenho|consigo|d[áa]|tem\\s+como)\\s+(?:(?:o|esse|este|todo\\s+(?:o|esse)|tudo)\\s+)?(?:dinheiro|valor|grana|isso|como\\s+pagar|condi[çc][õo]es|pagar)",
    "n[ãa]o\\s+tenho\\s+(?:os\\s+|esses\\s+)?(?:R\\$\\s?)?\\d",
    "n[ãa]o\\s+tenho\\s+(?:agora|hoje|no\\s+momento)\\b",
    "\\bdesempregad",
    // Quem só pode pagar depois também não pode pagar o valor de hoje.
    "s[óo]\\s+(?:recebo|consigo\\s+pagar|posso\\s+pagar|vou\\s+ter)\\b",
    "quando\\s+(?:eu\\s+)?receber\\b",
    // "só tenho 60", "tenho só isso", "tô apertada", "vai ficar pra depois": medido em produção em
    // 08/10/2026 — quem tem MENOS que o valor diz assim, e nenhuma dessas contava.
    "\\bs[óo]\\s+tenho\\b",
    "\\btenho\\s+s[óo](?:\\s|$)",
    "\\bapertad",
    "n[ãa]o\\s+(?:vou\\s+)?(?:poder|posso)\\s+(?:pagar|fazer)\\b",
    "(?:vai\\s+)?ficar\\s+pr[ao]\\s+depois\\b",

    "\\bsem\\s+(?:dinheiro|condi[çc][ãa]o|condi[çc][õo]es|grana)\\b",
    "\\b(?:pre[çc]o|valor)\\s+(?:t[áa]\\s+)?alto\\b",
    "fora\\s+do\\s+(?:meu\\s+)?or[çc]amento",
    "\\bpromo[çc][ãa]o\\b",
    "\\bcupom\\b",
  ].join("|"),
  "i",
);

/** Um histórico colado no painel de Teste vira várias mensagens (ver `expandirHistoricoColado`). */
const LINHA_DE_HISTORICO = /^\s*(Lead|Cliente|Pessoa|Esmeralda|Agente|Atendente)\s*:\s*(.*)$/i;

/**
 * O painel de Teste roda UMA mensagem. Quem cola ali um histórico com linhas "Lead: …" e
 * "Esmeralda: …" (ou Cliente/Agente) testa a escada de negociação como se fosse a conversa:
 * cada linha vira uma mensagem. Mensagem sem esse formato passa como veio — na produção
 * nenhuma mensagem real tem esse formato de linha, e o efeito é nulo.
 */
export function expandirHistoricoColado(msgs: readonly MensagemParaContar[]): MensagemParaContar[] {
  const saida: MensagemParaContar[] = [];
  for (const m of msgs) {
    const corpo = m.body ?? "";
    if (!/^\s*(Lead|Cliente|Pessoa|Esmeralda|Agente|Atendente)\s*:/im.test(corpo)) {
      saida.push(m);
      continue;
    }
    let atual: MensagemParaContar | null = null;
    for (const linha of corpo.split("\n")) {
      const achou = LINHA_DE_HISTORICO.exec(linha);
      if (achou) {
        const quem = achou[1]!.toLowerCase();
        const nossa = quem === "esmeralda" || quem === "agente" || quem === "atendente";
        atual = { direction: nossa ? "outbound" : "inbound", body: achou[2] ?? "" };
        saida.push(atual);
      } else if (atual !== null && linha.trim() !== "" && !/^\[/.test(linha.trim())) {
        atual.body = `${atual.body ?? ""}\n${linha}`;
      } else if (linha.trim() !== "" && !/^\[/.test(linha.trim())) {
        // Texto solto depois do histórico ("[Nova mensagem do lead]\ntá caro"): é da pessoa.
        atual = { direction: "inbound", body: linha };
        saida.push(atual);
      } else if (/^\[/.test(linha.trim())) {
        atual = null; // marcador do painel: a próxima linha solta é a mensagem nova
      }
    }
  }
  return saida;
}

/**
 * EM QUE DEGRAU A CONVERSA ESTÁ — o índice em `steps`, ou `-1` para o valor de venda.
 *
 * UM DEGRAU POR VEZ, sempre: a 1ª rodada de reclamação é respondida com a defesa do valor; da 2ª
 * em diante cada rodada libera UM degrau (`reclamacoesDeValor` conta rodadas, não mensagens).
 *
 * ⚠️ A pessoa dizer quanto tem NÃO pula degrau. De 08 a 09/10/2026 pulava: "só tenho 50" levava a
 * agente de R$ 130 direto a R$ 50, o menor valor, na resposta seguinte — medido nas conversas de
 * 09/10, e o dono viu a queda de 130 para 50 na tela. Quem diz um número abre a negociação; a
 * agente responde com o PRÓXIMO degrau, e só desce outro se a pessoa disser de novo que não cabe.
 * O parâmetro fica na assinatura porque o estado do turno o carrega; aqui ele não decide nada.
 *
 * Histórico da regra: até 08/10 a 1ª reclamação só repetia o valor e cada mensagem seguinte
 * liberava um degrau (42 reclamaram, 1 comprou); em 09/10 de manhã a escada descia já na 1ª
 * (14 ofertas, nenhuma compra); à tarde a defesa da 1ª voltou.
 */
export function degrauDoTurno(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  reclamacoes: number | null,
  _valorQueTemCents: number | null = null,
): number {
  if (reclamacoes === null || reclamacoes <= 0 || c.steps.length === 0) return -1;
  return Math.min(reclamacoes - 2, c.steps.length - 1);
}

/**
 * O MENOR valor que a agente pode citar NESTE turno — a escada em números.
 *
 * É o que a trava de promessas do turno usa: se o modelo ignorar o molde e oferecer um valor
 * abaixo do degrau liberado (o defeito que custa dinheiro), a mensagem é vetada antes de sair.
 * O defeito contrário — não oferecer o degrau quando podia — só deixa de conceder, e o bloco de
 * preço cuida dele.
 */
export function precoPermitidoAgora(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  reclamacoes: number | null,
  valorQueTemCents: number | null = null,
): number {
  const i = degrauDoTurno(c, reclamacoes, valorQueTemCents);
  return i === -1 ? c.list_price_cents : c.steps[i]!.price_cents;
}

/**
 * A tabela de promessas do TURNO: a da organização, com o piso subido para o que a escada
 * permite agora. Nunca desce o piso da organização — só o sobe. Sem tabela da org, cria uma só
 * com o piso do turno.
 */
export function tabelaDoTurno(base: PromiseTable | null, pisoDoTurno: number | undefined): PromiseTable | null {
  if (pisoDoTurno === undefined) return base;
  return { ...(base ?? {}), minPriceCents: Math.max(base?.minPriceCents ?? 0, pisoDoTurno) };
}

/** A mensagem da pessoa reclama do valor, adia o pagamento ou é a negativa curta de quem não pode. */
function reclamaDoValor(m: MensagemParaContar): boolean {
  // Adiar o pagamento também é dizer que o valor não cabe hoje: "vou ter o dinheiro só semana que
  // vem" não tem nenhuma palavra de reclamação, e em 08/10/2026 passou sem oferta nenhuma.
  return (
    m.direction === "inbound" &&
    (RECLAMACAO_DE_VALOR.test(m.body ?? "") || adiaOPagamento(m.body ?? "") || negativaCurta(m.body ?? ""))
  );
}

/**
 * Quantas RODADAS de reclamação do valor a conversa teve. `null` = preço ainda não dito.
 *
 * Uma rodada é o que a pessoa escreve entre duas falas da agente. Três mensagens seguidas ("não
 * consigo", "tô sem dinheiro", "mas obrigada") são UMA rodada: a agente ainda não respondeu, e a
 * escada só anda depois de a pessoa ouvir a resposta e dizer de novo que não cabe.
 *
 * ⚠️ Até 09/10/2026 contava-se MENSAGEM, e somava-se uma pelo aviso dado antes do preço ("já vou
 * dizendo que estou sem dinheiro"). Medido nas conversas daquele dia: quem escreveu a reclamação
 * em duas mensagens seguidas recebeu o primeiro degrau sem ouvir defesa nenhuma, e quem tinha
 * avisado antes pulou do valor de venda para o segundo degrau. O aviso de antes do preço não
 * conta mais: antes do preço não há o que negociar.
 */
export function reclamacoesDeValor(mensagens: readonly MensagemParaContar[]): number | null {
  const msgs = expandirHistoricoColado(mensagens);
  const primeiroPreco = msgs.findIndex((m) => m.direction === "outbound" && PRECO_DITO.test(m.body ?? ""));
  if (primeiroPreco === -1) return null;
  let rodadas = 0;
  let rodadaJaContada = false;
  for (const m of msgs.slice(primeiroPreco + 1)) {
    if (m.direction !== "inbound") {
      rodadaJaContada = false;
      continue;
    }
    if (!rodadaJaContada && reclamaDoValor(m)) {
      rodadas += 1;
      rodadaJaContada = true;
    }
  }
  return rodadas;
}

/**
 * A PESSOA RECLAMOU DO VALOR NAS MENSAGENS QUE ESTE TURNO RESPONDE (as dela depois da última
 * fala da agente) — reclamação, adiamento, negativa curta ou um valor que ela diz ter.
 *
 * A contagem é da conversa inteira; a OFERTA é do turno. Medido em 09/10/2026: a pessoa reclamou,
 * ouviu a defesa, respondeu "ele volta?" — e recebeu "consigo fazer por R$ 100", porque a contagem
 * continuava em pé. Quem voltou a falar do caso não está pedindo desconto.
 */
export function reclamouDoValorAgora(
  c: Pick<PricingConfig, "list_price_cents">,
  mensagens: readonly MensagemParaContar[],
): boolean {
  const msgs = expandirHistoricoColado(mensagens);
  const fim = msgs.length;
  let inicio = fim;
  while (inicio > 0 && msgs[inicio - 1]!.direction === "inbound") inicio -= 1;
  const daVez = msgs.slice(inicio, fim);
  if (daVez.some(reclamaDoValor)) return true;
  // "Só tenho 80" pode não ter palavra de reclamação nenhuma.
  const dito = valorQueAPessoaTem([...msgs.slice(0, inicio), ...daVez]);
  const ditoAntes = valorQueAPessoaTem(msgs.slice(0, inicio));
  return dito !== null && dito < c.list_price_cents && dito !== ditoAntes;
}

/**
 * Um valor dito pela pessoa como o que ELA tem ou consegue pagar: "só tenho 60", "consigo 70",
 * "faz por 80", "R$ 50", "50 reais". O que vem depois do número exclui o que não é dinheiro
 * ("35 anos", "12x"); "dia 10" nem casa, porque falta o verbo.
 */
const VALOR_QUE_TEM = new RegExp(
  [
    "(?:s[óo]\\s+tenho|tenho\\s+s[óo]|tenho|s[óo]\\s+consigo|consigo|posso|d[áa]\\s+pra|faz|fecha|pago|dou|mando|arrumo|arranjo)" +
      "(?:\\s+(?:pagar|fazer|dar|mandar|por|s[óo]|apenas|at[ée]|uns|no\\s+m[áa]ximo|agora|hoje))*\\s+(?:R\\$\\s?)?(\\d{2,3})(?:[.,]\\d{2})?(?!\\d)",
    "R\\$\\s?(\\d{2,3})(?:[.,]\\d{2})?(?!\\d)",
    "(?<!\\d)(\\d{2,3})(?:[.,]\\d{2})?\\s*(?:reais|real|contos?|pilas?)\\b",
  ].join("|"),
  "gi",
);
const NAO_E_DINHEIRO = /^\s*(?:x\b|vezes|anos?\b|dias?\b|meses|m[êe]s\b|horas?\b|h\b|%|kg|km)/i;
const NEGADO = /(?:n[ãa]o|nem|sem)\s+(?:\S+\s+){0,2}$/i;

/**
 * QUANTO A PESSOA DISSE QUE TEM, em centavos — a última vez que ela disse, depois do preço.
 * `null` = não disse (ou disse só o que NÃO tem: "não tenho 100" é reclamação, não proposta).
 *
 * NÃO pula a escada (`degrauDoTurno`): conta como reclamação e muda o texto da oferta. A agente
 * nunca repete o número dela — oferece o próximo degrau.
 */
export function valorQueAPessoaTem(mensagens: readonly MensagemParaContar[]): number | null {
  const msgs = expandirHistoricoColado(mensagens);
  const primeiroPreco = msgs.findIndex((m) => m.direction === "outbound" && PRECO_DITO.test(m.body ?? ""));
  if (primeiroPreco === -1) return null;
  for (let i = msgs.length - 1; i > primeiroPreco; i -= 1) {
    const m = msgs[i]!;
    if (m.direction !== "inbound") continue;
    const corpo = m.body ?? "";
    let achado: number | null = null;
    for (const a of corpo.matchAll(VALOR_QUE_TEM)) {
      const numero = a[1] ?? a[2] ?? a[3];
      if (numero === undefined) continue;
      const inicio = a.index ?? 0;
      if (NAO_E_DINHEIRO.test(corpo.slice(inicio + a[0].length))) continue;
      if (NEGADO.test(corpo.slice(0, inicio))) continue;
      achado = Number(numero) * 100;
    }
    if (achado !== null) return achado;
  }
  return null;
}

/**
 * O estado que o turno usa: a contagem de rodadas, o valor que a pessoa disse ter e se ela
 * reclamou AGORA. Dizer o valor já é uma reclamação.
 */
export function estadoDaNegociacao(
  c: Pick<PricingConfig, "list_price_cents">,
  mensagens: readonly MensagemParaContar[],
): { reclamacoes: number | null; valorQueTemCents: number | null; reclamouAgora: boolean } {
  const reclamacoes = reclamacoesDeValor(mensagens);
  const dito = valorQueAPessoaTem(mensagens);
  const valorQueTemCents = dito !== null && dito < c.list_price_cents ? dito : null;
  return {
    reclamacoes: reclamacoes !== null && valorQueTemCents !== null ? Math.max(reclamacoes, 1) : reclamacoes,
    valorQueTemCents,
    reclamouAgora: reclamacoes !== null && reclamouDoValorAgora(c, mensagens),
  };
}

const RETORNO_DE_PAGAMENTO = /R\$|\blink\b|\bpag|\breceb|\bpix\b|\bvalor\b|combinad|\brito\b|\bfechar\b|dinheiro/i;

/**
 * O DEGRAU QUE FALTA OFERECER ANTES DE AGENDAR O PAGAMENTO, em centavos — ou `null` quando o
 * agendamento pode seguir.
 *
 * Medido em 08/10/2026, com a escada já descendo na 1ª reclamação: três retornos de pagamento
 * foram agendados em meia hora "para enviar o link de R$ 130", sem a agente ter oferecido o
 * degrau liberado. Quem diz "só recebo dia 20" ouviria na data o valor cheio que já recusou.
 * Aqui o agendamento de PAGAMENTO é recusado até a agente dizer um valor da escada; retorno que
 * não fala de pagamento ("volto amanhã para saber como você passou") segue livre.
 */
export function degrauQueFaltaOferecerAntesDeAgendar(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  estado: { reclamacoes: number | null; valorQueTemCents: number | null; combinadoCents: number | null },
  mensagens: readonly MensagemParaContar[],
  textoDoRetorno: string,
): number | null {
  if (!RETORNO_DE_PAGAMENTO.test(textoDoRetorno)) return null;
  if (estado.combinadoCents !== null) return null;
  const i = degrauDoTurno(c, estado.reclamacoes, estado.valorQueTemCents);
  if (i === -1) return null;
  if (valorCombinadoNaConversa(c, mensagens) !== null) return null;
  return c.steps[i]!.price_cents;
}

/** Uma data dita sem rodeio: "dia 27", "27/10", "fim do mês", "só recebo…", "quando cair". */
const DATA_CERTA =
  /\bdia\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}\b|(?:fim|final|come[çc]o|in[ií]cio|meio)\s+d[oe]\s+m[êe]s|m[êe]s\s+que\s+vem|pr[óo]ximo\s+m[êe]s|semana\s+que\s+vem|pr[óo]xima\s+semana|quinto\s+dia\s+[úu]til|quando\s+(?:eu\s+)?(?:receber|cair|sair)|s[óo]\s+recebo|dia\s+d[oe]\s+(?:meu\s+)?pagamento/i;
/** "amanhã", "sexta": só é data de pagamento se a mesma mensagem fala de pagar ou receber. */
const DATA_SOLTA = /\bamanh[ãa]\b|\b(?:segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)\b/i;
const FALA_DE_PAGAR = /receb|pag[oau]|dinheiro|grana|sal[áa]rio|pix|consigo|mando|fa[çc]o\b|fazer\b|cai\b|cair\b|vou\s+ter|tiver\b/i;

/**
 * A resposta curta de quem não pode: "Não consigo", "não dá", "infelizmente não tenho". Sem objeto
 * ela não casa com `RECLAMACAO_DE_VALOR`, e em 08/10/2026 foi a resposta ao preço de quem já tinha
 * dito seis vezes que estava sem dinheiro — a contagem ficou em zero e o valor cheio foi repetido.
 * Só vale quando é a mensagem INTEIRA: com objeto ("não tenho cartão") ela fala de outra coisa.
 */
const NEGATIVA_CURTA =
  /^(?:infelizmente\s+)?n[ãa]o\s+(?:consigo|posso|d[áa]|tenho|tem\s+como|vou\s+conseguir|vai\s+dar)(?:\s+(?:n[ãa]o|agora|hoje|mesmo|infelizmente|nada|ainda))*$/i;
function negativaCurta(corpo: string): boolean {
  // A mensagem INTEIRA é a negativa (pontuação e emoji do fim não contam): "não tenho cartão" e
  // "não tenho dúvida" têm objeto, e o objeto diz que não é sobre o valor.
  return NEGATIVA_CURTA.test(corpo.trim().replace(/[^a-zà-ú]+$/i, ""));
}

/** A mensagem adia o pagamento: uma data (certa ou solta) JUNTO de fala de pagar ou receber. */
function adiaOPagamento(corpo: string): boolean {
  return (DATA_CERTA.test(corpo) || DATA_SOLTA.test(corpo)) && FALA_DE_PAGAR.test(corpo);
}

/**
 * A PESSOA DISSE QUE FALTA PARA O ESSENCIAL — remédio, comida, aluguel, gás, luz, água.
 *
 * Medido em 08/10/2026: uma pessoa escreveu que ia "deixar de comprar remédio pressão" e, minutos
 * depois, recebeu o preço, a pergunta "Pix ou cartão?" e uma data de pagamento. A regra de recuar
 * existia só como frase dentro do molde de negociação; aqui é o código que decide, olhando a
 * conversa inteira, e o bloco de preço deixa de trazer valor para oferecer.
 */
const FALTA_PARA_O_ESSENCIAL =
  /(?:deixa(?:r|ndo|rei)?\s+de\s+(?:comprar|pagar|comer)|sem\s+(?:dinheiro\s+)?(?:pr[ao]s?|para\s+(?:o|a|os|as)?)|n[ãa]o\s+tenho\s+(?:nem\s+)?(?:dinheiro\s+)?(?:pr[ao]s?|para\s+(?:o|a|os|as)?)|nem\s+pr[ao]s?|falta(?:ndo)?|tirar\s+d[oae]s?)\s*(?:\S+\s+){0,3}?(?:rem[ée]dios?|comida|comer|aluguel|g[áa]s|conta\s+de\s+luz|[áa]gua\b|leite|fraldas?|feira|mercado)/i;

export function faltaParaOEssencial(mensagens: readonly MensagemParaContar[]): boolean {
  return expandirHistoricoColado(mensagens).some((m) => m.direction === "inbound" && FALTA_PARA_O_ESSENCIAL.test(m.body ?? ""));
}

/**
 * A PESSOA DEU UMA DATA PARA PAGAR nas mensagens que este turno responde (as dela depois da
 * última resposta nossa), com o preço já dito.
 *
 * Medido em 08/10/2026, na primeira conversa depois de a escada passar a descer na 1ª
 * reclamação: a agente ofereceu R$ 100, a pessoa respondeu "não tenho nada agora, só dia 27", e a
 * agente encerrou com "quando o dinheiro entrar, me chama" — sem valor e sem agendar retorno. O
 * roteiro mandava agendar; quem decide o molde do turno é o código (`bloco-do-prompt.ts`).
 */
export function deuDataParaPagar(mensagens: readonly MensagemParaContar[]): boolean {
  const msgs = expandirHistoricoColado(mensagens);
  if (!msgs.some((m) => m.direction === "outbound" && PRECO_DITO.test(m.body ?? ""))) return false;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i]!;
    if (m.direction !== "inbound") break;
    const corpo = m.body ?? "";
    if (DATA_CERTA.test(corpo) || (DATA_SOLTA.test(corpo) && FALA_DE_PAGAR.test(corpo))) return true;
  }
  return false;
}

const VALORES_EM_REAIS = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?/g;

/**
 * O VALOR COMBINADO — o último valor da escada que a agente disse, quando ele é um DEGRAU
 * (abaixo do valor de venda). `null` = ela ainda está no valor de venda, ou não disse preço.
 *
 * Existe para o retorno agendado: quem fecha por um degrau e só pode pagar em outra data tem
 * de reencontrar ESSE valor semanas depois, quando as reclamações que liberaram o degrau já
 * saíram da janela de histórico e a contagem voltou a zero.
 *
 * Só conta valor que É da escada: a mesma mensagem costuma citar a referência de mercado
 * ("R$ 380 a R$ 600") e a parcela ("12x de menos de R$ 15"), e nenhuma das duas é o preço.
 */
export function valorCombinadoNaConversa(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  mensagens: readonly MensagemParaContar[],
): number | null {
  const daEscada = new Set<number>([c.list_price_cents, ...c.steps.map((s) => s.price_cents)]);
  const msgs = expandirHistoricoColado(mensagens);
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i]!;
    if (m.direction !== "outbound") continue;
    let ultimo: number | null = null;
    for (const achado of (m.body ?? "").matchAll(VALORES_EM_REAIS)) {
      const cents = Number(achado[1]!.replace(/\./g, "")) * 100 + Number(achado[2] ?? "0");
      if (daEscada.has(cents)) ultimo = cents;
    }
    if (ultimo !== null) return ultimo < c.list_price_cents ? ultimo : null;
  }
  return null;
}

/**
 * O valor combinado que VALE neste turno: o que foi guardado com o retorno, desde que ainda
 * seja um degrau da escada em vigor. Se o dono mudou os valores depois, o combinado antigo
 * não fura o piso novo — a escada atual manda.
 */
export function combinadoEmVigor(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  guardado: number | null | undefined,
): number | null {
  if (guardado === null || guardado === undefined) return null;
  return c.steps.some((s) => s.price_cents === guardado) ? guardado : null;
}