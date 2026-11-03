/**
 * Os idiomas da área do cliente (`lib/i18n/area.ts`): inglês, francês, italiano e alemão.
 *
 * A cerca: todo texto do dicionário que o código da área usa (entre aspas, em `app/c`, `lib/area-do-cliente`, nas
 * rotas públicas da área e nas bibliotecas de leitura) tem tradução nos quatro idiomas — texto novo da área sem
 * tradução reprova aqui, em vez de aparecer em português para quem lê em alemão.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { idiomaDaAreaOuNulo, idiomaDaAreaPeloCabecalho, traduzirNaArea } from "@/lib/i18n/area";
import { AREA_DE } from "@/lib/i18n/area/de";
import { AREA_EN } from "@/lib/i18n/area/en";
import { AREA_FR } from "@/lib/i18n/area/fr";
import { AREA_IT } from "@/lib/i18n/area/it";
import { DICIONARIO } from "@/lib/i18n/dicionario";

const IDIOMAS = { en: AREA_EN, fr: AREA_FR, it: AREA_IT, de: AREA_DE };
const PASTAS = ["app/c", "lib/area-do-cliente", "app/api/v1/area/publica", "lib/leitura", "lib/relatorio"];

function arquivos(pasta: string, out: string[] = []): string[] {
  for (const nome of readdirSync(pasta)) {
    const p = join(pasta, nome);
    if (statSync(p).isDirectory()) arquivos(p, out);
    else if (/\.tsx?$/.test(nome) && !/\.test\./.test(nome)) out.push(p);
  }
  return out;
}

const marcadores = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort();

describe("idiomas da área", () => {
  it("⭐ todo texto do dicionário usado na área tem inglês, francês, italiano e alemão", () => {
    const codigo = PASTAS.flatMap((p) => arquivos(join(process.cwd(), p)))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const usadas = Object.keys(DICIONARIO).filter(
      (k) => codigo.includes(JSON.stringify(k)) || codigo.includes(`'${k}'`) || codigo.includes("`" + k + "`"),
    );
    expect(usadas.length).toBeGreaterThan(500);
    for (const [idioma, dic] of Object.entries(IDIOMAS)) {
      const faltando = usadas.filter((k) => !(k in dic));
      expect(faltando, `sem ${idioma}`).toEqual([]);
    }
  });

  it("os quatro dicionários têm as mesmas chaves, nada vazio e os marcadores ({hora}, {n}) intactos", () => {
    const chaves = Object.keys(AREA_EN).sort();
    for (const [idioma, dic] of Object.entries(IDIOMAS)) {
      expect(Object.keys(dic).sort(), idioma).toEqual(chaves);
      for (const [pt, traducao] of Object.entries(dic)) {
        expect(traducao.trim(), `${idioma}: ${pt}`).not.toBe("");
        expect(marcadores(traducao), `${idioma}: ${pt}`).toEqual(marcadores(pt));
      }
    }
  });

  it("o navegador escolhe: primeiro idioma servido na ordem de preferência; nenhum → português", () => {
    expect(idiomaDaAreaPeloCabecalho("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(idiomaDaAreaPeloCabecalho("ja-JP,fr;q=0.7,en;q=0.5")).toBe("fr");
    expect(idiomaDaAreaPeloCabecalho("en-US")).toBe("en");
    expect(idiomaDaAreaPeloCabecalho("pt-PT,pt;q=0.9")).toBe("pt-BR");
    expect(idiomaDaAreaPeloCabecalho("es-MX")).toBe("es");
    expect(idiomaDaAreaPeloCabecalho("ja-JP")).toBe("pt-BR");
    expect(idiomaDaAreaPeloCabecalho(null)).toBe("pt-BR");
    expect(idiomaDaAreaOuNulo("it")).toBe("it");
    expect(idiomaDaAreaOuNulo("xx")).toBeNull();
  });

  it("traduz: português é a chave, espanhol vem do dicionário do produto, o resto dos dicionários da área", () => {
    expect(traduzirNaArea("Sua carta de hoje", "pt-BR")).toBe("Sua carta de hoje");
    expect(traduzirNaArea("Sua carta de hoje", "en")).toBe("Your card for today");
    expect(traduzirNaArea("Sua carta de hoje", "de")).toBe("Deine Karte für heute");
    expect(traduzirNaArea("Sua carta de hoje", "es")).toBe(DICIONARIO["Sua carta de hoje"]?.es);
    expect(traduzirNaArea("texto que não existe", "fr")).toBe("texto que não existe");
  });
});
