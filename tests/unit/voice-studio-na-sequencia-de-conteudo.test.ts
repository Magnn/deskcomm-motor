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

const cobrar = vi.fn();
const lerCredencialDeCobranca = vi.fn();
vi.mock("@/lib/pagamentos/credencial-de-cobranca", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pagamentos/credencial-de-cobranca")>();
  return { ...real, lerCredencialDeCobranca };
});
vi.mock("@/lib/pagamentos/asaas", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/pagamentos/asaas")>();
  return { ...real, criarClienteAsaas: vi.fn(() => ({ cobrar })) };
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

function fakePool(modelo: Record<string, unknown> | null = null) {
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (/from meta_templates/.test(sql)) return { rows: modelo ? [modelo] : [] };
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

// ─── Nó Template WhatsApp ────────────────────────────────────────────────

const COMPONENTES = [{ type: "BODY", text: "Oi {{1}}, sua oferta {{2}} está no ar." }];
const aprovado = (over: Record<string, unknown> = {}) => ({
  components: COMPONENTES,
  parameter_format: "POSITIONAL",
  status: "APPROVED",
  ...over,
});
const modelo = (over: Record<string, unknown> = {}) => ({
  type: "template",
  name: "oferta",
  language: "pt_BR",
  values: { "1": "{primeiro_nome}", "2": "de hoje" },
  ...over,
});

describe("Template WhatsApp na sequência de conteúdo", () => {
  it("envia como TEMPLATE, com as variáveis do contato resolvidas e o texto renderizado como corpo", async () => {
    const send = vi.fn(async (_e: Envio & { template?: unknown }) => OK);
    await criarHandler(deps(send))(job([modelo()]), fakePool(aprovado()), { workerId: "w1" });

    const e = send.mock.calls[0]![0] as Envio & { template?: { name: string; language: string; values: Record<string, string> } };
    expect(e.template).toEqual({ name: "oferta", language: "pt_BR", values: { "1": "Maria", "2": "de hoje" } });
    expect(e.body).toBe("Oi Maria, sua oferta de hoje está no ar.");
  });

  it("só modelo: o gate recebe isTemplate (é o único jeito de falar fora da janela de 24 h) e o texto renderizado", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([modelo()]), fakePool(aprovado()), { workerId: "w1" });
    const gate = runBeforeSend.mock.calls[0]![0] as unknown as { isTemplate?: boolean; body: string };
    expect(gate.isTemplate).toBe(true);
    expect(gate.body).toBe("Oi Maria, sua oferta de hoje está no ar.");
  });

  it("modelo misturado com texto livre NÃO ganha a isenção da janela", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([modelo(), { type: "text", body: "e aí?" }]), fakePool(aprovado()), { workerId: "w1" });
    const gate = runBeforeSend.mock.calls[0]![0] as unknown as { isTemplate?: boolean };
    expect(gate.isTemplate).toBeUndefined();
  });

  it.each([
    ["não existe nesta conexão", null, /template_desconhecido/],
    ["não está aprovado", aprovado({ status: "PENDING" }), /template_nao_aprovado/],
  ])("modelo que %s: falha ANTES de enviar, com a causa", async (_t, linha, erro) => {
    const send = vi.fn(async (_e: Envio) => OK);
    await expect(criarHandler(deps(send))(job([modelo()]), fakePool(linha as never), { workerId: "w1" })).rejects.toThrow(erro);
    expect(send).not.toHaveBeenCalled();
    expect(runBeforeSend).not.toHaveBeenCalled();
  });

  it("campo do modelo sem valor: recusa e diz QUAL campo falta", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await expect(
      criarHandler(deps(send))(job([modelo({ values: { "1": "{primeiro_nome}" } })]), fakePool(aprovado()), { workerId: "w1" }),
    ).rejects.toThrow(/template_sem_valor.*2/);
    expect(send).not.toHaveBeenCalled();
  });
});

// ─── Nó Cobrança ─────────────────────────────────────────────────────────

const cobranca = (over: Record<string, unknown> = {}) => ({
  type: "charge",
  amount_cents: 19700,
  description: "Consulta",
  customer_name: "{full_name}",
  customer_phone: "{phone_number}",
  ...over,
});

describe("Cobrança na sequência de conteúdo", () => {
  beforeEach(() => {
    cobrar.mockReset().mockResolvedValue({ id: "pay_1", link: "https://asaas/i/pay_1", pixCopiaECola: "00020126COPIA", reaproveitada: false });
    lerCredencialDeCobranca.mockReset().mockResolvedValue({ ok: true, credencial: { apiKey: "k", ambiente: "sandbox" } });
  });

  it("cria a cobrança e manda o link e, SOZINHA na bolha seguinte, a chave copia-e-cola", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" });

    const envios = enviosDe(send);
    expect(envios).toHaveLength(2);
    expect(envios[0]!.body).toContain("https://asaas/i/pay_1");
    expect(envios[0]!.body).toMatch(/197,00/);
    expect(envios[1]!.body).toBe("00020126COPIA");
    expect(envios.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("referência determinística (inscrição + caixa) e dados do contato com as variáveis resolvidas", async () => {
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" });
    expect(cobrar).toHaveBeenCalledWith({
      referencia: "11111111-1111-4111-8111-111111111111:node-1",
      cliente: { referencia: LEAD, nome: "Maria das Dores", telefone: "5511999990000", email: null },
      valorCentavos: 19700,
      descricao: "Consulta",
    });
  });

  it("a cobrança só é criada DEPOIS do gate: o gate avalia o texto sem link, e veto não deixa cobrança órfã", async () => {
    runBeforeSend.mockImplementationOnce(async () => ({ status: "vetoed", code: "outside_window", message: "fora da janela", trace: [] }) as never);
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" });
    expect(cobrar).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    const gate = runBeforeSend.mock.calls.at(-1)![0] as unknown as { body: string };
    expect(gate.body).toMatch(/cobrança de R\$\s197,00/);
    expect(gate.body).not.toContain("http");
  });

  it.each(["sem_conexao", "conexao_desabilitada", "credencial_incompleta", "cifra_indisponivel"])(
    "sem conta de cobrança utilizável (%s): falha com a instrução, nada é enviado",
    async (motivo) => {
      lerCredencialDeCobranca.mockResolvedValueOnce({ ok: false, motivo });
      const send = vi.fn(async (_e: Envio) => OK);
      await expect(criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" })).rejects.toThrow(/cobranca_sem_conexao/);
      expect(send).not.toHaveBeenCalled();
      expect(cobrar).not.toHaveBeenCalled();
    },
  );

  it("o provedor recusando propaga o erro (passo falha visível, com a causa do Asaas) e nada é enviado", async () => {
    cobrar.mockRejectedValueOnce(new Error("O Asaas recusou a cobrança: CPF ou CNPJ é obrigatório"));
    const send = vi.fn(async (_e: Envio) => OK);
    await expect(criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" })).rejects.toThrow(/CPF ou CNPJ/);
    expect(send).not.toHaveBeenCalled();
  });

  it("sem copia-e-cola, só o link sai", async () => {
    cobrar.mockResolvedValueOnce({ id: "p", link: "https://asaas/i/p", pixCopiaECola: null, reaproveitada: false });
    const send = vi.fn(async (_e: Envio) => OK);
    await criarHandler(deps(send))(job([cobranca()]), fakePool(), { workerId: "w1" });
    expect(enviosDe(send)).toHaveLength(1);
  });
});
