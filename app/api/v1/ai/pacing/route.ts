import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * Épico Operação Visível (F2ii) — knobs do anti-ban por conexão.
 *
 * GET  → todas as conexões da org com knobs efetivos (override sobre default),
 *        overrides crus, defaults e bounds (a tela explica sem cravar números).
 * PUT  → upsert de channel_knobs para UMA conexão + teto diário em
 *        channel_sessions.daily_message_limit (fonte única — regra dura nº 3).
 *        Campo null = volta ao default conservador do engine.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { traduzir } from "@/lib/i18n/dicionario";
import { PROVIDERS_DE_MENSAGEM } from "@/lib/channels/capabilities";
import {
  pacingKnobsUpdateSchema,
  knobsView,
  effectiveKnobs,
  windowIsValid,
  WARMUP_PULADO,
  degrausDoOrcamento,
  type ChannelKnobsRow,
} from "@/lib/ai/pacing-knobs";
import { lerEstadoDoPacing } from "@/lib/agent-engine/pacing/ledger-supabase";
import { cargaDosNumeros } from "@/lib/plataformas-de-anuncio/rodizio-de-numeros";
import { fatorDaNota, saudeDosNumeros, type SaudeDoNumero } from "@/lib/plataformas-de-anuncio/saude-do-numero";

export const dynamic = "force-dynamic";

const KNOB_COLUMNS =
  "throttle_ms, jitter_max_ms, window_start_hour, window_end_hour, allow_sunday, timezone, warmup_daily_caps, number_activated_at, max_per_hour, lead_daily_caps";

/**
 * O que o número fez HOJE, ao lado do que foi configurado: sem isto o operador põe
 * "24 leads/dia" e não tem como ver se o rodízio está respeitando. Falha de leitura
 * vira `null` — é exibição, não derruba a ficha.
 */
async function usoDeHoje(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  sessoes: { id: string; phone_number: string | null }[],
  timezoneDe: (sessionId: string) => string,
) {
  const agora = new Date();
  const uso = new Map<string, {
    leads_today: number;
    leads_on_the_way: number;
    sent_today: number;
    initiated_today: number;
    sent_last_hour: number;
    peak_hour_24h: number;
  } | null>();
  const saude = new Map<string, SaudeDoNumero>();
  try {
    const [carga, notas] = await Promise.all([
      cargaDosNumeros(
        admin,
        orgId,
        sessoes.map((s) => ({ sessionId: s.id, telefone: (s.phone_number ?? "").replace(/[^0-9]/g, "") })),
        agora,
      ),
      saudeDosNumeros(admin, orgId, sessoes.map((s) => s.id), agora),
    ]);
    for (const [id, n] of notas) saude.set(id, n);
    await Promise.all(
      sessoes.map(async (s) => {
        const estado = await lerEstadoDoPacing(admin, orgId, s.id, { agora, timezone: timezoneDe(s.id) });
        const c = carga.get(s.id);
        uso.set(s.id, {
          leads_today: c?.leadsHoje ?? 0,
          leads_on_the_way: c?.aCaminho ?? 0,
          sent_today: estado.sentToday,
          initiated_today: estado.initiatedToday ?? estado.sentToday,
          sent_last_hour: estado.sentLastHour ?? 0,
          peak_hour_24h: saude.get(s.id)?.picoPorHora24h ?? 0,
        });
      }),
    );
  } catch {
    // Exibição: sem os números a ficha continua editável.
  }
  return { uso, saude };
}

/** A nota de saúde como a tela mostra: a mesma régua que o rodízio usa (`fatorDaNota`). */
function saudeView(s: SaudeDoNumero | undefined) {
  if (!s) return null;
  const fator = fatorDaNota(s.nota);
  return {
    score: s.nota,
    rotation: s.bloqueio
      ? ("bloqueado" as const)
      : fator === 0
        ? ("descansa" as const)
        : fator < 1
          ? ("metade" as const)
          : ("inteiro" as const),
    block_code: s.bloqueio,
    drops_72h: s.quedas72h,
    failed_24h: s.falhas24h,
    sent_24h: s.enviadas24h,
    leads_72h: s.leads72h,
    gone_leads_72h: s.leadsSumidos72h,
  };
}

/**
 * `organizations.timezone`, para a tela mostrar o fuso em que o motor avalia a
 * janela de quem não escolheu um no número (`fusoDaJanela`). Falha vira `null`
 * e a tela cai no padrão — é exibição, não pode derrubar a ficha.
 */
async function lerFusoDaOrganizacao(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
): Promise<string | null> {
  const { data } = await admin.from("organizations").select("timezone").eq("id", orgId).maybeSingle();
  return (data as { timezone?: string | null } | null)?.timezone ?? null;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "channel_knobs" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { org } = authz;

  const admin = createAdminClient();
  const [{ data: sessions, error: sErr }, { data: knobs, error: kErr }, fusoDaOrg] = await Promise.all([
    admin
      .from("channel_sessions")
      .select("id, waha_session_name, display_name, phone_number, status, daily_message_limit")
      .eq("organization_id", org.orgId)
      // Canal arquivado foi excluído pelo usuário: não volta como opção aqui.
      .is("archived_at", null)
      // Ritmo de envio é regra de canal de MENSAGEM. A linha de chamada de voz
      // (spec 18) não dispara nada e não tem intervalo a calibrar.
      .in("provider", [...PROVIDERS_DE_MENSAGEM])
      .order("created_at", { ascending: true }),
    admin
      .from("channel_knobs")
      .select(`channel_session_id, ${KNOB_COLUMNS}`)
      .eq("organization_id", org.orgId),
    lerFusoDaOrganizacao(admin, org.orgId),
  ]);
  if (sErr || kErr) {
    return fail("internal_error", t("Falha ao carregar conexões/knobs."), 500, { requestId });
  }

  const byuSession = new Map<string, ChannelKnobsRow>(
    (knobs ?? []).map((k) => [k.channel_session_id as string, k as unknown as ChannelKnobsRow]),
  );
  const views = new Map(
    (sessions ?? []).map((s) => [s.id, knobsView(byuSession.get(s.id) ?? null, new Date(), fusoDaOrg)]),
  );
  const { uso, saude } = await usoDeHoje(
    admin,
    org.orgId,
    (sessions ?? []) as { id: string; phone_number: string | null }[],
    (id) => views.get(id)?.effective.timezone ?? "America/Sao_Paulo",
  );
  const items = (sessions ?? []).map((s) => ({
    channel_session: s,
    ...views.get(s.id)!,
    today: uso.get(s.id) ?? null,
    health: saudeView(saude.get(s.id)),
  }));
  return ok({ items }, { requestId });
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "channel_knobs" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user: authUser, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = pacingKnobsUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }
  const {
    channel_session_id,
    daily_message_limit,
    skip_warmup,
    number_activated_at,
    lead_daily_cap,
    ...camposDiretos
  } = parsed.data;
  // `skip_warmup` é pergunta da TELA; a coluna guarda a forma que o motor lê.
  // A tradução mora aqui, num lugar só: a tela não deveria precisar conhecer o
  // formato dos degraus para dizer "este número já está aquecido".
  const knobFields = {
    ...camposDiretos,
    // `null` na data é "não estou declarando", NUNCA "grave nulo": esta é a
    // única coluna `not null` da tabela, e um null explícito ANULA o
    // `default now()` em vez de cair nele — 23502, e a ficha inteira deixava de
    // salvar para quem nunca informou a data (toda instalação nova). Omitindo,
    // a linha nova nasce com `now()` (idade 0 — o "recém-criado" que a tela
    // promete) e a linha existente preserva a data que já tem, em vez de
    // rejuvenescer o número em silêncio de volta ao teto de 20 envios/dia.
    ...(number_activated_at != null ? { number_activated_at } : {}),
    ...(skip_warmup !== undefined
      ? { warmup_daily_caps: skip_warmup ? [...WARMUP_PULADO] : null }
      : {}),
    // Mesma ideia do `skip_warmup`: a tela escolhe "24 por dia" ou "rampa"; a coluna
    // guarda os degraus que o rodízio lê.
    ...(lead_daily_cap !== undefined ? { lead_daily_caps: degrausDoOrcamento(lead_daily_cap) } : {}),
  };

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("channel_sessions")
    .select("id")
    .eq("id", channel_session_id)
    .eq("organization_id", org.orgId)
    // O MESMO filtro do GET, e não por simetria: sem ele a tela sumia com a
    // conexão excluída e a rota continuava aceitando gravar knobs e teto diário
    // nela — configuração viva pendurada num canal que não envia mais, à espera
    // de confundir quem investigar o próximo envio que não saiu.
    .is("archived_at", null)
    .maybeSingle();
  if (!session) {
    return fail("session_not_found", t("Conexão não encontrada nesta organização."), 404, {
      requestId,
    });
  }

  // Valida a JANELA RESULTANTE (enviado sobre o estado atual): update parcial
  // não pode deixar start >= end no efetivo.
  const { data: currentRow } = await admin
    .from("channel_knobs")
    .select(KNOB_COLUMNS)
    .eq("organization_id", org.orgId)
    .eq("channel_session_id", channel_session_id)
    .maybeSingle();
  const merged: ChannelKnobsRow = {
    ...((currentRow as unknown as ChannelKnobsRow) ?? {
      throttle_ms: null,
      jitter_max_ms: null,
      window_start_hour: null,
      window_end_hour: null,
      allow_sunday: null,
      timezone: null,
      warmup_daily_caps: null,
    }),
    ...knobFields,
  };
  const eff = effectiveKnobs(merged);
  if (!windowIsValid(eff.windowStartHour, eff.windowEndHour)) {
    return fail(
      "validation_failed",
      `Janela inválida: início (${eff.windowStartHour}h) precisa ser antes do fim (${eff.windowEndHour}h).`,
      422,
      { requestId },
    );
  }

  if (Object.keys(knobFields).length > 0) {
    const { error: upErr } = await admin.from("channel_knobs").upsert(
      {
        organization_id: org.orgId,
        channel_session_id,
        ...knobFields,
      },
      { onConflict: "organization_id,channel_session_id" },
    );
    if (upErr) {
      // O motivo cru vai em `details`, não na `message` que o operador lê: foi a
      // ausência dele que transformou um `not null` num diagnóstico de horas —
      // nem a tela nem o log diziam QUAL campo o banco recusou.
      return fail("internal_error", t("Falha ao salvar os knobs."), 500, {
        requestId,
        details: { motivo: upErr.message },
      });
    }
  }

  if (daily_message_limit !== undefined) {
    const { error: dlErr } = await admin
      .from("channel_sessions")
      .update({ daily_message_limit })
      .eq("id", channel_session_id)
      .eq("organization_id", org.orgId);
    if (dlErr) {
      return fail("internal_error", t("Falha ao salvar o teto diário."), 500, { requestId });
    }
  }

  await audit({
    action: "ai.pacing_knobs_updated",
    actorUserId: authUser.id,
    organizationId: org.orgId,
    resourceType: "channel_knobs",
    resourceId: channel_session_id,
    metadata: { ...knobFields, daily_message_limit: daily_message_limit ?? null },
  });

  const { data: savedRow } = await admin
    .from("channel_knobs")
    .select(KNOB_COLUMNS)
    .eq("organization_id", org.orgId)
    .eq("channel_session_id", channel_session_id)
    .maybeSingle();
  return ok(
    {
      channel_session_id,
      ...knobsView(
        (savedRow as unknown as ChannelKnobsRow) ?? null,
        new Date(),
        await lerFusoDaOrganizacao(admin, org.orgId),
      ),
    },
    { requestId },
  );
}
