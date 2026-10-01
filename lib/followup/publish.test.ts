import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { publishFollowupFlowVersion } from "./publish";
import type { FlowGraph } from "./graph-schema";

describe("publishFollowupFlowVersion", () => {
  it("preserva conflito de gatilho como resultado de domínio", async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "P0001: trigger_conflict" },
      }),
    } as unknown as SupabaseClient;

    const result = await publishFollowupFlowVersion(admin, {
      orgId: "org-a",
      pointerId: "flow-a",
      graph: { nodes: [], edges: [] } as unknown as FlowGraph,
      createdBy: "user-a",
    });

    expect(result).toEqual({ ok: false, code: "trigger_conflict", message: "P0001: trigger_conflict" });
  });
});
