import type { IdDeProvedorDeVoz } from "../tipos";
import { elevenlabsVoz } from "./elevenlabs";
import { openaiVoz } from "./openai";
import type { ImplementacaoDeVoz } from "./tipos";

const REGISTRO: Record<IdDeProvedorDeVoz, ImplementacaoDeVoz> = {
  openai: openaiVoz,
  elevenlabs: elevenlabsVoz,
};

export function implementacaoDeVoz(id: IdDeProvedorDeVoz): ImplementacaoDeVoz {
  return REGISTRO[id];
}
