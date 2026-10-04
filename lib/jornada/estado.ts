/**
 * EM QUE ETAPA DA JORNADA A CONVERSA ESTÁ — contado pelo código sobre o histórico, nunca pelo modelo.
 *
 * Mesmo padrão de `lib/preco/estado-da-negociacao.ts` e `lib/leitura/estado-da-leitura.ts`, só que sem
 * nada de segmento: as etapas e os campos vêm da configuração (`tipos.ts`).
 *
 * ─── A regra, mensagem a mensagem ─────────────────────────────────────────────────────────────────
 * Percorre a conversa em ordem, começando na etapa 1:
 *   - mensagem da AGENTE marca que ela já falou nesta etapa (já pediu o que a etapa pede);
 *   - mensagem da PESSOA preenche os campos da etapa atual que ela conseguir, ACUMULANDO entre mensagens
 *     (três números mandados em três mensagens contam como os três — foi exatamente o defeito medido na
 *     leitura em produção);
 *   - a etapa termina quando os campos estão completos (`saida: campos`) ou quando a pessoa responde
 *     depois de a agente falar na etapa (`saida: resposta`), e a conversa passa para a próxima. A última
 *     etapa não termina: a conversa fica nela.
 *
 * ─── O que o código confere, por tipo ─────────────────────────────────────────────────────────────
 *   - `numeros`: inteiros dentro do intervalo, sem repetir, até a quantidade. Só vale DEPOIS de a agente
 *     falar na etapa: "tenho 3 filhos, há 10 anos" antes do pedido não é escolha nenhuma.
 *   - `data`: dd/mm/aaaa (ou com - e .), ou "12 de março de 1990". Vale mesmo antes do pedido — uma data
 *     não é ambígua, e quem adianta o nascimento não deve ouvir a pergunta de novo.
 *   - `texto`: o código só sabe que a pessoa RESPONDEU depois do pedido; o sentido quem lê é o modelo,
 *     que vê a conversa inteira. É por isso que a etapa que só tem texto costuma terminar por `resposta`.
 *
 * ─── Limite conhecido ─────────────────────────────────────────────────────────────────────────────
 * O estado é recontado sobre as mensagens que o turno carrega (a janela do contexto), como a leitura e a
 * escada de preço. Conversa mais longa que a janela recomeça a contagem do ponto que a janela alcança.
 */
import { expandirHistoricoColado, type MensagemParaContar } from "@/lib/preco/estado-da-negociacao";

import type { CampoDaEtapa, EtapaDaJornada, JornadaConfig, Liberacao } from "./tipos";

export interface EstadoDaJornada {
  /** 0-based. */
  indice: number;
  etapa: EtapaDaJornada;
  total: number;
  ultima: boolean;
  /** A agente já falou nesta etapa (já pediu o que ela pede). */
  agenteJaFalou: boolean;
  /** Valores confirmados pelo código, de todas as etapas até aqui, por chave. */
  valores: Record<string, string>;
  /** Números já ditos de um campo `numeros` ainda incompleto, por chave. */
  parciais: Record<string, number[]>;
  /** Campos da etapa atual que ainda faltam. */
  faltam: CampoDaEtapa[];
  /** O que já pode ser mencionado (cumulativo até a etapa atual). */
  liberado: ReadonlySet<Liberacao>;
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const DATA_NUMERICA = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/;
const DATA_POR_EXTENSO = /\b(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})\b/;

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "");

/** A data que a pessoa escreveu, como dd/mm/aaaa. `null` = nenhuma data válida. */
export function extrairData(corpo: string): string | null {
  const t = semAcento(corpo.toLowerCase());
  let dia: number, mes: number, ano: number;
  const n = DATA_NUMERICA.exec(t);
  if (n) {
    dia = Number(n[1]);
    mes = Number(n[2]);
    ano = Number(n[3]);
    if (ano < 100) ano += ano > 30 ? 1900 : 2000;
  } else {
    const e = DATA_POR_EXTENSO.exec(t);
    if (!e || MESES[e[2]!] === undefined) return null;
    dia = Number(e[1]);
    mes = MESES[e[2]!]!;
    ano = Number(e[3]);
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;
}

/** Os inteiros do texto que caem no intervalo, na ordem em que aparecem. */
export function numerosNoIntervalo(corpo: string, minimo: number, maximo: number): number[] {
  return (corpo.match(/\d+/g) ?? []).map(Number).filter((v) => v >= minimo && v <= maximo);
}

/** O que esta mensagem da pessoa preenche nos campos da etapa. Muda `valores` e `parciais`. */
function preencher(
  etapa: EtapaDaJornada,
  corpo: string,
  agenteJaFalou: boolean,
  valores: Record<string, string>,
  parciais: Record<string, number[]>,
): void {
  for (const c of etapa.campos) {
    if (valores[c.chave] !== undefined) continue;
    if (c.tipo === "data") {
      const d = extrairData(corpo);
      if (d !== null) valores[c.chave] = d;
    } else if (c.tipo === "numeros") {
      if (!agenteJaFalou) continue;
      const ja = parciais[c.chave] ?? [];
      for (const v of numerosNoIntervalo(corpo, c.minimo!, c.maximo!)) {
        if (ja.length >= c.quantidade!) break;
        if (!ja.includes(v)) ja.push(v);
      }
      if (ja.length >= c.quantidade!) {
        valores[c.chave] = ja.join(", ");
        delete parciais[c.chave];
      } else if (ja.length > 0) {
        parciais[c.chave] = ja;
      }
    } else if (agenteJaFalou && corpo.trim() !== "") {
      valores[c.chave] = corpo.trim().slice(0, 200);
    }
  }
}

const completa = (etapa: EtapaDaJornada, valores: Record<string, string>) =>
  etapa.campos.every((c) => valores[c.chave] !== undefined);

/** O estado da jornada PARA ESTE TURNO. */
export function estadoDaJornada(jornada: JornadaConfig, mensagens: readonly MensagemParaContar[]): EstadoDaJornada {
  // O painel de Teste roda UMA mensagem: um histórico colado ali ("Lead: …" / "Agente: …") vira várias,
  // como já vale para a escada de preço e a leitura. Na produção nenhuma mensagem tem esse formato.
  const conversa = expandirHistoricoColado(mensagens);
  const valores: Record<string, string> = {};
  const parciais: Record<string, number[]> = {};
  let indice = 0;
  let agenteJaFalou = false;
  const ultimoIndice = jornada.etapas.length - 1;

  for (const m of conversa) {
    if (m.direction === "outbound") {
      agenteJaFalou = true;
      continue;
    }
    if (m.direction !== "inbound") continue;
    const corpo = m.body ?? "";
    const etapa = jornada.etapas[indice]!;
    preencher(etapa, corpo, agenteJaFalou, valores, parciais);
    if (indice === ultimoIndice) continue;

    const terminou =
      etapa.saida === "campos" ? completa(etapa, valores) : agenteJaFalou && corpo.trim() !== "";
    if (!terminou) continue;

    indice += 1;
    agenteJaFalou = false;
    // A mesma mensagem pode já trazer o que a etapa nova pede (só o que não depende do pedido: datas).
    preencher(jornada.etapas[indice]!, corpo, false, valores, parciais);
  }

  const etapa = jornada.etapas[indice]!;
  const liberado = new Set<Liberacao>(jornada.etapas.slice(0, indice + 1).flatMap((e) => e.libera));
  return {
    indice,
    etapa,
    total: jornada.etapas.length,
    ultima: indice === ultimoIndice,
    agenteJaFalou,
    valores,
    parciais,
    faltam: etapa.campos.filter((c) => valores[c.chave] === undefined),
    liberado,
  };
}

const VALOR_EM_DINHEIRO = /R\$\s?\d|\b\d+(?:[.,]\d+)?\s*reais?\b/i;
const LINK = /https?:\/\/\S+/i;

/**
 * A CATRACA no envio: a mensagem fala do que a etapa ainda não libera? Devolve o motivo (para o modelo
 * reescrever) ou `null` quando pode sair. Só o que dá para conferir sem modelo: valor em dinheiro e link.
 * "A oferta" é conteúdo, não padrão — ela é contida pelo prompt, não pelo envio.
 */
export function vetoDaJornada(estado: EstadoDaJornada, corpo: string): string | null {
  const falta: string[] = [];
  if (!estado.liberado.has("preco") && VALOR_EM_DINHEIRO.test(corpo)) falta.push("o preço");
  if (!estado.liberado.has("link") && LINK.test(corpo)) falta.push("um link");
  if (falta.length === 0) return null;
  return (
    `A conversa está na etapa ${estado.indice + 1} de ${estado.total} ("${estado.etapa.nome}") e ela ainda não libera ` +
    `${falta.join(" nem ")}. Reescreva a mensagem sem isso, cumprindo o objetivo desta etapa, e chame send_message de novo.`
  );
}
