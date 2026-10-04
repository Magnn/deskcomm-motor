/**
 * O BLOCO DA JORNADA — o que o agente lê sobre a etapa em que a conversa está NESTE turno.
 *
 * Vai no fim do prompt do turno (`blocos-do-turno.ts`), depois da base e antes dos diretivos do funil.
 * Um molde por vez, como o de preço e o da leitura: só a etapa ATUAL entra, com o nome da próxima apenas
 * para dizer o que NÃO adiantar. O conteúdo das etapas seguintes não aparece no prompt antes da hora.
 *
 * ─── O que o cliente digitou é dado ───────────────────────────────────────────────────────────────
 * Nome, objetivo e rótulos passam por `umaLinha` (`lib/prompt/texto-do-cliente.ts`). Os VALORES que a
 * pessoa mandou também: são texto de quem conversa, e entram como dado numa linha, com teto.
 *
 * Sem jornada, `""` — o system segue idêntico.
 */
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import type { EstadoDaJornada } from "./estado";
import { LIBERACOES, NOME_DA_LIBERACAO, type CampoDaEtapa, type JornadaConfig } from "./tipos";

function descreverFalta(c: CampoDaEtapa, estado: EstadoDaJornada): string {
  const rotulo = umaLinha(c.rotulo);
  if (c.tipo === "numeros") {
    const ja = estado.parciais[c.chave] ?? [];
    const base = `${rotulo} (${c.quantidade} números de ${c.minimo} a ${c.maximo}, sem repetir`;
    return ja.length > 0 ? `${base}; já disse: ${ja.join(", ")} — falta(m) ${c.quantidade! - ja.length})` : `${base})`;
  }
  if (c.tipo === "data") return `${rotulo} (uma data)`;
  return rotulo;
}

export function blocoDaJornada(jornada: JornadaConfig | null, estado: EstadoDaJornada | null): string {
  if (jornada === null || estado === null) return "";
  const { etapa } = estado;
  const linhas: string[] = [`- Objetivo agora: ${umaLinha(etapa.objetivo)}`];

  if (estado.faltam.length > 0) {
    linhas.push(`- Ainda falta saber: ${estado.faltam.map((c) => descreverFalta(c, estado)).join("; ")}.`);
  }

  const conhecidos = jornada.etapas
    .flatMap((e) => e.campos)
    .filter((c) => estado.valores[c.chave] !== undefined)
    .map((c) => `${umaLinha(c.rotulo)}: ${umaLinha(estado.valores[c.chave]!).slice(0, 80)}`);
  if (conhecidos.length > 0) linhas.push(`- Já sabemos (não pergunte de novo): ${conhecidos.join("; ")}.`);

  if (estado.ultima) {
    linhas.push("- Esta é a última etapa da jornada.");
  } else {
    const proxima = umaLinha(jornada.etapas[estado.indice + 1]!.nome);
    const fim =
      etapa.saida === "campos" ? "quando a pessoa informar o que falta" : "quando a pessoa responder a esta etapa";
    linhas.push(`- Esta etapa termina ${fim}; a próxima é "${proxima}". Não adiante a próxima neste turno.`);
  }

  const bloqueado = LIBERACOES.filter((l) => !estado.liberado.has(l)).map((l) => NOME_DA_LIBERACAO[l]);
  if (bloqueado.length > 0) {
    linhas.push(
      `- Ainda NÃO fale de: ${bloqueado.join("; ")}. Se a pessoa perguntar, diga com gentileza que já chega lá e volte a esta etapa.`,
    );
  }
  linhas.push("- Termine com uma pergunta só, curta, que a pessoa saiba responder.");

  return [
    "",
    "",
    `JORNADA — ETAPA ${estado.indice + 1} DE ${estado.total}: "${umaLinha(etapa.nome)}" (o código conta em que etapa a conversa está; siga só esta etapa)`,
    ...linhas,
  ].join("\n");
}
