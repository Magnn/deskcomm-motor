import { describe, expect, it } from "vitest";

import { emitirEstado as emitirDoGoogle, verificarEstado as verificarDoGoogle } from "../google/estado";
import { contaPadraoDepoisDeConectar, emitirEstado, urlDeAutorizacao, verificarEstado } from "./login";

const SEGREDO = "um-segredo-interno-bem-longo-0123456789";
const agora = new Date("2026-10-04T12:00:00Z");

describe("login do Facebook para o Meta Ads", () => {
  it("sem configuração do login para empresas, pede só ads_read", () => {
    const u = new URL(urlDeAutorizacao({ appId: "app1", redirectUri: "https://x/volta", state: "s", configId: null }));
    expect(u.searchParams.get("scope")).toBe("ads_read");
    expect(u.searchParams.get("config_id")).toBeNull();
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/volta");
  });

  it("com configuração, manda o config_id e não a lista", () => {
    const u = new URL(urlDeAutorizacao({ appId: "app1", redirectUri: "https://x/volta", state: "s", configId: "cfg9" }));
    expect(u.searchParams.get("config_id")).toBe("cfg9");
    expect(u.searchParams.get("scope")).toBeNull();
  });

  it("ida e volta do state carregam organização e pessoa", () => {
    const s = emitirEstado({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    expect(verificarEstado(s, { segredo: SEGREDO, agora })).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it("o state do Google Ads não abre a volta da Meta, nem o contrário", () => {
    const daMeta = emitirEstado({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    const doGoogle = emitirDoGoogle({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    expect(verificarDoGoogle(daMeta, { segredo: SEGREDO, agora })).toBeNull();
    expect(verificarEstado(doGoogle, { segredo: SEGREDO, agora })).toBeNull();
  });

  it("segredo curto continua recusado — o sufixo não o torna longo", () => {
    expect(() => emitirEstado({ organizationId: "o", userId: "u" }, { segredo: "curto", agora })).toThrow();
  });
});

describe("conta padrão depois de conectar", () => {
  const ativa = (id: string) => ({ id, status: 1 });
  const parada = (id: string) => ({ id, status: 2 });

  it("uma conta ativa só: já fica escolhida", () => {
    expect(contaPadraoDepoisDeConectar([ativa("act_1"), parada("act_2")], null)).toBe("act_1");
  });

  it("mais de uma ativa: quem escolhe é a pessoa", () => {
    expect(contaPadraoDepoisDeConectar([ativa("act_1"), ativa("act_2")], null)).toBeNull();
  });

  it("mantém a escolha anterior enquanto o novo login a alcança", () => {
    expect(contaPadraoDepoisDeConectar([ativa("act_1"), ativa("act_2")], "act_2")).toBe("act_2");
  });

  it("escolha anterior fora do alcance é trocada, não mantida", () => {
    expect(contaPadraoDepoisDeConectar([ativa("act_1")], "act_9")).toBe("act_1");
    expect(contaPadraoDepoisDeConectar([ativa("act_1"), ativa("act_2")], "act_9")).toBeNull();
  });

  it("única conta, mesmo parada, é a que a tela abre — é ela que explica o problema", () => {
    expect(contaPadraoDepoisDeConectar([parada("act_1")], null)).toBe("act_1");
  });

  it("sem conta nenhuma, nada é escolhido", () => {
    expect(contaPadraoDepoisDeConectar([], "act_1")).toBeNull();
  });
});
