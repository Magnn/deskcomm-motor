import { describe, expect, it } from "vitest";

import { conferirMetas, type ConjuntoAtivo } from "./conferencia-de-meta";

const campanhas = [
  { id: "c-vendas", nome: "VENDAS | TESTE", objetivo: "OUTCOME_SALES" },
  { id: "c-trafego", nome: "TRAFEGO", objetivo: "OUTCOME_TRAFFIC" },
];
const conjunto = (p: Partial<ConjuntoAtivo>): ConjuntoAtivo => ({
  id: "s1",
  nome: "Conjunto",
  campanhaId: "c-vendas",
  meta: "MESSAGING_PURCHASE_CONVERSION",
  destino: "WHATSAPP",
  ...p,
});

describe("conferirMetas", () => {
  it("aponta conjunto de vendas no WhatsApp otimizando para conversas", () => {
    expect(conferirMetas([conjunto({ meta: "CONVERSATIONS" })], campanhas)).toEqual([
      { conjuntoId: "s1", conjunto: "Conjunto", campanha: "VENDAS | TESTE", meta: "CONVERSATIONS" },
    ]);
  });

  it("passa quem otimiza para compra por mensagem ou conversão", () => {
    expect(conferirMetas([conjunto({}), conjunto({ id: "s2", meta: "OFFSITE_CONVERSIONS" })], campanhas)).toEqual([]);
  });

  it("não julga campanha de outro objetivo, destino site, nem conjunto sem campanha conhecida", () => {
    expect(
      conferirMetas(
        [
          conjunto({ campanhaId: "c-trafego", meta: "CONVERSATIONS" }),
          conjunto({ id: "s2", destino: "WEBSITE", meta: "LINK_CLICKS" }),
          conjunto({ id: "s3", campanhaId: "outra", meta: "CONVERSATIONS" }),
        ],
        campanhas,
      ),
    ).toEqual([]);
  });
});
