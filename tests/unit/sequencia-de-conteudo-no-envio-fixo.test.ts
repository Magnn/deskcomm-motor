/**
 * O nó "Conteúdo" (`action.mode = 'content'`) de ponta a ponta no motor:
 * `createFollowupTurnHandler` recebendo `content_items` no payload.
 *
 * O que este teste prende:
 *   1. cada item físico (texto/imagem/áudio) vira UM `channel.send`, com `seq`
 *      crescente — delay NÃO consome seq (não é send);
 *   2. mídia é COPIADA pro Storage da conversa (`{org}/{conversationId}/…`)
 *      antes do envio — nunca referencia o path do fluxo direto;
 *   3. delay é uma pausa a mais (`sleep`), não um send;
 *   4. mídia cuja cópia falha é PULADA sem derrubar o resto da sequência;
 *   5. item sem motor (vídeo/documento/contato) é pulado, nunca lança —
 *      rede de segurança para um fluxo publicado antes da guarda existir;
 *   6. um `send` que devolve um kind fora de OK_KINDS para a sequência ali
 *      (não manda os itens seguintes).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobRow } from "@/lib/agent-engine/queue/queue";

// runBeforeSend REAL de verdade chamaria `args.send(args.body)` só depois do
// gate passar; aqui o dublê faz a MESMA coisa (chama o send e devolve o
// outcome dele), pra exercitar o loop de itens de `sendConteudoSequence` —
// diferente do dublê de `camada-semantica-no-envio-fixo.test.ts`, que nunca
// chama `send` porque não precisa (não testa o QUE é enviado).
const runBeforeSend = vi.fn(async (args: { send: (body: string) => Promise<{ kind: string }> }) => ({
  status: "sent",
  outcome: await args.send("corpo-do-portao"),
  trace: [],
}));
vi.mock("@/lib/agent-engine/guardrails/before-send", () => ({ runBeforeSend }));

vi.mock("@/lib/agent-engine/agent/human-handoff", () => ({
  isLeadInHandoff: vi.fn(async () => false),
}));

vi.mock("@/lib/agent-engine/edge/crm/get-lead-context", () => ({
  getLeadContext: vi.fn(async () => ({
    ok: true,
    context: { contact: { is_blocked: false } },
    lgpd: { isAnonymized: false, isProspecting: false, legalBasis: {} },
  })),
}));

vi.mock("@/lib/agent-engine/edge/crm/send-message", () => ({
  applySendOutcome: vi.fn(async () => undefined),
}));

const storageCopy = vi.fn(async (_origem: string, _destino: string) => ({ error: null as { message: string; statusCode?: string } | null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ copy: storageCopy }) } }),
}));

const ORG = "org-1";
const LEAD = "lead-1";
const CONVERSA = "conversa-1";
const CANAL = "canal-1";

const boundary = { organization_id: ORG, contact_id: LEAD, conversation_id: CONVERSA, service_revision: 1, demanda_id: null, demanda_revision: null };

function job(contentItems: unknown[]): JobRow {
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
      content_items: contentItems,
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
    if (/from conversations/.test(sql)) {
      return { rows: [{ id: CONVERSA, channel_session_id: CANAL, archived_at: null }] };
    }
    return { rows: [] };
  });
  return { query } as never;
}

const ctx = { workerId: "w1" };

/** O parâmetro é DECLARADO (não `()=>`) para `mock.calls[0][0]` existir pro typechecker — mesma lição de camada-semantica-no-envio-fixo.test.ts. */
interface EnvioDeItem {
  seq: number;
  body: string;
  media?: { storagePath: string; mime: string; kind: string };
}
function fakeChannelSend(resultado: { kind: string; idempotencyKey: string; messageId: string | null }) {
  return vi.fn(async (_input: EnvioDeItem) => resultado);
}

function deps(channelSend: ReturnType<typeof vi.fn>) {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    crmCfg: {},
    llmCfg: {},
    knobs: {},
    sleep: vi.fn(async () => undefined),
    channel: () => ({ send: channelSend }),
    completeFollowupTurn: vi.fn(async () => undefined),
  } as never;
}

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;

beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

beforeEach(() => {
  runBeforeSend.mockClear();
  storageCopy.mockClear();
  storageCopy.mockResolvedValue({ error: null });
});

describe("sequência de conteúdo — texto, mídia e pausa", () => {
  it("texto + imagem + pausa + áudio: 3 sends físicos, seq 1-2-3, delay não conta", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const d = deps(channelSend);
    await criarHandler(d)(
      job([
        { type: "text", body: "Oi! Segue o material." },
        { type: "image", storage_path: "org-1/flow-content/flow-1/foto.jpg", mime: "image/jpeg", caption: "Antes e depois" },
        { type: "delay", seconds: 5 },
        { type: "audio", storage_path: "org-1/flow-content/flow-1/nota.ogg", mime: "audio/ogg" },
      ]),
      fakePool(),
      ctx,
    );

    expect(channelSend).toHaveBeenCalledTimes(3);
    const seqs = channelSend.mock.calls.map((c) => (c[0] as { seq: number }).seq);
    expect(seqs).toEqual([1, 2, 3]);

    const chamadaDeTexto = channelSend.mock.calls[0]![0] as { body: string; media?: unknown };
    expect(chamadaDeTexto.media).toBeUndefined();

    const chamadaDeImagem = channelSend.mock.calls[1]![0] as { body: string; media?: { storagePath: string; mime: string; kind: string } };
    expect(chamadaDeImagem.body).toBe("Antes e depois");
    expect(chamadaDeImagem.media?.kind).toBe("image");
    expect(chamadaDeImagem.media?.storagePath.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);

    const chamadaDeAudio = channelSend.mock.calls[2]![0] as { media?: { kind: string } };
    expect(chamadaDeAudio.media?.kind).toBe("audio");

    // delay dormiu 5000ms — não é o mesmo valor do jitter anti-ban entre os outros.
    const sleeps = (d as unknown as { sleep: ReturnType<typeof vi.fn> }).sleep.mock.calls.map((c) => c[0]);
    expect(sleeps).toContain(5000);

    expect((d as unknown as { completeFollowupTurn: ReturnType<typeof vi.fn> }).completeFollowupTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ result: { kind: "sent" } }),
    );
  });

  it("mídia copia pro Storage da CONVERSA, nunca referencia o path do fluxo direto", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([{ type: "image", storage_path: "org-1/flow-content/flow-1/foto.jpg", mime: "image/jpeg" }]),
      fakePool(),
      ctx,
    );
    expect(storageCopy).toHaveBeenCalledTimes(1);
    const [origem, destino] = storageCopy.mock.calls[0]!;
    expect(origem).toBe("org-1/flow-content/flow-1/foto.jpg");
    expect(destino.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);
  });

  it("cópia de mídia que falha PULA o item, sem derrubar a sequência", async () => {
    storageCopy.mockResolvedValueOnce({ error: { message: "boom" } });
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "image", storage_path: "p1", mime: "image/jpeg" },
        { type: "text", body: "Segue de qualquer forma" },
      ]),
      fakePool(),
      ctx,
    );
    // A imagem falhou na cópia (pulada); só o texto virou send físico. O corpo
    // é o do PORTÃO ("corpo-do-portao", o dublê de runBeforeSend) — é o único
    // item de texto, então recebe o finalBody da cadeia, não o literal dele.
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect((channelSend.mock.calls[0]![0] as { body: string }).body).toBe("corpo-do-portao");
  });

  it("item sem motor (vídeo/documento/contato) é pulado, nunca derruba o turno", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "video", storage_path: "p", mime: "video/mp4" },
        { type: "document", storage_path: "p", mime: "application/pdf" },
        { type: "contact", name: "Suporte", phone_number: "+5511999998888" },
        { type: "text", body: "O que sobrou" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect((channelSend.mock.calls[0]![0] as { body: string }).body).toBe("corpo-do-portao");
  });

  it("send que devolve 'blocked' PARA a sequência ali (não manda o resto) e propaga o veto permanente", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k2", messageId: "m" });
    channelSend.mockResolvedValueOnce({ kind: "blocked", idempotencyKey: "k", messageId: null });
    // 'blocked' é veto PERMANENTE (is_blocked) — o mesmo desfecho de `sendFixedOutbound`
    // faria a mesma coisa: cancela o job de vez (JobSettledError), não silencia o erro.
    await expect(
      criarHandler(deps(channelSend))(
        job([
          { type: "text", body: "Primeiro" },
          { type: "text", body: "Segundo — não deveria sair" },
        ]),
        fakePool(),
        ctx,
      ),
    ).rejects.toThrow(/vetada pelo sink/);
    // Só o primeiro item chegou a ser enviado — o segundo nunca saiu.
    expect(channelSend).toHaveBeenCalledTimes(1);
  });

  it("só pausas (config degenerada que o publish deveria ter barrado): não lança, devolve sem enviar nada", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const d = deps(channelSend);
    await criarHandler(d)(job([{ type: "delay", seconds: 2 }]), fakePool(), ctx);

    expect(channelSend).not.toHaveBeenCalled();
    expect((d as unknown as { completeFollowupTurn: ReturnType<typeof vi.fn> }).completeFollowupTurn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ result: { kind: "sent" } }),
    );
  });
});
