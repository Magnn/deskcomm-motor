/**
 * OS IDIOMAS DA ÁREA DO CLIENTE — inglês, francês, italiano e alemão além do português e do espanhol.
 *
 * Pedido do dono em 03/11/2026, junto com o Plano da Semana em dólar e euro: quem chega de fora lê a área na própria
 * língua. A área é a única parte do produto nesses idiomas: o registro de idiomas do Desk (`registro.ts`) continua
 * pt-BR e es, para nenhuma tela do painel aparecer pela metade em inglês.
 *
 * Como traduz: português é a chave; espanhol vem do dicionário do produto (`dicionario.ts`); os outros quatro vêm dos
 * dicionários da área (`lib/i18n/area/*.ts`). Texto sem tradução cai no inglês e, sem inglês, no português — nunca
 * na chave crua de outro idioma. O que a IA escreve (leituras, sonhos, mão) não passa por aqui.
 *
 * Puro (sem `next/headers`): quem lê o cabeçalho do navegador é `area-servidor.ts`.
 */
import { DICIONARIO } from "./dicionario";
import { AREA_DE } from "./area/de";
import { AREA_EN } from "./area/en";
import { AREA_FR } from "./area/fr";
import { AREA_IT } from "./area/it";

export const IDIOMAS_DA_AREA = ["pt-BR", "es", "en", "fr", "it", "de"] as const;
export type IdiomaDaArea = (typeof IDIOMAS_DA_AREA)[number];

const DICIONARIOS_DA_AREA: Record<"en" | "fr" | "it" | "de", Record<string, string>> = {
  en: AREA_EN,
  fr: AREA_FR,
  it: AREA_IT,
  de: AREA_DE,
};

/** A etiqueta BCP-47 para `Intl` (datas e horas). `es` puro pelo mesmo motivo de `datas.ts`: público latino. */
const TAGS: Record<IdiomaDaArea, string> = { "pt-BR": "pt-BR", es: "es", en: "en", fr: "fr", it: "it", de: "de" };

export function tagDaArea(idioma: IdiomaDaArea): string {
  return TAGS[idioma];
}

export function traduzirNaArea(texto: string, idioma: IdiomaDaArea): string {
  if (idioma === "pt-BR") return texto;
  if (idioma === "es") return DICIONARIO[texto]?.es ?? texto;
  return DICIONARIOS_DA_AREA[idioma][texto] ?? AREA_EN[texto] ?? texto;
}

/** Normaliza um valor solto (cookie, parâmetro) para um idioma da área, ou `null`. */
export function idiomaDaAreaOuNulo(bruto: string | null | undefined): IdiomaDaArea | null {
  if (!bruto) return null;
  const primario = bruto.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  if (primario === "pt") return "pt-BR";
  return (IDIOMAS_DA_AREA as readonly string[]).includes(primario) ? (primario as IdiomaDaArea) : null;
}

/**
 * O primeiro idioma que a área serve na ordem de preferência do navegador (`Accept-Language`); sem nenhum, português.
 * Mesma regra de `parseAcceptLanguage` (`idiomas.ts`), com a lista da área.
 */
export function idiomaDaAreaPeloCabecalho(cabecalho: string | null | undefined): IdiomaDaArea {
  if (!cabecalho) return "pt-BR";
  const candidatos = cabecalho
    .split(",")
    .map((parte) => {
      const [tag, qBruto] = parte.trim().split(";q=");
      const q = qBruto ? Number.parseFloat(qBruto) : 1;
      return { tag: tag?.trim() ?? "", q: Number.isFinite(q) ? q : 1 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.q - a.q);
  for (const { tag } of candidatos) {
    const idioma = idiomaDaAreaOuNulo(tag);
    if (idioma) return idioma;
  }
  return "pt-BR";
}
