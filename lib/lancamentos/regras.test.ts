import { describe, expect, it } from "vitest";

import {
  grupoComVaga,
  linkDoConvite,
  nomeDoGrupo,
  precisaAbrirOutroGrupo,
  slugDoNome,
  statusPelaContagem,
  telefoneSoDigitos,
  temVaga,
  type GrupoParaVaga,
} from "./regras";

const g = (position: number, membersCount: number, mudancas: Partial<GrupoParaVaga> = {}): GrupoParaVaga => ({
  id: `g${position}`,
  position,
  status: "open",
  membersCount,
  inviteUrl: `https://chat.whatsapp.com/convite${position}`,
  ...mudancas,
});

describe("para onde o link manda a próxima pessoa", () => {
  it("o grupo aberto MAIS ANTIGO com vaga — enche um antes de começar o outro", () => {
    expect(grupoComVaga([g(2, 0), g(1, 500)], 900)?.id).toBe("g1");
  });

  it("grupo lotado, fechado ou sem convite é pulado", () => {
    expect(grupoComVaga([g(1, 900), g(2, 10)], 900)?.id).toBe("g2");
    expect(grupoComVaga([g(1, 10, { status: "closed" }), g(2, 10)], 900)?.id).toBe("g2");
    expect(grupoComVaga([g(1, 10, { status: "full" }), g(2, 10)], 900)?.id).toBe("g2");
    expect(grupoComVaga([g(1, 10, { inviteUrl: null }), g(2, 10)], 900)?.id).toBe("g2");
  });

  it("nenhum com vaga: null, e quem chama abre um grupo", () => {
    expect(grupoComVaga([g(1, 900), g(2, 950)], 900)).toBeNull();
    expect(grupoComVaga([], 900)).toBeNull();
    expect(temVaga(g(1, 899), 900)).toBe(true);
    expect(temVaga(g(1, 900), 900)).toBe(false);
  });
});

describe("quando abrir o próximo grupo", () => {
  it("⭐ ANTES de lotar: com 20 vagas ou menos no total, já abre", () => {
    expect(precisaAbrirOutroGrupo([g(1, 879)], 900)).toBe(false); // 21 vagas
    expect(precisaAbrirOutroGrupo([g(1, 880)], 900)).toBe(true); // 20 vagas
    expect(precisaAbrirOutroGrupo([g(1, 900)], 900)).toBe(true);
  });

  it("se o próximo já existe e tem vaga, NÃO abre um terceiro", () => {
    expect(precisaAbrirOutroGrupo([g(1, 895), g(2, 0)], 900)).toBe(false);
  });

  it("lançamento sem grupo nenhum precisa do primeiro", () => {
    expect(precisaAbrirOutroGrupo([], 900)).toBe(true);
  });

  it("lotação pequena não abre grupo a cada pessoa: a folga é no máximo metade da lotação", () => {
    expect(precisaAbrirOutroGrupo([g(1, 4)], 10)).toBe(false); // 6 vagas, folga 5
    expect(precisaAbrirOutroGrupo([g(1, 5)], 10)).toBe(true); // 5 vagas
    expect(precisaAbrirOutroGrupo([g(1, 0)], 2)).toBe(false); // 2 vagas, folga 1
  });
});

describe("o estado que a contagem impõe", () => {
  it("lotou vira full; esvaziou volta a open; fechado à mão não muda", () => {
    expect(statusPelaContagem("open", 900, 900)).toBe("full");
    expect(statusPelaContagem("full", 850, 900)).toBe("open");
    expect(statusPelaContagem("open", 10, 900)).toBe("open");
    expect(statusPelaContagem("closed", 10, 900)).toBe("closed");
    expect(statusPelaContagem("closed", 1000, 900)).toBe("closed");
  });
});

describe("o nome do grupo", () => {
  it("{n} e #{n} viram o número", () => {
    expect(nomeDoGrupo("Lançamento VIP #{n}", 3)).toBe("Lançamento VIP #3");
    expect(nomeDoGrupo("Turma {n} — Aulão", 12)).toBe("Turma 12 — Aulão");
  });

  it("modelo sem a marca ganha o número no fim — dois grupos com o mesmo nome são indistinguíveis", () => {
    expect(nomeDoGrupo("Aulão ao vivo", 2)).toBe("Aulão ao vivo #2");
  });

  it("nome longo é cortado SEM perder o número", () => {
    const nome = nomeDoGrupo("x".repeat(200), 47);
    expect(nome).toHaveLength(100);
    expect(nome.endsWith(" #47")).toBe(true);
  });

  it("chamadas seguidas dão o mesmo resultado (a expressão regular não guarda estado)", () => {
    expect(nomeDoGrupo("G {n}", 1)).toBe("G 1");
    expect(nomeDoGrupo("G {n}", 2)).toBe("G 2");
    expect(nomeDoGrupo("G {n}", 3)).toBe("G 3");
  });
});

describe("apoios", () => {
  it("slug do nome: minúsculas, sem acento, com hífen", () => {
    expect(slugDoNome("Lançamento Açaí & Cia — 2026!")).toBe("lancamento-acai-cia-2026");
    expect(slugDoNome("!!!")).toBe("");
  });

  it("telefone: só dígitos com DDI; o que não é telefone é recusado", () => {
    expect(telefoneSoDigitos("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(telefoneSoDigitos("123")).toBeNull();
    expect(telefoneSoDigitos("não é número")).toBeNull();
  });

  it("link do convite a partir do código — e só de um código com cara de código", () => {
    expect(linkDoConvite("AbCdEf123456ghIJKL")).toBe("https://chat.whatsapp.com/AbCdEf123456ghIJKL");
    expect(linkDoConvite("https://chat.whatsapp.com/AbCdEf123456ghIJKL")).toBe("https://chat.whatsapp.com/AbCdEf123456ghIJKL");
    expect(linkDoConvite("javascript:alert(1)")).toBeNull();
    expect(linkDoConvite("")).toBeNull();
  });
});
