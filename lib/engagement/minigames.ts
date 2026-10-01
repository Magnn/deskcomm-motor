import { z } from "zod";

export const minigameTypeSchema = z.enum(["wheel_of_fortune", "scratchcard"]);
export type MinigameType = z.infer<typeof minigameTypeSchema>;

export const minigamePrizeSchema = z.object({
  id: z.string(),
  label: z.string().min(1, "Nome do prêmio é obrigatório"),
  description: z.string().optional(),
  couponCode: z.string().optional(),
  probabilityWeight: z.number().int().min(0).max(1000).default(10), // peso relativo para sorteio
  color: z.string().default("#3b82f6"),
  isLosingSlot: z.boolean().default(false),
});

export type MinigamePrize = z.infer<typeof minigamePrizeSchema>;

export const minigameCampaignSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(2, "Nome da campanha é obrigatório"),
  type: minigameTypeSchema,
  headline: z.string().default("Gire a Roleta e Ganhe Prêmios!"),
  description: z.string().default("Informe seus dados abaixo para participar e resgatar seu cupom:"),
  prizes: z.array(minigamePrizeSchema).min(2, "Adicione pelo menos 2 opções de prêmios"),
  maxPlaysPerContact: z.number().int().min(1).default(1),
  applyTagsOnWin: z.array(z.string()).default([]),
  syncToCrmDeal: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export type MinigameCampaign = z.infer<typeof minigameCampaignSchema>;

/**
 * Realiza o sorteio ponderado (weighted random selection) de um prêmio de forma segura no backend.
 */
export function drawMinigamePrize(prizes: MinigamePrize[]): MinigamePrize {
  if (!prizes || prizes.length === 0) {
    throw new Error("Nenhum prêmio configurado para o sorteio");
  }

  const totalWeight = prizes.reduce((sum, p) => sum + (p.probabilityWeight || 0), 0);
  if (totalWeight <= 0) {
    // fallback para seleção uniforme se todos tiverem peso 0
    return prizes[Math.floor(Math.random() * prizes.length)]!;
  }

  let randomVal = Math.random() * totalWeight;

  for (const prize of prizes) {
    const weight = prize.probabilityWeight || 0;
    if (randomVal < weight) {
      return prize;
    }
    randomVal -= weight;
  }

  return prizes[prizes.length - 1]!;
}

const FULL_TURN_DEG = 360;

export function normalizeDeg(deg: number): number {
  return ((deg % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG;
}

/**
 * Calcula a rotação necessária em graus para o disco da roleta parar
 * exatamente no segmento sorteado, sempre girando no sentido horário.
 */
export function computeLuckyWheelTargetRotationDeg(
  currentRotationDeg: number,
  segmentCount: number,
  targetSegmentIndex: number,
  extraFullSpins = 5,
  jitterDeg = 0
): number {
  if (segmentCount <= 0) return currentRotationDeg;
  const sweep = FULL_TURN_DEG / segmentCount;
  const targetCenterDeg = targetSegmentIndex * sweep;
  const desiredFinalMod = normalizeDeg(FULL_TURN_DEG - targetCenterDeg + jitterDeg);
  const currentMod = normalizeDeg(currentRotationDeg);
  const forwardDelta = normalizeDeg(desiredFinalMod - currentMod);
  return currentRotationDeg + forwardDelta + extraFullSpins * FULL_TURN_DEG;
}
