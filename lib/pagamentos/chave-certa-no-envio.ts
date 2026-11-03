/**
 * A CHAVE CERTA EM TODO ENVIO — a última trava antes de a mensagem sair, em qualquer caminho.
 *
 * ─── Por quê ─────────────────────────────────────────────────────────────────────────────────────
 * Em 01/11/2026 o dono passou a receber TODO Pix na chave de celular do financeiro (aba Preço do agente, `pix_key`
 * com `primary`). Em 03/11 a cliente ainda recebia chave errada. A chave antiga continuava escrita à mão em vários
 * lugares que o código não lê como "a chave":
 * - o nó "Enviar PIX" dos fluxos, que agora segue a principal (`pixDoNoPelaChavePrincipal`);
 * - textos de caixas de conteúdo;
 * - o roteiro do agente;
 * - o atendente, de memória.
 * Cada lugar novo onde alguém escreve uma chave é uma nova chance de o dinheiro ir para a conta errada.
 *
 * ─── A regra ─────────────────────────────────────────────────────────────────────────────────────
 * Com chave principal configurada, toda mensagem de texto que sai pelo handler de envio (agente, fluxo, régua,
 * atendente, MCP) é lida aqui. Uma chave Pix que NÃO é a principal vira a principal. Conta como chave:
 * - CNPJ, CPF, celular, e-mail ou chave aleatória;
 * - num balão que fala de Pix ou de chave, ou num balão que é só a chave (o jeito de mandar para copiar).
 * Código copia e cola (`000201…`) e links não são lidos: o código é gerado a partir da própria chave, e o link é
 * do provedor.
 *
 * Pura.
 */
import type { ChavePixDaEmpresa } from "@/lib/preco/chave-pix";
import { chaveParaCopiar } from "@/lib/preco/chave-pix";

import { chavePixNormalizada } from "./pix-estatico";

const CONTEXTO_DE_PIX = /\bpix\b|\bchave\b/i;
/** O que NÃO é lido: código copia e cola e endereços (o link tem números e @ que parecem chave). */
// O código vai até o fim da linha: o da Stripe tem espaço no meio (o nome do recebedor).
const MASCARAS = [/000201[^\n]{20,}/g, /https?:\/\/\S+/gi, /\bwww\.\S+/gi];

const CANDIDATAS: ReadonlyArray<RegExp> = [
  // CNPJ: 62.917.956/0001-00 ou 62917956000100
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  // CPF pontuado: 123.456.789-00
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
  // Celular: +55 69 99367-7810, (69) 99367-7810, 69993677810
  /(?:\+\s?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9\d{4}[\s-]?\d{4}\b/g,
  // E-mail
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g,
  // Chave aleatória
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
];

/** Duas chaves são a mesma? Celular compara pelos 11 dígitos finais (com ou sem +55). */
function mesmaChave(a: string, b: string): boolean {
  const na = normalizarParaComparar(a);
  const nb = normalizarParaComparar(b);
  return na !== null && na === nb;
}

function normalizarParaComparar(chave: string): string | null {
  const crua = chave.trim();
  if (crua.includes("@") || /^[0-9a-f-]{36}$/i.test(crua)) return chavePixNormalizada(crua);
  const d = crua.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return d.slice(2);
  if (d.length === 11 || d.length === 14) return d;
  return null;
}

export interface ChaveCorrigida {
  body: string;
  /** As chaves trocadas, como apareciam no texto. Vazio = nada mudou. */
  trocadas: string[];
}

/** O texto tem algo que pode ser uma chave Pix? Barato: decide se vale ler a chave da empresa. */
export function podeTerChavePix(body: string): boolean {
  let t = body;
  for (const m of MASCARAS) t = t.replace(m, " ");
  return CANDIDATAS.some((r) => new RegExp(r.source, r.flags).test(t));
}

/**
 * Troca toda chave Pix que não é a principal pela principal (`chaveParaCopiar`). Só lê o balão que fala de Pix ou de
 * chave, ou o que é só a chave.
 */
export function trocarChavesErradas(body: string, principal: ChavePixDaEmpresa): ChaveCorrigida {
  const certa = chaveParaCopiar(principal);
  if (certa === null) return { body, trocadas: [] };
  // Os trechos mascarados guardam a posição: troca-se no texto original, fora deles.
  const protegidos: Array<[number, number]> = [];
  for (const m of MASCARAS) for (const a of body.matchAll(new RegExp(m.source, m.flags))) protegidos.push([a.index!, a.index! + a[0].length]);
  const livre = (ini: number, fim: number) => !protegidos.some(([a, b]) => ini < b && fim > a);

  const achadas: Array<{ ini: number; fim: number; texto: string }> = [];
  for (const r of CANDIDATAS) {
    for (const a of body.matchAll(new RegExp(r.source, r.flags))) {
      const ini = a.index!;
      const fim = ini + a[0].length;
      if (!livre(ini, fim) || achadas.some((x) => ini < x.fim && fim > x.ini)) continue;
      achadas.push({ ini, fim, texto: a[0] });
    }
  }
  if (achadas.length === 0) return { body, trocadas: [] };

  const semMascaras = protegidos.reduce((t, [a, b]) => t.slice(0, a) + " ".repeat(b - a) + t.slice(b), body);
  const soAChave = achadas.length === 1 && semMascaras.replace(achadas[0]!.texto, "").replace(/[\s:.,;*_👇⬇️-]/gu, "") === "";
  if (!soAChave && !CONTEXTO_DE_PIX.test(semMascaras)) return { body, trocadas: [] };

  const erradas = achadas.filter((x) => normalizarParaComparar(x.texto) !== null && !mesmaChave(x.texto, principal.key)).sort((a, b) => b.ini - a.ini);
  if (erradas.length === 0) return { body, trocadas: [] };
  let saida = body;
  for (const x of erradas) saida = saida.slice(0, x.ini) + certa + saida.slice(x.fim);
  return { body: saida, trocadas: erradas.map((x) => x.texto).reverse() };
}
