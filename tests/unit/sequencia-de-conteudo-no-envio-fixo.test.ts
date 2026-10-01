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
 *   5. vídeo e documento saem como mídia, com legenda; o documento leva o nome
 *      ORIGINAL do arquivo como último segmento do path (é o que o cliente vê);
 *   9. variáveis do contato (`{{nome}}`, `{{etapa}}`…) são trocadas antes do
 *      portão, e a etapa só é consultada quando citada;
 *   6. um `send` que devolve um kind fora de OK_KINDS para a sequência ali
 *      (não manda os itens seguintes);
 *   7. contato vira UM send com `contact` (nome + telefone), sem mídia;
 *   8. figurinha é copiada pra conversa e sai com `kind: 'sticker'`, sem legenda.
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
    context: { contact: { name: "Maria Silva", phone: "+5511988887777", email: null, tags: [], is_blocked: false } },
    lgpd: { isAnonymized: false, isProspecting: false, legalBasis: {} },
  })),
}));

vi.mock("@/lib/agent-engine/edge/crm/send-message", () => ({
  applySendOutcome: vi.fn(async () => undefined),
}));

const storageCopy = vi.fn(async (_origem: string, _destino: string) => ({ error: null as { message: string; statusCode?: string } | null }));
const storageUpload = vi.fn(async (_destino: string, _bytes: Buffer, _opts: { contentType: string }) => ({ error: null as { message: string } | null }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => ({ copy: storageCopy, upload: storageUpload }) } }),
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

/** As consultas à etapa do lead feitas neste teste — para provar que ela só é buscada quando citada. */
const consultasDeEtapa = vi.fn();

function fakePool(etapa: string | null = null, campos: Record<string, unknown> | null = null) {
  const query = vi.fn(async (sql: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    if (sql.includes("d.fechada_em::text")) return { rows: [{ ...boundary, status: "open", demanda_fechada_em: null }] };
    if (/from conversations/.test(sql)) {
      return { rows: [{ id: CONVERSA, channel_session_id: CANAL, archived_at: null }] };
    }
    if (sql.includes("crm_stages")) {
      consultasDeEtapa();
      return { rows: etapa === null && campos === null ? [] : [{ name: etapa, custom_fields: campos }] };
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
  contact?: { name: string; phoneNumber: string };
}
function fakeChannelSend(resultado: { kind: string; idempotencyKey: string; messageId: string | null }) {
  return vi.fn(async (_input: EnvioDeItem) => resultado);
}

function deps(channelSend: ReturnType<typeof vi.fn>, baixarMidiaDoLink?: ReturnType<typeof vi.fn>) {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    crmCfg: {},
    llmCfg: {},
    knobs: {},
    sleep: vi.fn(async () => undefined),
    channel: () => ({ send: channelSend }),
    completeFollowupTurn: vi.fn(async () => undefined),
    ...(baixarMidiaDoLink ? { baixarMidiaDoLink } : {}),
  } as never;
}

let criarHandler: typeof import("@/lib/agent-engine/agent/followup-turn").createFollowupTurnHandler;

beforeAll(async () => {
  ({ createFollowupTurnHandler: criarHandler } = await import("@/lib/agent-engine/agent/followup-turn"));
}, 60_000);

beforeEach(() => {
  runBeforeSend.mockClear();
  storageCopy.mockClear();
  storageUpload.mockClear();
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

  it("contato vira UM send com o cartão (nome + telefone), sem mídia, com seq próprio", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "text", body: "Fale com o nosso suporte:" },
        { type: "contact", name: "Suporte", phone_number: "+5511999998888" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(2);
    const cartao = channelSend.mock.calls[1]![0];
    expect(cartao.seq).toBe(2);
    expect(cartao.contact).toEqual({ name: "Suporte", phoneNumber: "+5511999998888" });
    expect(cartao.media).toBeUndefined();
    // Cartão não é mídia: nada é copiado no Storage por causa dele.
    expect(storageCopy).not.toHaveBeenCalled();
  });

  it("cartão de contato aceita variáveis no nome e no telefone", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([{ type: "contact", name: "Contato de {{primeiro_nome}}", phone_number: "{{telefone}}" }]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[0]![0].contact).toEqual({
      name: "Contato de Maria",
      phoneNumber: "+5511988887777",
    });
  });

  it("cartão cujo telefone some depois das variáveis não é enviado — o canal recusaria", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        // `{{email}}` é null neste contato: o telefone fica vazio.
        { type: "contact", name: "Suporte", phone_number: "{{email}}" },
        { type: "text", body: "Segue" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[0]![0].contact).toBeUndefined();
  });

  it("imagem por CAMPO DE FLUXO: a variável vira o link, o arquivo é baixado, guardado na conversa e enviado", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const baixar = vi.fn(async (_url: string, _tipo: string) => ({
      ok: true as const,
      buffer: Buffer.from("bytes-da-imagem"),
      mime: "image/jpeg",
      nome: "foto.jpg",
    }));
    await criarHandler(deps(channelSend, baixar))(
      job([{ type: "image", url: "{{url_imagem_lead}}", caption: "Para {{primeiro_nome}}" }]),
      fakePool(null, { url_imagem_lead: "https://cdn.publico.teste/lead-7.jpg", _notes: [{ id: 1 }] }),
      ctx,
    );
    // A variável foi resolvida pelos campos do lead ANTES do download.
    expect(baixar).toHaveBeenCalledWith("https://cdn.publico.teste/lead-7.jpg", "image");
    // Guardada na pasta da CONVERSA — nunca enviada como link cru ao canal.
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(storageUpload.mock.calls[0]![0]).toBe(`${ORG}/${CONVERSA}/conteudo-job-1-1.jpg`);
    expect(storageCopy).not.toHaveBeenCalled();
    const envio = channelSend.mock.calls[0]![0];
    expect(envio.body).toBe("Para Maria");
    expect(envio.media).toMatchObject({ storagePath: `${ORG}/${CONVERSA}/conteudo-job-1-1.jpg`, mime: "image/jpeg", kind: "image" });
  });

  it("documento por LINK chega com o nome do arquivo do link", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const baixar = vi.fn(async () => ({ ok: true as const, buffer: Buffer.from("pdf"), mime: "application/pdf", nome: "Tabela de Preços.pdf" }));
    await criarHandler(deps(channelSend, baixar))(
      job([{ type: "document", url: "https://arquivos.publico.teste/Tabela%20de%20Pre%C3%A7os.pdf" }]),
      fakePool(),
      ctx,
    );
    expect(channelSend.mock.calls[0]![0].media).toMatchObject({
      storagePath: `${ORG}/${CONVERSA}/conteudo-job-1-1/Tabela_de_Precos.pdf`,
      kind: "document",
    });
  });

  it("link que não baixa PULA o item e a sequência segue — nunca derruba o turno", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const baixar = vi.fn(async () => ({ ok: false as const, motivo: "unsafe_url:private_ip" }));
    await criarHandler(deps(channelSend, baixar))(
      job([
        { type: "image", url: "https://interno.teste/a.jpg" },
        { type: "text", body: "Segue o texto" },
      ]),
      fakePool(),
      ctx,
    );
    expect(storageUpload).not.toHaveBeenCalled();
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[0]![0].seq).toBe(1);
  });

  it("campo de fluxo vazio ou inexistente: nem tenta baixar", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    const baixar = vi.fn(async () => ({ ok: true as const, buffer: Buffer.from("x"), mime: "image/jpeg", nome: null }));
    await criarHandler(deps(channelSend, baixar))(
      job([
        { type: "image", url: "{{campo_que_nao_existe}}" },
        { type: "image", url: "{{campo_vazio}}" },
        { type: "text", body: "Só o texto sai" },
      ]),
      fakePool(null, { campo_vazio: "" }),
      ctx,
    );
    expect(baixar).not.toHaveBeenCalled();
    expect(channelSend).toHaveBeenCalledTimes(1);
  });

  it("campo de fluxo também vale em TEXTO", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "text", body: "Primeira" },
        { type: "text", body: "Você escolheu o plano {{plano}}." },
      ]),
      fakePool(null, { plano: "Ouro" }),
      ctx,
    );
    expect(channelSend.mock.calls[1]![0].body).toBe("Você escolheu o plano Ouro.");
  });

  it("a TRANSCRIÇÃO do áudio vai no body da mensagem (fica na conversa; nenhum canal a envia como legenda)", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "audio", storage_path: `${ORG}/flow-content/f/a.ogg`, mime: "audio/ogg", transcript: "Oi, aqui é do suporte." },
        { type: "audio", storage_path: `${ORG}/flow-content/f/b.ogg`, mime: "audio/ogg" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend.mock.calls[0]![0].body).toBe("Oi, aqui é do suporte.");
    // Sem transcrição o body segue vazio, como sempre foi.
    expect(channelSend.mock.calls[1]![0].body).toBe("");
  });

  it("áudio com 'enviar como áudio gravado?' DESLIGADO sai como arquivo, com o nome original", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "audio", storage_path: `${ORG}/flow-content/f/a.mp3`, mime: "audio/mpeg", voice_note: false, filename: "Aula 01.mp3" },
        { type: "audio", storage_path: `${ORG}/flow-content/f/b.ogg`, mime: "audio/ogg" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(2);
    const arquivo = channelSend.mock.calls[0]![0] as unknown as { media: { kind: string; audioAsFile?: boolean; storagePath: string } };
    expect(arquivo.media.kind).toBe("audio");
    expect(arquivo.media.audioAsFile).toBe(true);
    expect(arquivo.media.storagePath).toBe(`${ORG}/${CONVERSA}/conteudo-job-1-1/Aula_01.mp3`);
    // Controle: sem a opção, continua nota de voz — o comportamento de sempre.
    const notaDeVoz = channelSend.mock.calls[1]![0] as unknown as { media: { kind: string; audioAsFile?: boolean; storagePath: string } };
    expect(notaDeVoz.media.kind).toBe("audio");
    expect(notaDeVoz.media.audioAsFile).toBeUndefined();
    expect(notaDeVoz.media.storagePath).toBe(`${ORG}/${CONVERSA}/conteudo-job-1-2.ogg`);
  });

  it("figurinha é copiada pra conversa e sai como mídia 'sticker', sem legenda", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([{ type: "sticker", storage_path: `${ORG}/flow-content/fluxo-1/fig.webp`, mime: "image/webp" }]),
      fakePool(),
      ctx,
    );
    expect(storageCopy).toHaveBeenCalledTimes(1);
    expect(channelSend).toHaveBeenCalledTimes(1);
    const envio = channelSend.mock.calls[0]![0];
    expect(envio.body).toBe("");
    expect(envio.media).toMatchObject({ mime: "image/webp", kind: "sticker" });
    expect(envio.media!.storagePath.startsWith(`${ORG}/${CONVERSA}/`)).toBe(true);
    expect(envio.media!.storagePath.endsWith(".webp")).toBe(true);
  });

  it("vídeo e documento saem como mídia, com a legenda no body e seq próprio", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "video", storage_path: `${ORG}/flow-content/f/v.mp4`, mime: "video/mp4", caption: "Veja o vídeo" },
        { type: "document", storage_path: `${ORG}/flow-content/f/x.pdf`, mime: "application/pdf", filename: "Proposta Comercial ção.pdf" },
      ]),
      fakePool(),
      ctx,
    );
    expect(storageCopy).toHaveBeenCalledTimes(2);
    expect(channelSend).toHaveBeenCalledTimes(2);
    const video = channelSend.mock.calls[0]![0];
    expect(video.seq).toBe(1);
    expect(video.body).toBe("Veja o vídeo");
    expect(video.media).toMatchObject({ mime: "video/mp4", kind: "video" });
    expect(video.media!.storagePath.endsWith(".mp4")).toBe(true);

    const doc = channelSend.mock.calls[1]![0];
    expect(doc.seq).toBe(2);
    expect(doc.body).toBe("");
    expect(doc.media).toMatchObject({ mime: "application/pdf", kind: "document" });
    // O ÚLTIMO segmento do path é o nome que o cliente vê: o original, em ASCII,
    // nunca `conteudo-<job>-<seq>.pdf`.
    expect(doc.media!.storagePath).toBe(`${ORG}/${CONVERSA}/conteudo-job-1-2/Proposta_Comercial_cao.pdf`);
  });

  it("documento sem nome utilizável cai no nome genérico, com a extensão do arquivo", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([{ type: "document", storage_path: `${ORG}/flow-content/f/x.pdf`, mime: "application/pdf" }]),
      fakePool(),
      ctx,
    );
    expect(channelSend.mock.calls[0]![0].media!.storagePath).toBe(`${ORG}/${CONVERSA}/conteudo-job-1-1.pdf`);
  });

  it("variáveis do contato são trocadas em texto e legenda ANTES do portão — nunca saem literais", async () => {
    consultasDeEtapa.mockClear();
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "text", body: "Olá {{primeiro_nome}}, tudo bem?" },
        { type: "text", body: "Seu número é {{telefone}} e o e-mail é {{email}}." },
        { type: "image", storage_path: `${ORG}/flow-content/f/a.jpg`, mime: "image/jpeg", caption: "Para {{nome}}" },
      ]),
      fakePool(),
      ctx,
    );
    // O portão recebeu o texto JÁ trocado (é o que ele avalia e o que de fato sai).
    expect((runBeforeSend.mock.calls[0]![0] as unknown as { body: string }).body).toBe("Olá Maria, tudo bem?");
    // e-mail é null neste contato: a variável some e a frase é arrumada.
    expect(channelSend.mock.calls[1]![0].body).toBe("Seu número é +5511988887777 e o e-mail é.");
    expect(channelSend.mock.calls[2]![0].body).toBe("Para Maria Silva");
    // Ninguém citou {{etapa}}: a consulta da etapa não é feita.
    expect(consultasDeEtapa).not.toHaveBeenCalled();
  });

  it("{{etapa}} busca a etapa atual do lead — e só quando é citada", async () => {
    consultasDeEtapa.mockClear();
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "delay", seconds: 1 },
        { type: "text", body: "Primeira" },
        { type: "text", body: "Você está em: {{etapa}}" },
      ]),
      fakePool("Proposta enviada"),
      ctx,
    );
    expect(consultasDeEtapa).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[1]![0].body).toBe("Você está em: Proposta enviada");
  });

  it("texto que era SÓ uma variável sem valor não vira bolha vazia: o item é pulado", async () => {
    const channelSend = fakeChannelSend({ kind: "sent", idempotencyKey: "k", messageId: "m" });
    await criarHandler(deps(channelSend))(
      job([
        { type: "text", body: "{{email}}" },
        { type: "text", body: "Segue o contato" },
      ]),
      fakePool(),
      ctx,
    );
    expect(channelSend).toHaveBeenCalledTimes(1);
    expect(channelSend.mock.calls[0]![0].seq).toBe(1);
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
