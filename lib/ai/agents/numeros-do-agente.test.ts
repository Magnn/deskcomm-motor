import { describe, expect, it } from "vitest";

import { numerosDoAgente, sqlAtendeNumero, sqlNumeroExtra, sqlOrdemDoNumero } from "./numeros-do-agente";

describe("numerosDoAgente", () => {
  it("principal mais extras, sem repetir", () => {
    expect(numerosDoAgente("a", ["b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
  it("sem principal (rascunho sem número) ainda atende os extras", () => {
    expect(numerosDoAgente(null, ["b"])).toEqual(["b"]);
  });
  it("sem extras é só o principal — o comportamento de antes da 0962", () => {
    expect(numerosDoAgente("a", undefined)).toEqual(["a"]);
  });
});

describe("predicados SQL", () => {
  it("o extra é procurado na organização do próprio agente", () => {
    const sql = sqlNumeroExtra("a", "$2");
    expect(sql).toContain("an.organization_id = a.organization_id");
    expect(sql).toContain("an.agent_id = a.id");
    expect(sql).toContain("an.channel_session_id = $2");
  });
  it("atende = principal OU extra", () => {
    expect(sqlAtendeNumero("a", "v", "$2")).toMatch(/^\(v\.channel_session_id = \$2 or exists \(/);
  });
  it("o dono principal vem antes no desempate", () => {
    expect(sqlOrdemDoNumero("v", "$2")).toBe("(v.channel_session_id is not distinct from $2) desc");
  });
});
