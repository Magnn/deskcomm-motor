import { describe, expect, it } from "vitest";

import { lerCatalogoDeclarado, planoPorId, PLANOS_PADRAO, precoLegivel } from "./catalogo";

describe("catálogo padrão", () => {
  it("três planos, do menor para o maior, cada um liberando mais números", () => {
    expect(PLANOS_PADRAO.map((p) => p.id)).toEqual(["start", "pro", "scale"]);
    const numeros = PLANOS_PADRAO.map((p) => p.numeros);
    const precos = PLANOS_PADRAO.map((p) => p.precoMensalCentavos);
    expect([...numeros].sort((a, b) => a - b)).toEqual(numeros);
    expect([...precos].sort((a, b) => a - b)).toEqual(precos);
    expect(numeros[0]).toBeGreaterThanOrEqual(1);
  });

  it("plano por id; id desconhecido ou vazio não inventa plano", () => {
    expect(planoPorId(PLANOS_PADRAO, "pro")?.nome).toBe("Pro");
    expect(planoPorId(PLANOS_PADRAO, "enterprise")).toBeNull();
    expect(planoPorId(PLANOS_PADRAO, null)).toBeNull();
    expect(planoPorId(PLANOS_PADRAO, "")).toBeNull();
  });
});

describe("catálogo declarado no .env", () => {
  it("lê id:Nome:centavos:números, com espaços e vírgula sobrando", () => {
    expect(lerCatalogoDeclarado(" basico:Básico:4990:1 , full:Plano Full:29900:20, ")).toEqual([
      // Sem o 5º campo e sem plano padrão de mesmo id: o plano não inclui IA da plataforma.
      { id: "basico", nome: "Básico", precoMensalCentavos: 4990, numeros: 1, iaMensalCentavosUsd: 0, conversasMensais: 0 },
      { id: "full", nome: "Plano Full", precoMensalCentavos: 29900, numeros: 20, iaMensalCentavosUsd: 0, conversasMensais: 0 },
    ]);
  });

  it("o 5º campo é a IA do mês em centavos de dólar; ausente, herda do plano padrão de mesmo id", () => {
    expect(lerCatalogoDeclarado("start:Start:9700:1:800,pro:Pro:19700:3")).toEqual([
      { id: "start", nome: "Start", precoMensalCentavos: 9700, numeros: 1, iaMensalCentavosUsd: 800, conversasMensais: 0 },
      { id: "pro", nome: "Pro", precoMensalCentavos: 19700, numeros: 3, iaMensalCentavosUsd: 1200, conversasMensais: 0 },
    ]);
  });

  it("o 6º campo é a franquia de conversas do mês", () => {
    expect(lerCatalogoDeclarado("start:Start:29700:1:9000:300,pro:Pro:69700:3:30000")).toEqual([
      { id: "start", nome: "Start", precoMensalCentavos: 29700, numeros: 1, iaMensalCentavosUsd: 9000, conversasMensais: 300 },
      { id: "pro", nome: "Pro", precoMensalCentavos: 69700, numeros: 3, iaMensalCentavosUsd: 30000, conversasMensais: 0 },
    ]);
  });

  it("vazio = não declarado", () => {
    expect(lerCatalogoDeclarado("")).toBeNull();
    expect(lerCatalogoDeclarado(" , ")).toBeNull();
  });

  it.each([
    ["falta campo", "start:Start:9700"],
    ["preço que não é número", "start:Start:97,00:1"],
    ["números que não é inteiro", "start:Start:9700:muitos"],
    ["id com maiúscula ou espaço", "Meu Plano:Start:9700:1"],
    ["id repetido", "start:Start:9700:1,start:Outro:100:2"],
    ["um item bom e um ruim", "start:Start:9700:1,pro:Pro"],
    ["IA que não é número", "start:Start:9700:1:muita"],
    ["franquia que não é número", "start:Start:9700:1:500:x"],
    ["campo sobrando depois da franquia", "start:Start:9700:1:500:300:x"],
  ])("malformado (%s): o catálogo INTEIRO é recusado — nunca meio catálogo", (_caso, declarado) => {
    expect(lerCatalogoDeclarado(declarado)).toBeNull();
  });
});

describe("preço como a pessoa lê", () => {
  it("sem centavos, com centavos e com milhar", () => {
    expect(precoLegivel(9_700)).toBe("R$ 97");
    expect(precoLegivel(9_750)).toBe("R$ 97,50");
    expect(precoLegivel(9_705)).toBe("R$ 97,05");
    expect(precoLegivel(199_700)).toBe("R$ 1.997");
    expect(precoLegivel(0)).toBe("R$ 0");
  });
});
