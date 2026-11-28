import { describe, expect, it } from "vitest";

import { blocoDaPortaDeEntrada, liberaOTrabalho, portaDeEntrada, veioPorIndicacao } from "./porta-de-entrada";
import type { Extra } from "./tipos";

const completa: Extra = { name: "Leitura Completa", price_cents: 5000, when: "quem quer ir mais fundo já no começo", opens_reading: true, reading_cards: 5 };
const pergunta: Extra = { name: "Pergunta nova", price_cents: 2700, when: "nova pergunta depois da leitura" };
const extras = [pergunta, completa];
const cfg = { leitura_gratis_so_primeira: true, leitura_completa: "Leitura Completa", indicacao_trabalho_direto: true };
const ela = (body: string) => ({ direction: "inbound", body });
const base = { mensagens: [ela("oi")], extras, jaComprou: false, leituraEmAndamento: false, leituraAnterior: null };

describe("veioPorIndicacao", () => {
  it.each(["a Maria me indicou", "Minha amiga me indicou você", "vim por indicação", "minha prima fez um trabalho com você", "falaram muito bem de você"])(
    "lê indicação: %s",
    (t) => expect(veioPorIndicacao([ela(t)])).toBe(true),
  );
  it.each(["quero uma leitura", "me indica um trabalho?", "minha amiga está sofrendo"])("não lê: %s", (t) =>
    expect(veioPorIndicacao([ela(t)])).toBe(false),
  );
  it("só a fala dela conta", () => expect(veioPorIndicacao([{ direction: "outbound", body: "quem te indicou?" }])).toBe(false));
});

describe("portaDeEntrada", () => {
  it("sem configuração, nada muda", () => expect(portaDeEntrada(undefined, base)).toBeNull());
  it("cliente da casa não passa pela porta", () => expect(portaDeEntrada(cfg, { ...base, jaComprou: true })).toBeNull());
  it("primeira vez: leitura grátis com a completa disponível", () => {
    const p = portaDeEntrada(cfg, base);
    expect(p?.porta).toBe("primeira_leitura");
    expect(liberaOTrabalho(p)).toBe(false);
  });
  it("já teve leitura: vence a indicação e a leitura em andamento", () => {
    const quando = new Date("2026-11-20T15:00:00Z");
    const p = portaDeEntrada(cfg, { ...base, mensagens: [ela("a Ana me indicou")], leituraEmAndamento: true, leituraAnterior: quando });
    expect(p).toEqual({ porta: "ja_teve_leitura", leituraCompleta: completa, quando });
  });
  it("sem a regra da primeira vez, a leitura anterior não conta", () =>
    expect(portaDeEntrada({ ...cfg, leitura_gratis_so_primeira: false }, { ...base, leituraAnterior: new Date() })?.porta).toBe("primeira_leitura"));
  it("indicação libera o trabalho", () => {
    const p = portaDeEntrada(cfg, { ...base, mensagens: [ela("minha irmã me indicou")] });
    expect(p?.porta).toBe("indicacao");
    expect(liberaOTrabalho(p)).toBe(true);
  });
  it("indicação desligada segue a primeira leitura", () =>
    expect(portaDeEntrada({ ...cfg, indicacao_trabalho_direto: false }, { ...base, mensagens: [ela("me indicaram")] })?.porta).toBe("primeira_leitura"));
  it("leitura já começou nesta conversa: a porta sai", () => expect(portaDeEntrada(cfg, { ...base, leituraEmAndamento: true })).toBeNull());
  it("completa com nome que não existe ou que não abre leitura: sem bloco", () => {
    expect(portaDeEntrada({ ...cfg, leitura_completa: "Outra" }, base)).toBeNull();
    expect(portaDeEntrada({ ...cfg, leitura_completa: "Pergunta nova" }, { ...base, extras: [{ ...pergunta, opens_reading: false }] })).toBeNull();
  });
});

describe("blocoDaPortaDeEntrada", () => {
  it("primeira leitura diz um valor só, o da completa, com as cartas", () => {
    const b = blocoDaPortaDeEntrada(portaDeEntrada(cfg, base));
    expect(b).toContain("R$ 50");
    expect(b).toContain("5 cartas");
    expect(b).not.toContain("R$ 27");
  });
  it("já teve leitura: data no fuso e a completa", () => {
    const b = blocoDaPortaDeEntrada({ porta: "ja_teve_leitura", leituraCompleta: completa, quando: new Date("2026-11-20T02:00:00Z") });
    expect(b).toContain("19/11");
    expect(b).toContain("*Leitura Completa*");
  });
  it("sem porta, vazio", () => expect(blocoDaPortaDeEntrada(null)).toBe(""));
});
