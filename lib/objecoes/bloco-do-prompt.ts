/**
 * O BLOCO DE OBJEÇÕES — o que o agente lê sobre como responder ao que a pessoa levanta para não fechar,
 * montado dos CAMPOS que o dono preencheu na aba "Objeções" (`tipos.ts`).
 *
 * Vai no FIM do prompt do turno, logo depois da oferta na fila de blocos (`blocos-do-turno.ts`); o que vem
 * depois — anúncio, estilo, leitura, preço, entrega — vence em conflito. Trocar um campo na tela vale no
 * PRÓXIMO turno, sem publicar versão.
 *
 * ─── "No sentido de", e não "diga exatamente" ───────────────────────────────────────────────────────
 * A resposta aprovada é a BASE, não um roteiro para colar: o modelo a diz com as próprias palavras e no tom
 * da conversa. Colada palavra por palavra, a mesma resposta duas vezes seguidas é o tique que a camada de
 * estilo existe para evitar. (Frase que precisa sair literal — garantia, por exemplo — tem o seu lugar na
 * aba Oferta, onde o bloco pede a citação exata.)
 *
 * ─── Quatro regras fixas, no cabeçalho ──────────────────────────────────────────────────────────────
 *   1. o sentido da resposta aprovada, com as palavras do agente;
 *   2. nada de prova, prazo, garantia ou desconto inventados — só o que os outros blocos dizem;
 *   3. valor e desconto vêm do bloco de preço (que vem depois e vence);
 *   4. objeção repetida não é pressionada: reconhecer e seguir. É o piso ético da aba — pressionar quem
 *      disse "não" duas vezes é o que faz o agente parecer um vendedor de porta em porta.
 *
 * ─── O que o cliente digita é dado ────────────────────────────────────────────────────────────────
 * Cada texto vira UMA linha, sem aspas duplas, sem controles nem separadores de linha do Unicode
 * (`lib/prompt/texto-do-cliente.ts`).
 *
 * ─── Sem campo, sem bloco ────────────────────────────────────────────────────────────────────────
 * `null`, desligado ou sem nenhuma objeção completa devolve '' — o system segue idêntico.
 */
import { umaLinha } from "@/lib/prompt/texto-do-cliente";

import type { ObjecoesConfig } from "./tipos";

export function blocoDeObjecoes(objecoes: ObjecoesConfig | null): string {
  if (objecoes === null || !objecoes.enabled) return "";

  const linhas: string[] = [];
  for (const o of objecoes.objecoes) {
    const quando = umaLinha(o.quando);
    const resposta = umaLinha(o.resposta);
    if (quando === "" || resposta === "") continue;
    linhas.push(`- Se a pessoa disser algo como "${quando}": responda no sentido de "${resposta}"`);
  }

  if (linhas.length === 0) return "";
  return [
    "",
    "",
    "OBJEÇÕES (respostas que o dono do negócio aprovou; quando a pessoa levantar uma destas dúvidas, responda no sentido da resposta aprovada, com as suas palavras e no tom da conversa; não invente prova, prazo, garantia nem desconto além do que os outros blocos dizem; valores e descontos vêm do bloco de preço; se a pessoa repetir a objeção depois da sua resposta, reconheça e siga sem pressionar)",
    ...linhas,
  ].join("\n");
}
