/**
 * SÓ DENTRO DA JANELA — com `settings.envio.so_dentro_da_janela`, nada automático sai para
 * quem não escreveu nas últimas 24 h naquele número, mesmo no canal por QR (que aceitaria).
 *
 * O teste olha o que o handler TENTA gravar e mandar: sem a trava, a linha da mensagem é
 * inserida e o canal é chamado.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import type { HandlerCtx } from "@/lib/api/handlers/types";
import type { SendMessageInput } from "@/lib/schemas";
import { criarDubleDoHandler } from "../helpers/duble-do-handler";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ createSignedUrl: vi.fn() }) } }),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));

const ORG = "11111111-1111-4111-8111-111111111111";
const CONV = "22222222-2222-4222-8222-222222222222";
const SESSION = "44444444-4444-4444-8444-444444444444";
const HORA = 60 * 60 * 1000;

const input = { conversation_id: CONV, type: "text", body: "Oi, passando para saber de você." } as SendMessageInput;
const AGENTE: HandlerCtx["actor"] = { type: "ai_agent", id: "agente-1", role: "agent" };
const FLUXO: HandlerCtx["actor"] = { type: "webhook_source", id: "fluxo-1" };
const PESSOA: HandlerCtx["actor"] = { type: "user", id: "55555555-5555-4555-8555-555555555555" };

let fetchDoCanal: ReturnType<typeof vi.fn>;

function cenario(opts: { ultimaEntradaHa: number | null; ligado: boolean }) {
  vi.stubEnv("WAHA_API_BASE_URL", "http://localhost:3030");
  vi.stubEnv("WAHA_API_KEY", "test-key");
  fetchDoCanal = vi.fn(async () => new Response(JSON.stringify({ id: { id: "3EB0ABC" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchDoCanal);
  return criarDubleDoHandler({
    orgSettings: opts.ligado ? { envio: { so_dentro_da_janela: true } } : {},
    conversation: {
      id: CONV,
      organization_id: ORG,
      contact_id: "33333333-3333-4333-8333-333333333333",
      channel_session_id: SESSION,
      is_group: false,
      group_chat_id: null,
      last_inbound_at: opts.ultimaEntradaHa === null ? null : new Date(Date.now() - opts.ultimaEntradaHa * HORA).toISOString(),
      contacts: { phone_number: "+553****8888", wa_identity: null, wa_lid: null, is_blocked: false },
      channel_sessions: { provider: "waha", waha_session_name: "default", status: "WORKING", archived_at: null, metadata: {} },
    },
  });
}

const ctx = (actor: HandlerCtx["actor"]): HandlerCtx => ({ organization_id: ORG, actor, requestId: "req-janela" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ligado: nada automático fora da janela de 24 h", () => {
  it("⭐ o agente não fala com quem escreveu há 25 h — nem grava, nem chama o canal", async () => {
    const { supabase, capturas } = cenario({ ultimaEntradaHa: 25, ligado: true });
    await expect(sendMessageHandler(supabase, ctx(AGENTE), input)).rejects.toMatchObject({ status: 403 });
    expect(capturas.inserts.messages).toHaveLength(0);
    expect(fetchDoCanal).not.toHaveBeenCalled();
  });

  it("⭐ fluxo/campanha não abrem conversa com quem nunca escreveu neste número", async () => {
    const { supabase, capturas } = cenario({ ultimaEntradaHa: null, ligado: true });
    await expect(sendMessageHandler(supabase, ctx(FLUXO), input)).rejects.toMatchObject({ status: 403 });
    expect(capturas.inserts.messages).toHaveLength(0);
  });

  it("CONTROLE: quem escreveu há 2 h recebe a resposta do agente", async () => {
    const { supabase, capturas } = cenario({ ultimaEntradaHa: 2, ligado: true });
    await sendMessageHandler(supabase, ctx(AGENTE), input);
    expect(capturas.inserts.messages).toHaveLength(1);
  });

  it("CONTROLE: o atendente humano continua podendo mandar fora da janela", async () => {
    const { supabase, capturas } = cenario({ ultimaEntradaHa: 25, ligado: true });
    await sendMessageHandler(supabase, ctx(PESSOA), input);
    expect(capturas.inserts.messages).toHaveLength(1);
  });
});

it("CONTROLE: desligado (padrão), o canal por QR segue mandando fora da janela como antes", async () => {
  const { supabase, capturas } = cenario({ ultimaEntradaHa: 25, ligado: false });
  await sendMessageHandler(supabase, ctx(AGENTE), input);
  expect(capturas.inserts.messages).toHaveLength(1);
});
