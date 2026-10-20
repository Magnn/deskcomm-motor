/**
 * O VALOR DITO DE UMA COBRANÇA AVULSA É O CADASTRADO.
 *
 * Medido em produção em 19/10/2026: a pergunta nova é R$ 5 (`pricing.extras`), mas a agente escreveu "é R$ 130 por
 * pergunta" — o preço do trabalho principal — e, quando o Pix saiu com o valor certo, "corrigiu" o certo para o errado
 * ("quero corrigir uma coisa: o valor de uma pergunta nova é R$ 130, não os R$ 5"). O cliente achou caro e saiu. O valor
 * do Pix já vinha do cadastro; o que a agente DIZ não passava por nenhuma conferência.
 *
 * A regra, por frase: frase que fala de uma cobrança avulsa (pela palavra do nome dela, ex.: "pergunta") e diz um valor
 * em reais tem de dizer o valor cadastrado ou um múltiplo pequeno dele ("as três por R$ 15"). Frase que também fala do
 * trabalho principal fica de fora — comparar os dois ("o trabalho é R$ 130 e a pergunta é R$ 5") é legítimo.
 *
 * ─── A conta tem de fechar com a quantidade (20/10/2026) ──────────────────────────────────────────────────────────
 * Medido em produção: a agente listou SEIS perguntas, escreveu "Fica em R$ 35 o pacote" e mandou o Pix de sete; quando a
 * cliente fez a conta ("6x5=30"), defendeu o erro ("o pacote sai num valor único"). A régua de "qualquer múltiplo" deixava
 * passar, e a frase do valor nem citava a pergunta. Agora:
 *   • frase que diz QUANTAS ("as 6 perguntas", "três perguntas") e um valor: o valor é o unitário ou a quantidade × o unitário;
 *   • resposta com a marca `[[PIX: nome xN]]`: a quantidade dita no texto tem de ser N, e todo valor dito ao falar da
 *     cobrança, do pacote ou do total tem de ser o unitário ou N × o unitário.
 *
 * Pura.
 */
import { marcaDeExtraNoCorpo } from "./extras";
import type { Extra } from "./tipos";
import { reais } from "./tipos";

/** Palavras do nome que não identificam a cobrança ("Pergunta NOVA", "Acompanhamento DO MÊS"). */
const PALAVRAS_GENERICAS = new Set(["nova", "novo", "novas", "novos", "mes", "unica", "unico", "extra", "avulsa", "avulso"]);
/** Quem fala do trabalho principal está comparando, não cobrando a avulsa. */
const PRODUTO_PRINCIPAL = /\btrabalh\w*/i;
/** Até quantas unidades um múltiplo é aceito ("as três por R$ 15"). */
const MAX_UNIDADES = 10;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** As palavras que identificam a cobrança numa frase: as do nome, com 5 letras ou mais e não genéricas. */
export function palavrasDoExtra(nome: string): string[] {
  return semAcento(nome)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 5 && !PALAVRAS_GENERICAS.has(p));
}

/** Os valores em centavos ditos na frase: "R$ 130", "R$130,00", "R$ 1.300", "15 reais". */
export function valoresDitos(frase: string): number[] {
  const valores: number[] = [];
  const emCentavos = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);
  for (const m of frase.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi)) valores.push(emCentavos(m[1]!));
  for (const m of frase.matchAll(/\b(\d+(?:,\d{1,2})?)\s*reais\b/gi)) valores.push(emCentavos(m[1]!));
  return valores.filter((v) => Number.isFinite(v) && v > 0);
}

/** Palavras de quantidade até o teto de unidades. */
const NUMERO_POR_EXTENSO: Record<string, number> = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

/** As quantidades ditas antes da palavra da cobrança: "6 perguntas", "as seis perguntas", "3 novas perguntas". */
export function quantidadesDitas(frase: string, palavra: string): number[] {
  const normalizada = semAcento(frase);
  const achadas: number[] = [];
  const padrao = new RegExp(`\\b(\\d{1,2}|${Object.keys(NUMERO_POR_EXTENSO).join("|")})\\s+(?:novas?\\s+)?${palavra}`, "g");
  for (const m of normalizada.matchAll(padrao)) {
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : NUMERO_POR_EXTENSO[m[1]!]!;
    if (n >= 1 && n <= MAX_UNIDADES) achadas.push(n);
  }
  return achadas;
}

/** Fala do valor do conjunto, sem citar a cobrança pelo nome: "Fica em R$ 35 o pacote", "o total", "tudo num Pix só". */
const FALA_DO_CONJUNTO = /\b(pacote|total|todas|tudo|juntas?|num (?:codigo|pix|pagamento) so)\b/;

function frases(corpo: string): string[] {
  return corpo.split(/(?<=[.!?…])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
}

/**
 * O motivo da recusa quando a mensagem diz um valor errado para uma cobrança avulsa; `null` quando está tudo certo.
 * O motivo volta ao modelo, que reescreve.
 */
export function valorErradoDeExtra(corpo: string, extras: readonly Extra[]): string | null {
  const marca = marcaDeExtraNoCorpo(corpo, extras);
  if (marca.tipo === "uma") {
    const erro = contaDaMarcaErrada(corpo, marca.extra, marca.quantidade);
    if (erro) return erro;
  }
  for (const frase of frases(corpo)) {
    if (PRODUTO_PRINCIPAL.test(frase)) continue;
    const valores = valoresDitos(frase);
    if (valores.length === 0) continue;
    const normalizada = semAcento(frase);
    for (const extra of extras) {
      const palavras = palavrasDoExtra(extra.name);
      if (palavras.length === 0 || !palavras.some((p) => new RegExp(`\\b${p}`).test(normalizada))) continue;
      const ditas = palavras.flatMap((p) => quantidadesDitas(frase, p));
      // Disse QUANTAS: o valor é o unitário ou exatamente aquela quantidade × o unitário.
      if (ditas.length > 0) {
        const aceitos = new Set([extra.price_cents, ...ditas.map((n) => n * extra.price_cents)]);
        const fora = valores.find((v) => !aceitos.has(v));
        if (fora !== undefined) return contaErrada(extra, ditas[0]!, fora);
        continue;
      }
      const errado = valores.find((v) => {
        const unidades = v / extra.price_cents;
        return !(Number.isInteger(unidades) && unidades >= 1 && unidades <= MAX_UNIDADES);
      });
      if (errado !== undefined) {
        return (
          `O valor de *${extra.name}* é ${reais(extra.price_cents)} — é o valor desta cobrança, não o do trabalho principal. ` +
          `A sua mensagem diz ${reais(errado)}. Reescreva dizendo ${reais(extra.price_cents)} por ${extra.name.toLowerCase()} ` +
          `(ou um múltiplo exato, para mais de uma) e NÃO "corrija" o valor depois: o valor do Pix é o certo.`
        );
      }
    }
  }
  return null;
}

function contaErrada(extra: Extra, quantidade: number, dito: number): string {
  return (
    `A conta está errada: ${quantidade} × ${reais(extra.price_cents)} (${extra.name.toLowerCase()}) = ${reais(quantidade * extra.price_cents)}, ` +
    `e a sua mensagem diz ${reais(dito)}. Não existe valor de pacote nem desconto: o total é sempre a quantidade × o valor. ` +
    `Reescreva com ${reais(quantidade * extra.price_cents)}.`
  );
}

/**
 * A resposta que cobra com `[[PIX: nome xN]]`: a quantidade dita tem de ser N, e o valor dito ao falar da cobrança, do
 * pacote ou do total, o unitário ou N × o unitário.
 */
function contaDaMarcaErrada(corpo: string, extra: Extra, quantidade: number): string | null {
  const palavras = palavrasDoExtra(extra.name);
  const total = quantidade * extra.price_cents;
  for (const frase of frases(corpo)) {
    if (PRODUTO_PRINCIPAL.test(frase)) continue;
    const normalizada = semAcento(frase);
    const citaACobranca = palavras.some((p) => new RegExp(`\\b${p}`).test(normalizada));
    if (citaACobranca) {
      const outra = palavras.flatMap((p) => quantidadesDitas(frase, p)).find((n) => n > 1 && n !== quantidade);
      if (outra !== undefined) {
        return (
          `Você combinou ${outra} ${extra.name.toLowerCase()}, mas a marca cobra ${quantidade}. ` +
          `Use ${"[[PIX: " + extra.name + " x" + outra + "]]"} — ${reais(outra * extra.price_cents)} no total.`
        );
      }
    }
    if (!citaACobranca && !FALA_DO_CONJUNTO.test(normalizada)) continue;
    const fora = valoresDitos(frase).find((v) => v !== extra.price_cents && v !== total);
    if (fora !== undefined) return contaErrada(extra, quantidade, fora);
  }
  return null;
}
