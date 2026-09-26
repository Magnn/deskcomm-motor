/**
 * O BLOCO DE IDENTIDADE — o que o agente lê sobre quem ele é e como fala, montado dos CAMPOS que o dono
 * do negócio preencheu na aba "Identidade" (`tipos.ts`).
 *
 * Vai no FIM do prompt do turno (o prefixo estável e cacheável fica intacto), na primeira posição da
 * fila de blocos (`blocos-do-turno.ts`): é o contexto-base, e o que vem depois — anúncio, estilo,
 * leitura, preço, entrega — vence em caso de conflito. Trocar um campo na tela vale no PRÓXIMO turno,
 * sem publicar versão.
 *
 * ─── Cada fala é um molde, não uma paráfrase ───────────────────────────────────────────────────────
 * O tom, o tratamento, os emojis e o tamanho saem de frases fixas (`tipos.ts`), escritas e revisadas uma
 * vez. O que o cliente digita (nome, empresa, público, apresentação, palavras) entra como DADO, dentro
 * de um molde: reduzido a uma linha e sem aspas duplas, para que nada do que ele escreva consiga fechar
 * uma citação, abrir uma seção nova ou se passar por instrução do sistema.
 *
 * ─── Sem campo, sem bloco ────────────────────────────────────────────────────────────────────────
 * `null`, desligado ou sem nenhum campo preenchido devolve '' — o system segue idêntico ao de antes.
 */
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import {
  DESCRICAO_DO_TOM,
  FRASE_DO_EMOJI,
  FRASE_DO_TAMANHO,
  FRASE_DO_TRATAMENTO,
  type IdentidadeConfig,
} from "./tipos";

const entreAspas = (itens: readonly string[]): string =>
  itens
    .map(umaLinha)
    .filter((i) => i !== "")
    .map((i) => `"${i}"`)
    .join(", ");

export function blocoDeIdentidade(identidade: IdentidadeConfig | null): string {
  if (identidade === null || !identidade.enabled) return "";

  const nome = umaLinha(identidade.nome ?? "");
  const empresa = umaLinha(identidade.empresa ?? "");
  const oQueFaz = umaLinha(identidade.o_que_a_empresa_faz ?? "");
  const publico = umaLinha(identidade.publico ?? "");
  const apresentacao = umaLinha(identidade.apresentacao ?? "");

  const linhas: string[] = [];
  if (nome !== "" && empresa !== "") linhas.push(`- Você é ${nome}, da ${empresa}.`);
  else if (nome !== "") linhas.push(`- Você é ${nome}.`);
  else if (empresa !== "") linhas.push(`- Você atende em nome de ${empresa}.`);
  if (apresentacao !== "") {
    linhas.push(`- Na primeira mensagem, apresente-se com estas palavras: "${apresentacao}".`);
  }
  if (oQueFaz !== "") linhas.push(`- Sobre a empresa: ${oQueFaz}`);
  if (publico !== "") linhas.push(`- Você atende: ${publico}`);
  if (identidade.tom !== undefined) linhas.push(`- Tom: ${DESCRICAO_DO_TOM[identidade.tom].frase}.`);
  if (identidade.tratamento !== undefined) linhas.push(`- ${FRASE_DO_TRATAMENTO[identidade.tratamento]}`);
  if (identidade.emojis !== undefined) linhas.push(`- ${FRASE_DO_EMOJI[identidade.emojis]}`);
  if (identidade.mensagens !== undefined) linhas.push(`- ${FRASE_DO_TAMANHO[identidade.mensagens]}`);

  const casa = entreAspas(identidade.palavras_da_casa);
  if (casa !== "") linhas.push(`- Use as palavras da casa quando couber: ${casa}.`);
  const evitar = entreAspas(identidade.palavras_a_evitar);
  if (evitar !== "") linhas.push(`- Nunca use estas palavras: ${evitar}.`);

  if (linhas.length === 0) return "";
  return [
    "",
    "",
    "IDENTIDADE E TOM (definidos pelo dono do negócio; valem sobre o seu jeito padrão de falar — molde literal e regra de segurança deste prompt valem mais)",
    ...linhas,
  ].join("\n");
}
