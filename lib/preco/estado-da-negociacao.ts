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
 * Duas coisas descem a escada, e vale a que desce MAIS:
 *  - cada reclamação de valor libera um degrau, A PARTIR DA PRIMEIRA;
 *  - a pessoa dizer quanto tem pula direto para o maior degrau que cabe nesse valor (ou para o
 *    último, se nem ele couber).
 *
 * Até 08/10/2026 a 1ª reclamação só repetia o valor de venda e cada uma seguinte liberava um
 * degrau. Medido nas conversas daquele dia: 42 pessoas reclamaram do valor depois do preço, a
 * agente citou um valor menor para 1, e 1 comprou — quem não tem o valor cheio desiste na 2ª
 * resposta, e com seis degraus seriam sete reclamações até o mínimo.
 */
export function degrauDoTurno(
  c: Pick<PricingConfig, "list_price_cents" | "steps">,
  reclamacoes: number | null,
  valorQueTemCents: number | null = null,
): number {
  if (reclamacoes === null || reclamacoes <= 0 || c.steps.length === 0) return -1;
  const ultimo = c.steps.length - 1;
  const porReclamacao = Math.min(reclamacoes - 1, ultimo);
  let porValor = -1;
  if (valorQueTemCents !== null && valorQueTemCents < c.list_price_cents) {
    const cabe = c.steps.findIndex((d) => d.price_cents <= valorQueTemCents);
    porValor = cabe === -1 ? ultimo : cabe;
  }
  return Math.max(porReclamacao, porValor);
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

/**
 * Quantas vezes a pessoa reclamou do valor. `null` = preço ainda não dito.
 *
 * Conta o que veio DEPOIS do preço — e, havendo ao menos uma, soma UMA pelo que ela avisou
 * antes ("já vou dizendo que estou sem dinheiro"). Medido em 08/10/2026: 35 de 94 pessoas com
 * dinheiro curto avisaram antes de ouvir o valor, e o aviso era jogado fora. Sozinho ele não
 * abre a negociação: enquanto ela não reagir ao preço, não há o que negociar.
 */
export function reclamacoesDeValor(mensagens: readonly MensagemParaContar[]): number | null {
  const msgs = expandirHistoricoColado(mensagens);
  const primeiroPreco = msgs.findIndex((m) => m.direction === "outbound" && PRECO_DITO.test(m.body ?? ""));
  if (primeiroPreco === -1) return null;
  const reclama = (m: MensagemParaContar) => m.direction === "inbound" && RECLAMACAO_DE_VALOR.test(m.body ?? "");
  const depois = msgs.slice(primeiroPreco + 1).filter(reclama).length;
  if (depois === 0) return 0;
  return depois + (msgs.slice(0, primeiroPreco).some(reclama) ? 1 : 0);
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
 * Serve para pular a escada: quem diz "só tenho 60" não precisa reclamar quatro vezes para
 * chegar ao degrau de R$ 60. A agente nunca repete o número dela — oferece o degrau que cabe.
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

/** O estado que o turno usa: a contagem e o valor que a pessoa disse ter. Dizer o valor já é uma reclamação. */
export function estadoDaNegociacao(
  c: Pick<PricingConfig, "list_price_cents">,
  mensagens: readonly MensagemParaContar[],
): { reclamacoes: number | null; valorQueTemCents: number | null } {
  const reclamacoes = reclamacoesDeValor(mensagens);
  const dito = valorQueAPessoaTem(mensagens);
  const valorQueTemCents = dito !== null && dito < c.list_price_cents ? dito : null;
  return {
    reclamacoes: reclamacoes !== null && valorQueTemCents !== null ? Math.max(reclamacoes, 1) : reclamacoes,
    valorQueTemCents,
  };
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