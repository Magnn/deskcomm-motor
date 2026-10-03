import { describe, expect, it } from "vitest";

import { emitirEstado as emitirDoInstagram, verificarEstado as verificarDoInstagram } from "../instagram/estado";
import { emitirEstado, verificarEstado } from "./estado";

const SEGREDO = "um-segredo-interno-bem-longo-0123456789";
const agora = new Date("2026-10-03T12:00:00Z");

describe("state do login do Facebook (Messenger)", () => {
  it("ida e volta carregam organização e pessoa", () => {
    const s = emitirEstado({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    expect(verificarEstado(s, { segredo: SEGREDO, agora })).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it("o state de um recurso não abre a volta do outro", () => {
    const doMessenger = emitirEstado({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    const doInstagram = emitirDoInstagram({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    expect(verificarDoInstagram(doMessenger, { segredo: SEGREDO, agora })).toBeNull();
    expect(verificarEstado(doInstagram, { segredo: SEGREDO, agora })).toBeNull();
  });

  it("vence em 10 minutos", () => {
    const s = emitirEstado({ organizationId: "org-1", userId: "user-1" }, { segredo: SEGREDO, agora });
    expect(verificarEstado(s, { segredo: SEGREDO, agora: new Date(agora.getTime() + 11 * 60_000) })).toBeNull();
  });

  it("segredo curto continua recusado — o sufixo não o torna longo", () => {
    expect(() => emitirEstado({ organizationId: "o", userId: "u" }, { segredo: "curto", agora })).toThrow();
  });
});
