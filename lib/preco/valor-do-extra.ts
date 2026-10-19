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
 * Pura.
 */
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

function frases(corpo: string): string[] {
  return corpo.split(/(?<=[.!?…])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
}

/**
 * O motivo da recusa quando a mensagem diz um valor errado para uma cobrança avulsa; `null` quando está tudo certo.
 * O motivo volta ao modelo, que reescreve.
 */
export function valorErradoDeExtra(corpo: string, extras: readonly Extra[]): string | null {
  for (const frase of frases(corpo)) {
    if (PRODUTO_PRINCIPAL.test(frase)) continue;
    const valores = valoresDitos(frase);
    if (valores.length === 0) continue;
    const normalizada = semAcento(frase);
    for (const extra of extras) {
      const palavras = palavrasDoExtra(extra.name);
      if (palavras.length === 0 || !palavras.some((p) => new RegExp(`\\b${p}`).test(normalizada))) continue;
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
