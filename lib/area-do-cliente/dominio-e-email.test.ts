import { describe, expect, it } from "vitest";

import { configDaAreaSchema, lerConfigDaArea } from "./config";
import { emailDoCodigoDaArea } from "./email-da-area";
import { origemDaArea } from "./vocabulario";

describe("domínio próprio da área", () => {
  it("aceita só a origem em https e normaliza maiúsculas e barra final", () => {
    expect(configDaAreaSchema.parse({ ativo: true, dominio: "https://MeuMisterio.com/" }).dominio).toBe("https://meumisterio.com");
    expect(configDaAreaSchema.parse({ ativo: true, dominio: "https://app.meu-misterio.com.br" }).dominio).toBe("https://app.meu-misterio.com.br");
  });

  it("recusa http, caminho, porta, espaço e coisa que não é domínio", () => {
    for (const ruim of ["http://meumisterio.com", "https://meumisterio.com/c/x", "https://meumisterio.com:8443", "meumisterio.com", "https://localhost", "https://meu misterio.com", "javascript:alert(1)"]) {
      expect(configDaAreaSchema.safeParse({ ativo: true, dominio: ruim }).success, ruim).toBe(false);
    }
  });

  it("com domínio, os links saem dele; sem domínio (ou inválido no banco), saem da instalação", () => {
    expect(origemDaArea("https://meumisterio.com", "https://acassia.tech")).toBe("https://meumisterio.com");
    expect(origemDaArea(undefined, "https://acassia.tech/")).toBe("https://acassia.tech");
    expect(origemDaArea("", "https://acassia.tech")).toBe("https://acassia.tech");
    // Config antiga ou editada à mão no banco: nunca vira link quebrado.
    expect(origemDaArea("meumisterio.com", "https://acassia.tech")).toBe("https://acassia.tech");
  });

  it("config inválida no banco desliga a área, e não derruba a leitura", () => {
    expect(lerConfigDaArea({ area: { ativo: true, dominio: "ftp://x" } }).ativo).toBe(false);
  });
});

describe("e-mail do código com a marca da área", () => {
  it("usa o título da área no remetente, no assunto e no corpo, com a guia na assinatura", () => {
    const m = emailDoCodigoDaArea({ codigo: "123456", validadeMin: 10, titulo: "Meu Mistério", marcaDaOrganizacao: "Magno Ltda", guia: "Cigana Esmeralda" });
    expect(m.fromName).toBe("Meu Mistério");
    expect(m.subject).toBe("123456 é o seu código · Meu Mistério");
    expect(m.text).toContain("Meu Mistério · com Cigana Esmeralda");
    expect(m.html).toContain("Meu Mistério");
    expect(m.html).not.toContain("Magno Ltda");
  });

  it("sem título, vale a marca da organização", () => {
    const m = emailDoCodigoDaArea({ codigo: "654321", validadeMin: 10, titulo: "  ", marcaDaOrganizacao: "Templo" });
    expect(m.fromName).toBe("Templo");
    expect(m.text).not.toContain("com ");
  });

  it("não deixa HTML entrar pelo título", () => {
    const m = emailDoCodigoDaArea({ codigo: "111111", validadeMin: 10, titulo: "<b>X</b>", marcaDaOrganizacao: "Y" });
    expect(m.html).not.toContain("<b>X</b>");
  });
});
