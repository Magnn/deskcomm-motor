"use client";

import { createContext, useContext } from "react";

/**
 * O `trigger_config` REAL do fluxo, para o card do gatilho. Antes o card lia o
 * provedor, o evento e a palavra-chave do `localStorage` do navegador — dado que o
 * motor nunca viu e que outro navegador não tem.
 */
const GatilhoDoFluxoContext = createContext<Record<string, unknown> | null>(null);

export const GatilhoDoFluxoProvider = GatilhoDoFluxoContext.Provider;

export function useGatilhoDoFluxo(): Record<string, unknown> | null {
  return useContext(GatilhoDoFluxoContext);
}
