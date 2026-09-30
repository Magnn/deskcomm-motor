/**
 * O nó Voice Studio de ponta a ponta no motor: `createFollowupTurnHandler` recebendo um
 * item `voice` no `content_items`.
 *
 * O que este teste prende:
 *   1. o texto é SINTETIZADO na hora do envio e a nota sai como áudio, na pasta da conversa;
 *   2. se a voz não puder ser gerada (sem chave, cota, provedor fora, texto longo demais) a
 *      pessoa recebe o TEXTO — o passo nunca some em silêncio;
 *   3. as variáveis do contato ({primeiro_nome}…) são resolvidas ANTES de falar;
 *   4. link no texto não é lido em voz alta: vai depois, como texto;
 *   5. `seq` cresce por mensagem física, também entre item de voz e os de texto ao redor;
 *   6. um envio que o canal segurou para a sequência ali.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRow } from "@/lib/agent-engine/queue/queue";

const runBeforeSend = vi.fn(async (args: { send: (body: string) => Promise<{ kind: string }> }) => ({
  status: "sent",
  outcome: await args.send("corpo-do-portao"),
  trace: [],
}));
vi.mock("@/lib/agent-engine/guardrails/before-send", () => ({ runBeforeSend }));
vi.mock("@/lib/agent-engine/agent/human-handoff", () => ({ isLeadInHandoff: vi.fn(async () => false) }));
vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", () => ({
  getLeadContext: vi.fn(async () => ({
    ok: true,
    context: { contact: { is_blocked: false, name: "Maria das Dores", phone: "5511999990000", email: null } },
    lgpd: { isAnonymized: false, isProspecting: false, legalBasis: {} },
  })),
}));
vi.mock("@/lib/agent-engine/edge/crm/send-message", () => ({ applySendOutcome: vi.fn(async () => undefined) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ storage: { from: () => ({ copy: vi.fn() }) } }) }));

// A síntese e o storage reais fazem rede; o que se prova aqui é a ORQUESTRAÇÃO do envio.
const prepararNotasDeVoz = vi.fn();
vi.mock("@/lib/agent-engine/agent/nota-de-voz", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/agent-engine/agent/nota-de-voz")>();
  return { ...real, prepararNotasDeVoz, dependenciasReaisDeNota: vi.fn(() => ({})) };
});

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

const voz = (over: Record<string, unknown> = {}) => ({
  type: "voice",
  text: "Olá {primeiro_nome}, tudo bem?",
  provider: "openai",
  voice_id: "coral",
  speed: 1,
  ...over,
});

function job(items: unknown[]): JobRow {
  return {
    id: "job-1",
    organization_id: ORG,
    contact_id: LEAD,
    kind: "followup_turn",
    source_event_id: null,
    payload: {
      service_boundary: boundary,
      followup_enrollment_id: "11111111-1111-4111-8111-111111111111",
      node_id: "node-1",
      purpose: "send_message",
      content_items: items,
    },
    status: "running",
    priority: 0,
    run_after: new Date(),
    attempts: 1,
    max_attempts: 3,
    last_error: null,
    locked_by: "w1",
    locked_at: new Date(),
    created_at: new Date(),
  } as JobRow;
}

function fakePool() {
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (/from conversations/.test(sql)) return { rows: [{ id: CONVERSA, channel_session_id: "canal-1", archived_at: null }] };
    return { rows: [] };
  });
  return { query } as never;
}

interface Envio {
  seq: number;
  body: string;
  media?: { storagePath: string; mime: string; kind: string };
}
const OK = { kind: "sent", idempotencyKey: "k", messageId: "m" };

function deps(send: ReturnType<typeof vi.fn>) {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    crmCfg: {},
    llmCfg: {},
    knobs: {},
    sleep: vi.fn(async () => undefined),
    channel: () => ({ send }),
    completeFollowupTurn: vi.fn(async () => undefined),
  } as never;
}
const enviosDe = (send: ReturnType<typeof vi.fn>) => send.mock.calls.map((c) => c[0] as Envio);

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;
beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

beforeEach(() => {
  runBeforeSend.mockClear();
  prepararNotasDeVoz.mockReset();
  prepararNotasDeVoz.mockResolvedValue({
    ok: true,
    notas: [{ storagePath: `${ORG}/${CONVERSA}/voz-abc.ogg`, mime: "audio/ogg;codecs=opus", fala: "Olá Maria, tudo bem?" }],
    links: [],
  });
});

describe("Voice Studio na sequência de conteúdo", () => {
  it("sintetiza e envia UMA nota de voz, com o texto como legenda e o arquivo na pasta da conversa", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([voz()]), fakePool(), { workerId: "w1" });

    expect(enviosDe(send)).toHaveLength(1);
    const e = enviosDe(send)[0]!;
    expect(e.media?.kind).toBe("audio");
    expect(e.media?.storagePath.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);
    expect(e.body).toBe("Olá Maria, tudo bem?");
  });

  it("resolve {primeiro_nome} ANTES de falar, e entrega a voz escolhida à síntese", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([voz({ voice_id: "onyx", speed: 1.1 })]), fakePool(), { workerId: "w1" });

    const pedido = prepararNotasDeVoz.mock.calls[0]![1] as { texto: string; tenantId: string; conversationId: string; config: Record<string, unknown> };
    expect(pedido.texto).toBe("Olá Maria, tudo bem?");
    expect(pedido.tenantId).toBe(ORG);
    expect(pedido.conversationId).toBe(CONVERSA);
    expect(pedido.config).toMatchObject({ provider: "openai", voice_id: "onyx", speed: 1.1 });
  });

  it.each(["sem_chave", "longo_demais", "provedor_fora_do_ar", "sem_fala"])(
    "voz que não pôde ser gerada (%s): a pessoa recebe o TEXTO, não silêncio",
    async (motivo) => {
      prepararNotasDeVoz.mockResolvedValueOnce({ ok: false, motivo });
      const send = vi.fn(async (_e: Envio) => OK);
      const d = deps(send);
      await criarHandler(d)(job([voz()]), fakePool(), { workerId: "w1" });

      expect(enviosDe(send)).toHaveLength(1);
      expect(enviosDe(send)[0]).toMatchObject({ body: "Olá Maria, tudo bem?" });
      expect(enviosDe(send)[0]!.media).toBeUndefined();
      expect((d as unknown as { log: { warn: ReturnType<typeof vi.fn> } }).log.warn).toHaveBeenCalledWith(
        expect.stringContaining("caiu para texto"),
        expect.objectContaining({ motivo }),
      );
    },
  );

  it("link no texto vai DEPOIS da nota, como texto (link não se fala)", async () => {
    prepararNotasDeVoz.mockResolvedValueOnce({
      ok: true,
      notas: [{ storagePath: `${ORG}/${CONVERSA}/voz-1.ogg`, mime: "audio/ogg", fala: "Acesse o link" }],
      links: ["https://exemplo.com/pagar"],
    });
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([voz()]), fakePool(), { workerId: "w1" });

    const envios = enviosDe(send);
    expect(envios.map((e) => e.media?.kind ?? "texto")).toEqual(["audio", "texto"]);
    expect(envios[1]!.body).toBe("https://exemplo.com/pagar");
    expect(envios.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("texto longo vira várias notas com seq crescente, e entra na ordem entre outros itens", async () => {
    prepararNotasDeVoz.mockResolvedValueOnce({
      ok: true,
      notas: [
        { storagePath: `${ORG}/${CONVERSA}/voz-1.ogg`, mime: "audio/ogg", fala: "parte 1" },
        { storagePath: `${ORG}/${CONVERSA}/voz-2.ogg`, mime: "audio/ogg", fala: "parte 2" },
      ],
      links: [],
    });
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([{ type: "text", body: "Antes" }, voz(), { type: "text", body: "Depois" }]), fakePool(), { workerId: "w1" });

    const envios = enviosDe(send);
    expect(envios.map((e) => e.media?.kind ?? "texto")).toEqual(["texto", "audio", "audio", "texto"]);
    expect(envios.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it("veto permanente na nota (contato bloqueado): o item seguinte não sai e o job se encerra", async () => {
    const send = vi.fn(async (_e: Envio) => ({ kind: "blocked", idempotencyKey: "k", messageId: null }));
    await expect(
      criarHandler(deps(send))(job([voz(), { type: "text", body: "Não deve sair" }]), fakePool(), { workerId: "w1" }),
    ).rejects.toThrow(/vetada pelo sink/);
    expect(enviosDe(send)).toHaveLength(1);
  });

  it("variáveis também valem nos itens de texto da mesma sequência", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([{ type: "text", body: "Oi {primeiro_nome}, fone {telefone}" }]), fakePool(), { workerId: "w1" });
    // É o único texto: recebe o corpo do PORTÃO (dublê), que já parte do texto resolvido.
    const portao = runBeforeSend.mock.calls[0]![0] as unknown as { body: string };
    expect(portao.body).toBe("Oi Maria, fone 5511999990000");
  });
});
