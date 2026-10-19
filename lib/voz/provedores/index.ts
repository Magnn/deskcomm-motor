import type { IdDeProvedorDeVoz } from "../tipos";
import { elevenlabsVoz } from "./elevenlabs";
import { openaiVoz } from "./openai";
import { servidorVoz } from "./servidor";
import type { ImplementacaoDeVoz } from "./tipos";

const REGISTRO: Record<IdDeProvedorDeVoz, ImplementacaoDeVoz> = {
  openai: openaiVoz,
  elevenlabs: elevenlabsVoz,
  servidor: servidorVoz,
};

export function implementacaoDeVoz(id: IdDeProvedorDeVoz): ImplementacaoDeVoz {
  return REGISTRO[id];
}
