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

import { pisoEmCentavos, type PricingConfig } from "./tipos";

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
    "n[ãa]o\\s+(?:tenho|consigo|d[áa])\\s+(?:dinheiro|como\\s+pagar|condi[çc][õo]es|pagar)",
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
 * O MENOR valor que a agente pode citar NESTE turno — a escada em números.
 *
 * Antes da 2ª reclamação só o valor de venda; a 2ª libera o degrau 1; a 3ª, o degrau 2… e do
 * último em diante, o mínimo. É o que a trava de promessas do turno usa: se o modelo ignorar o
 * molde e oferecer o desconto CEDO demais (o defeito que custa dinheiro), a mensagem é vetada
 * antes de sair. O defeito contrário — não oferecer o degrau quando podia — só deixa de
 * conceder, e o bloco de preço cuida dele.
 */
export function precoPermitidoAgora(c: Pick<PricingConfig, "list_price_cents" | "steps">, reclamacoes: number | null): number {
  if (reclamacoes === null || reclamacoes <= 1) return c.list_price_cents;
  const degrau = c.steps[reclamacoes - 2];
  return degrau !== undefined ? degrau.price_cents : pisoEmCentavos(c);
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

/** Quantas vezes a pessoa reclamou do valor desde que a agente disse o preço. `null` = preço ainda não dito. */
export function reclamacoesDeValor(mensagens: readonly MensagemParaContar[]): number | null {
  const msgs = expandirHistoricoColado(mensagens);
  const primeiroPreco = msgs.findIndex((m) => m.direction === "outbound" && PRECO_DITO.test(m.body ?? ""));
  if (primeiroPreco === -1) return null;
  return msgs
    .slice(primeiroPreco + 1)
    .filter((m) => m.direction === "inbound" && RECLAMACAO_DE_VALOR.test(m.body ?? "")).length;
}
