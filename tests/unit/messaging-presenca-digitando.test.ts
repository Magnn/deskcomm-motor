/**
 * O "digitando…" atravessa o MESMO caminho de resolução do envio.
 *
 * Este teste dubla só o transporte HTTP (`getWahaClient`). Tudo entre a conversa
 * e o adapter é código real: a leitura escopada por `organization_id`, o
 * `resolveSessionRef` (que sabe de que coluna sai o ref de cada provider) e o
 * `resolveRecipient` (que sabe virar contato em endereço). Dublar o meio faria o
 * teste ficar verde com uma segunda maneira, divergente, de descobrir por qual
 * número falar — que é exatamente o defeito que a doutrina de canal proíbe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const setPresence = vi.fn(async () => undefined);
/** null = transporte não configurado (env ausente), como numa VPS sem WAHA. */
let clienteDoTransporte: { setPresence: typeof setPresence } | null = { setPresence };

vi.mock("@/lib/waha/client", async (original) => ({
  ...(await original<typeof import("@/lib/waha/client")>()),
  getWahaClient: () => clienteDoTransporte,
}));

const fetchDoTransporte = vi.fn();
vi.stubGlobal("fetch", fetchDoTransporte);

// Credencial da sessão: o teste dubla só o cofre; o resto do caminho é real.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/channels/meta/credentials", async (original) => ({
  ...(await original<typeof import("@/lib/channels/meta/credentials")>()),
  resolveMetaCreds: async (_db: unknown, q: { phoneNumberId: string }) => ({
    phoneNumberId: q.phoneNumberId,
    token: "TOKEN_DE_TESTE",
    graphVersion: "v21.0",
    source: "session" as const,
  }),
}));

import { sinalizarDigitando } from "@/lib/messaging/presenca";

interface LinhaDeConversa {
  is_group: boolean;
  group_chat_id: string | null;
  contacts: { phone_number: string | null; wa_identity: string | null; wa_lid: string | null } | null;
  channel_sessions:
    | { provider: string; waha_session_name: string | null; meta_phone_number_id: string | null; zernio_account_id: string | null; status: string }
    | null;
}

let linha: LinhaDeConversa | null = null;
/** `external_id` da última mensagem recebida da pessoa (null = nenhuma). */
let ultimaRecebida: string | null = "wamid.ULTIMA";
/** Todo par (coluna, valor) que a leitura filtrou — a prova do escopo de tenant. */
let filtros: Array<[string, unknown]> = [];

function supabaseDeTeste(): never {
  const cadeia = (resultado: () => unknown) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val]);
        return chain;
      },
      not: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: resultado(), error: null }),
    };
    return chain;
  };
  return {
    from: (tabela: string) =>
      tabela === "messages"
        ? cadeia(() => (ultimaRecebida ? { external_id: ultimaRecebida } : null))
        : cadeia(() => linha),
  } as never;
}

const CONVERSA_NORMAL: LinhaDeConversa = {
  is_group: false,
  group_chat_id: null,
  contacts: { phone_number: "+5527999998888", wa_identity: null, wa_lid: null },
  channel_sessions: {
    provider: "waha",
    waha_session_name: "sessao-do-sitio",
    meta_phone_number_id: null,
    zernio_account_id: null,
    status: "WORKING",
  },
};

beforeEach(() => {
  setPresence.mockClear();
  clienteDoTransporte = { setPresence };
  linha = structuredClone(CONVERSA_NORMAL);
  ultimaRecebida = "wamid.ULTIMA";
  filtros = [];
  fetchDoTransporte.mockReset();
});

describe("sinalizarDigitando", () => {
  it("acende 'digitando' no número da sessão e no endereço do contato", async () => {
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });

    expect(setPresence).toHaveBeenCalledTimes(1);
    expect(setPresence).toHaveBeenCalledWith("sessao-do-sitio", "5527999998888@c.us", "typing");
  });

  it("a leitura da conversa é escopada por organization_id", async () => {
    // Multi-tenancy (CLAUDE.md): quem usa service role filtra a organização à
    // mão, de fonte confiável. Sem esta linha, um id de conversa vazado
    // acenderia "digitando" no número de outro tenant.
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });
    expect(filtros).toContainEqual(["organization_id", "org-1"]);
    expect(filtros).toContainEqual(["id", "conv-1"]);
  });

  it("sessão que não está WORKING não recebe chamada de presença", async () => {
    linha!.channel_sessions!.status = "SCAN_QR_CODE";
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });
    expect(setPresence).not.toHaveBeenCalled();
  });

  it("conversa inexistente não chama o canal e não lança", async () => {
    linha = null;
    await expect(
      sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "sumiu" }),
    ).resolves.toBeUndefined();
    expect(setPresence).not.toHaveBeenCalled();
  });

  it("contato sem endereço possível não vira chamada ao canal", async () => {
    linha!.contacts = { phone_number: null, wa_identity: null, wa_lid: null };
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });
    expect(setPresence).not.toHaveBeenCalled();
  });

  it("transporte não configurado (VPS sem o container) é no-op, não erro", async () => {
    clienteDoTransporte = null;
    await expect(
      sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" }),
    ).resolves.toBeUndefined();
  });

  it("canal que não sabe sinalizar presença é no-op", async () => {
    // O adapter do canal intermediado não implementa `signalTyping`. Quem chama
    // testa a presença do método — nunca pergunta QUAL provider é.
    linha!.channel_sessions = {
      provider: "zernio",
      waha_session_name: null,
      meta_phone_number_id: null,
      zernio_account_id: "acc-1",
      status: "WORKING",
    };
    await expect(
      sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" }),
    ).resolves.toBeUndefined();
    expect(setPresence).not.toHaveBeenCalled();
  });
});

describe("sinalizarDigitando no canal oficial da Meta", () => {
  const conversaMeta = (): LinhaDeConversa => ({
    ...structuredClone(CONVERSA_NORMAL),
    channel_sessions: {
      provider: "meta_cloud",
      waha_session_name: null,
      meta_phone_number_id: "PHONE_ID_1",
      zernio_account_id: null,
      status: "WORKING",
    },
  });

  beforeEach(() => {
    linha = conversaMeta();
    fetchDoTransporte.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
  });

  it("pendura o 'digitando' no 'lida' da última mensagem recebida", async () => {
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });

    expect(fetchDoTransporte).toHaveBeenCalledTimes(1);
    const [url, init] = fetchDoTransporte.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toMatch(/\/PHONE_ID_1\/messages$/);
    expect(init.headers.Authorization).toBe("Bearer TOKEN_DE_TESTE");
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.ULTIMA",
      typing_indicator: { type: "text" },
    });
  });

  it("a busca da última recebida é escopada por organização e conversa", async () => {
    await sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" });
    expect(filtros).toContainEqual(["organization_id", "org-1"]);
    expect(filtros).toContainEqual(["conversation_id", "conv-1"]);
    expect(filtros).toContainEqual(["direction", "inbound"]);
  });

  it("sem mensagem recebida para pendurar, não chama a Meta e não lança", async () => {
    ultimaRecebida = null;
    await expect(
      sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" }),
    ).resolves.toBeUndefined();
    expect(fetchDoTransporte).not.toHaveBeenCalled();
  });

  it("a recusa da Meta sobe (quem decide engolir é o atraso humano)", async () => {
    fetchDoTransporte.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 131009, message: "Parameter value is not valid" } }),
    });
    await expect(
      sinalizarDigitando(supabaseDeTeste(), { organizationId: "org-1", conversationId: "conv-1" }),
    ).rejects.toThrow(/meta_131009/);
  });
});
