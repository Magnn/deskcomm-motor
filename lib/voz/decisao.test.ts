import { describe, expect, it } from "vitest";

import { AUDIOS_POR_PEDIDO, deveResponderEmAudio, pediuAudio } from "./decisao";

const aPedido = { mode: "on_request" as const, min_chars_for_voice: 300 };
const longo = "a".repeat(400);

describe("voz só a pedido", () => {
  it("⭐ só fala quem pediu, e no máximo três respostas depois do pedido", () => {
    expect(AUDIOS_POR_PEDIDO).toBe(3);
    expect(deveResponderEmAudio(aPedido, { pessoaMandouAudio: false, texto: "oi", audiosDesdeOPedido: 0 })).toBe(true);
    expect(deveResponderEmAudio(aPedido, { pessoaMandouAudio: false, texto: "oi", audiosDesdeOPedido: 2 })).toBe(true);
    expect(deveResponderEmAudio(aPedido, { pessoaMandouAudio: false, texto: "oi", audiosDesdeOPedido: 3 })).toBe(false);
  });

  it("⭐ mandar áudio não é pedir áudio: sem pedido, a resposta é texto mesmo longa", () => {
    expect(deveResponderEmAudio(aPedido, { pessoaMandouAudio: true, texto: longo, audiosDesdeOPedido: null })).toBe(false);
    expect(deveResponderEmAudio(aPedido, { pessoaMandouAudio: true, texto: longo })).toBe(false);
  });

  it("reconhece o pedido escrito ou falado, e não confunde com outras frases", () => {
    for (const s of ["me manda um áudio", "pode falar em audio?", "responde por áudio", "prefiro áudio", "não sei ler", "Se você me mandar o áudio que eu te pedi", "explica em áudio pra mim"]) {
      expect(pediuAudio(s), s).toBe(true);
    }
    for (const s of ["te mandei um áudio", "ouvi o áudio", "ok", "quero o trabalho", null, ""]) {
      expect(pediuAudio(s), String(s)).toBe(false);
    }
  });

  it("os outros modos seguem como eram", () => {
    expect(deveResponderEmAudio({ mode: "mirror", min_chars_for_voice: 300 }, { pessoaMandouAudio: true, texto: "oi" })).toBe(true);
    expect(deveResponderEmAudio({ mode: "mirror_long", min_chars_for_voice: 300 }, { pessoaMandouAudio: true, texto: "oi" })).toBe(false);
    expect(deveResponderEmAudio({ mode: "moments", min_chars_for_voice: 300 }, { pessoaMandouAudio: false, texto: longo })).toBe(true);
  });
});
