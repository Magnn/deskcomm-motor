import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  avancarEnrollmentAtivo,
  createSupabaseAdminClient,
  type AdminClient,
  type TickDeps,
} from "./engine";
import type { EnrollmentEventRef, EnrollmentRow } from "./node-handlers";
import type { FlowGraph } from "./graph-schema";

const NOW = new Date("2026-09-28T17:00:00.000Z");
const DEADLINE = new Date(NOW.getTime() + 30 * 60_000).toISOString();

const GRAPH: FlowGraph = {
  nodes: [
    {
      id: "route",
      type: "attendant_route",
      label: "Distribuir",
      position: { x: 0, y: 0 },
      config: { max_wait_minutes: 30 },
    },
    {
      id: "assigned",
      type: "end",
      label: "Atribuído",
      position: { x: 0, y: 0 },
      config: { outcome: "converted" },
    },
    {
      id: "timeout",
      type: "end",
      label: "Sem atendente",
      position: { x: 0, y: 0 },
      config: { outcome: "exhausted" },
    },
  ],
  edges: [
    {
      id: "route-assigned",
      source: "route",
      target: "assigned",
      priority: 0,
      condition: { type: "branch", branch_id: "assigned" },
    },
    {
      id: "route-timeout",
      source: "route",
      target: "timeout",
      priority: 0,
      condition: { type: "branch", branch_id: "timeout" },
    },
    {
      id: "route-fallback",
      source: "route",
      target: "timeout",
      priority: -1,
      condition: { type: "always" },
    },
  ],
};

function enrollment(overrides: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "contact-1",
    conversation_id: "conversation-1",
    current_node_id: "route",
    status: "active",
    next_eval_at: NOW.toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 3,
    outcome: null,
    cancel_reason: null,
    started_at: NOW.toISOString(),
    completed_at: null,
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function fakeDeps(
  options: { assigned?: boolean; events?: EnrollmentEventRef[]; clock?: () => Date } = {},
) {
  const events = options.events ?? [];
  const updates: Array<Record<string, unknown>> = [];
  const ensureAttendantRouting = vi.fn(async () => options.assigned ?? false);
  const insertEnrollmentEvent = vi.fn(
    async (event: Parameters<AdminClient["insertEnrollmentEvent"]>[0]) => {
      events.push({
        node_id: event.node_id,
        idempotency_key: event.idempotency_key,
        event_type: event.event_type,
        payload: event.payload,
      });
      return { inserted: true };
    },
  );
  const db = {
    loadFlowGraph: vi.fn(async () => GRAPH),
    loadLeadFacts: vi.fn(async () => ({ lead_stage: null, tags: [] })),
    loadEnrollmentEvents: vi.fn(async () => events),
    loadLastInboundBody: vi.fn(async () => null),
    ensureAttendantRouting,
    insertEnrollmentEvent,
    updateEnrollment: vi.fn(async (_id: string, _org: string, patch: Record<string, unknown>) => {
      updates.push(patch);
    }),
    loadFlowPointerName: vi.fn(async () => "Fluxo"),
    insertDeadInboxItem: vi.fn(async () => {}),
    persistirRespostaFollowup: vi.fn(async () => {}),
  } as unknown as AdminClient;
  const deps: TickDeps = { db, clock: options.clock ?? (() => NOW), enqueueJob: async () => {} };
  return { deps, ensureAttendantRouting, insertEnrollmentEvent, updates, events };
}

describe("attendant_route no tick de follow-up", () => {
  it("solicita o rodízio uma vez e mantém o mesmo prazo durante o polling", async () => {
    const fake = fakeDeps();
    await avancarEnrollmentAtivo(fake.deps, enrollment());

    expect(fake.ensureAttendantRouting).toHaveBeenCalledWith({
      organizationId: "org-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      allowNewAssignment: true,
      now: NOW,
    });
    expect(fake.insertEnrollmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "wait_started",
        payload: expect.objectContaining({ deadline_at: DEADLINE }),
      }),
    );

    await avancarEnrollmentAtivo(fake.deps, enrollment({ steps_taken: 4 }));

    expect(fake.ensureAttendantRouting).toHaveBeenLastCalledWith({
      organizationId: "org-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      allowNewAssignment: true,
      now: NOW,
    });
    expect(fake.insertEnrollmentEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ deadline_at: DEADLINE }) }),
    );
  });

  it("continua pelo ramo de atribuição apenas quando a conversa já tem responsável", async () => {
    const events: EnrollmentEventRef[] = [
      {
        node_id: "route",
        idempotency_key: "route:3",
        event_type: "wait_started",
        payload: { deadline_at: DEADLINE },
      },
    ];
    const fake = fakeDeps({ assigned: true, events });
    await avancarEnrollmentAtivo(fake.deps, enrollment({ steps_taken: 4 }));
    expect(fake.updates).toContainEqual(expect.objectContaining({ current_node_id: "assigned" }));
    expect(fake.ensureAttendantRouting).toHaveBeenCalledWith({
      organizationId: "org-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      allowNewAssignment: true,
      now: NOW,
    });
  });

  it("segue pelo ramo de timeout quando o deadline persistido venceu", async () => {
    const events: EnrollmentEventRef[] = [
      {
        node_id: "route",
        idempotency_key: "route:3",
        event_type: "wait_started",
        payload: { deadline_at: DEADLINE },
      },
    ];
    const fake = fakeDeps({ events, clock: () => new Date(new Date(DEADLINE).getTime() + 1) });
    await avancarEnrollmentAtivo(
      { ...fake.deps, clock: () => new Date(new Date(DEADLINE).getTime() + 1) },
      enrollment({ steps_taken: 4 }),
    );
    expect(fake.updates).toContainEqual(expect.objectContaining({ current_node_id: "timeout" }));
    expect(fake.ensureAttendantRouting).toHaveBeenCalledWith(
      expect.objectContaining({ allowNewAssignment: false }),
    );
  });

  it("faz claim com um atendente elegível no modo round_robin", async () => {
    const conversation: {
      id: string;
      contact_id: string;
      channel_session_id: string;
      assigned_to_user_id: string | null;
      status: string;
    } = {
      id: "conversation-1",
      contact_id: "contact-1",
      channel_session_id: "channel-1",
      assigned_to_user_id: null,
      status: "open",
    };
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
      conversation.assigned_to_user_id = String(args.p_user);
      return { data: "assigned", error: null };
    });
    const rows: Record<string, unknown[]> = {
      channel_sessions: [{ id: "channel-1" }],
      channel_routing_policies: [],
      user_organizations: [{ user_id: "attendant-1" }],
      attendant_availability: [{ user_id: "attendant-1", capacity: 5, schedule: {} }],
      conversations: [],
      conversation_assignment_events: [],
    };
    const admin = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          in: () => query,
          order: () => query,
          maybeSingle: async () => {
            if (table === "organizations") {
              return { data: { settings: { routing: { mode: "round_robin" } } }, error: null };
            }
            if (table === "channel_sessions") return { data: { id: "channel-1" }, error: null };
            if (table === "channel_routing_policies") return { data: null, error: null };
            if (table === "conversations") return { data: conversation, error: null };
            return { data: null, error: null };
          },
          then: (
            resolve: (value: { data: unknown[]; error: null }) => unknown,
            reject: (reason: unknown) => unknown,
          ) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject),
        };
        return query;
      },
      rpc,
    };
    const db = createSupabaseAdminClient(admin as unknown as SupabaseClient);
    const assigned = await db.ensureAttendantRouting?.({
      organizationId: "org-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      allowNewAssignment: true,
      now: NOW,
    });
    expect(rpc).toHaveBeenCalledWith("fn_channel_routing_claim", {
      p_org: "org-1",
      p_conversation: "conversation-1",
      p_channel: "channel-1",
      p_user: "attendant-1",
      p_reason: "routing",
      p_schedule: {},
    });
    expect(assigned).toBe(true);
  });

  it("não agenda a fila quando a organização está em modo manual", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    const admin = {
      from(table: string) {
        const query = {
          select: () => query,
          eq: () => query,
          is: () => query,
          in: () => query,
          order: () => query,
          maybeSingle: async () =>
            table === "organizations"
              ? { data: { settings: { routing: { mode: "manual" } } }, error: null }
              : {
                  data: {
                    id: "conversation-1",
                    contact_id: "contact-1",
                    channel_session_id: "channel-1",
                    assigned_to_user_id: null,
                    status: "open",
                  },
                  error: null,
                },
          then: (
            resolve: (value: { data: unknown[]; error: null }) => unknown,
            reject: (reason: unknown) => unknown,
          ) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
        };
        return query;
      },
      rpc,
    };
    const db = createSupabaseAdminClient(admin as unknown as SupabaseClient);
    const assigned = await db.ensureAttendantRouting?.({
      organizationId: "org-1",
      contactId: "contact-1",
      conversationId: "conversation-1",
      allowNewAssignment: true,
      now: NOW,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(assigned).toBe(false);
  });
});
