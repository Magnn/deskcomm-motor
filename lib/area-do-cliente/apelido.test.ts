import { describe, expect, it } from "vitest";

import { configDaAreaSchema, lerConfigDaArea } from "./config";
import { caminhoPublicoDaArea } from "./vocabulario";

describe("endereço público da área (apelido)", () => {
  it("aceita minúsculas, números e hífen, e normaliza maiúsculas", () => {
    expect(configDaAreaSchema.parse({ ativo: true, apelido: "Cigana-Esmeralda" }).apelido).toBe("cigana-esmeralda");
    expect(configDaAreaSchema.parse({ ativo: true, apelido: "templo2" }).apelido).toBe("templo2");
  });

  it("recusa o que não cabe na URL nem no filtro do banco", () => {
    for (const ruim of ["a", "-cigana", "cigana esmeralda", "cigana/x", "x,slug.eq.outra", "ção"]) {
      expect(configDaAreaSchema.safeParse({ ativo: true, apelido: ruim }).success).toBe(false);
    }
  });

  it("sem apelido, o endereço é o do slug; com apelido, o do apelido", () => {
    expect(caminhoPublicoDaArea("magno")).toBe("/c/magno");
    expect(caminhoPublicoDaArea("magno", "")).toBe("/c/magno");
    expect(caminhoPublicoDaArea("magno", lerConfigDaArea({ area: { ativo: true, apelido: "cigana" } }).apelido)).toBe("/c/cigana");
  });
});
