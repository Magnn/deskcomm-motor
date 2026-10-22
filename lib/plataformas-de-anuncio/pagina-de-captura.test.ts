import { describe, expect, it } from "vitest";

describe("modeloComFrase", () => {
  it("troca o texto pela frase da página e mantém o ref", async () => {
    const { modeloComFrase } = await import("./pagina-de-captura");
    const modelo = "Olá! Quero fazer minha leitura de tarot 🔮 [ref:{token}]";
    expect(modeloComFrase(modelo, "Quero fazer uma pergunta às cartas por R$ 5")).toBe("Quero fazer uma pergunta às cartas por R$ 5 [ref:{token}]");
    expect(modeloComFrase(modelo, null)).toBe(modelo);
    expect(modeloComFrase(modelo, "<script>x</script>")).toBe(modelo);
    expect(modeloComFrase(modelo, "a".repeat(90))).toBe(modelo);
  });
});
