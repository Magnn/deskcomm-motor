"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { PacingKnobs } from "@/lib/agent-engine/pacing/defaults";
import type { ChannelKnobsRow, PacingKnobsUpdate } from "@/lib/ai/pacing-knobs";

export interface PacingSessionLite {
  id: string;
  waha_session_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  status: string | null;
  daily_message_limit: number | null;
}

/** Estado do aquecimento, já calculado no servidor (a tela não recalcula a regra). */
export interface PacingWarmupView {
  number_activated_at: string | null;
  age_days: number;
  skipped: boolean;
  /** Teto de HOJE pelo aquecimento; null = sem teto (número formado ou aquecimento pulado). */
  cap_today: number | null;
}

/** Orçamento de leads novos por dia que o rodízio manda ao número (migration 0963). */
export interface PacingLeadsView {
  mode: "sem_limite" | "rampa" | "fixo" | "personalizado";
  steps: { minAgeDays: number; cap: number | null }[] | null;
  /** Leads novos de HOJE pelo orçamento; null = sem orçamento. */
  cap_today: number | null;
}

/** O que o número já fez hoje. null = leitura falhou (a ficha segue editável). */
export interface PacingTodayView {
  leads_today: number;
  leads_on_the_way: number;
  sent_today: number;
  initiated_today: number;
  sent_last_hour: number;
  /** Maior número de mensagens numa hora, nas últimas 24 h. */
  peak_hour_24h: number;
}

/** Nota de saúde do número e o efeito dela no rodízio. null = leitura falhou. */
export interface PacingHealthView {
  score: number;
  /** "descansa" = fora do rodízio enquanto outro tiver vaga; "metade" = metade do orçamento. */
  rotation: "inteiro" | "metade" | "descansa" | "bloqueado";
  /** Código da Meta que tirou o número do rodízio ("bloqueado"), ou null. */
  block_code: string | null;
  drops_72h: number;
  failed_24h: number;
  sent_24h: number;
  leads_72h: number;
  gone_leads_72h: number;
}

export interface PacingKnobsItem {
  channel_session: PacingSessionLite;
  effective: PacingKnobs;
  warmup: PacingWarmupView;
  leads: PacingLeadsView;
  today: PacingTodayView | null;
  health: PacingHealthView | null;
  overrides: ChannelKnobsRow | null;
  defaults: PacingKnobs;
  bounds: {
    intervalMaxMs: number;
    hourLastStart: number;
    hourEnd: number;
    perHourMax: number;
    leadsPerDayMax: number;
    daily_limit: { min: number; max: number };
  };
}

/** Knobs anti-ban por conexão (Operação Visível F2ii) — GET /api/v1/ai/pacing. */
export function usePacingKnobs(enabled = true) {
  return useQuery({
    queryKey: ["pacing-knobs"],
    enabled,
    queryFn: () =>
      apiClient.get<{ data: { items: PacingKnobsItem[] } }>("/api/v1/ai/pacing").then((r) => r.data),
  });
}

export function useUpdatePacingKnobs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PacingKnobsUpdate) => apiClient.put("/api/v1/ai/pacing", body),
    onSettled: () => qc.invalidateQueries({ queryKey: ["pacing-knobs"] }),
  });
}
