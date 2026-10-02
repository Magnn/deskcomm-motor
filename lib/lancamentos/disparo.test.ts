/**
 * O disparo para os grupos. O que se cobra: cada grupo recebe UMA vez, a falha de
 * um grupo não segura os outros, o que não cabe numa rodada continua na seguinte
 * sem repetir ninguém, e lançamento pausado segura o envio sem perdê-lo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoEmMemoria, type BancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/channels/numeros-para-grupos", () => ({
  lerSessaoDeGrupos: vi.fn(async () => (conectado ? { channelSessionId: "numero-1", sessionName: "sessao-1", conectado: true } : { channelSessionId: "numero-1", sessionName: "sessao-1", conectado: false })),
}));

const { enviarItensAoGrupo, ORCAMENTO_DA_RODADA_MS, rodarDisparosVencidos } = await import("./disparo");

const ORG = "org-1";
const AGORA = new Date("2026-10-02T15:00:00.000Z");

let conectado: boolean;
let banco: BancoEmMemoria;
let relogio: number;
let enviosDeTexto: Array<{ grupo: string; texto: string }>;
let enviosDeMidia: Array<{ grupo: string; endpoint: string; payload: Record<string, unknown> }>;
let falharNoGrupo: string | null;

function deps(mudancas: Record<string, unknown> = {}) {
  return {
    admin: banco.cliente as never,
    whatsapp: {
      sendMessage: vi.fn(async (_s: string, grupo: string, texto: string) => {
        if (grupo === falharNoGrupo) throw new Error("waha_500");
        enviosDeTexto.push({ grupo, texto });
      }),
      sendMedia: vi.fn(async (_s: string, grupo: string, plan: { endpoint: string; payload: Record<string, unknown> }) => {
        enviosDeMidia.push({ grupo, endpoint: plan.endpoint, payload: plan.payload });
      }),
    },
    urlDaMidia: vi.fn(async (caminho: string) => `https://storage.test/${caminho}?assinada`),
    agora: () => new Date(relogio),
    dormir: vi.fn(async (ms: number) => {
      relogio += ms;
    }),
    rng: () => 0,
    ...mudancas,
  };
}

const grupo = (n: number, mudancas: Record<string, unknown> = {}) => ({
  id: `grupo-${n}`,
  organization_id: ORG,
  launch_id: "lanc-1",
  position: n,
  wa_group_id: `12036300000000${n}@g.us`,
  name: `Aulão #${n}`,
  invite_url: null,
  members_count: 10,
  members_checked_at: null,
  status: "open",
  ...mudancas,
});

const disparo = (mudancas: Record<string, unknown> = {}) => ({
  id: "disp-1",
  organization_id: ORG,
  launch_id: "lanc-1",
  items: [{ type: "text", body: "Começamos em 10 minutos!" }],
  scheduled_at: "2026-10-02T14:59:00.000Z",
  status: "scheduled",
  claimed_until: null,
  started_at: null,
  finished_at: null,
  ...mudancas,
});

function montar(p: { grupos?: Array<Record<string, unknown>>; disparos?: Array<Record<string, unknown>>; status?: string; entregas?: Array<Record<string, unknown>> } = {}) {
  banco = criarBancoEmMemoria({
    group_launches: [{ id: "lanc-1", organization_id: ORG, channel_session_id: "numero-1", status: p.status ?? "active" }],
    group_launch_groups: p.grupos ?? [grupo(1), grupo(2), grupo(3)],
    group_launch_broadcasts: p.disparos ?? [disparo()],
    group_launch_deliveries: p.entregas ?? [],
  });
}

const entregas = () => banco.tabelas.group_launch_deliveries!;
const oDisparo = () => banco.tabelas.group_launch_broadcasts![0]!;

beforeEach(() => {
  vi.clearAllMocks();
  conectado = true;
  relogio = AGORA.getTime();
  enviosDeTexto = [];
  enviosDeMidia = [];
  falharNoGrupo = null;
  montar();
});

describe("uma rodada", () => {
  it("manda para todos os grupos, um de cada vez, e fecha o disparo como enviado", async () => {
    const r = await rodarDisparosVencidos(deps());
    expect(r).toEqual({ disparos: 1, enviados: 3, falhas: 0, concluidos: 1 });
    expect(enviosDeTexto.map((e) => e.grupo)).toEqual(["120363000000001@g.us", "120363000000002@g.us", "120363000000003@g.us"]);
    expect(oDisparo()).toMatchObject({ status: "sent", claimed_until: null });
    expect(oDisparo().finished_at).toBeTruthy();
    expect(entregas().every((e) => e.status === "sent")).toBe(true);
  });

  it("⭐ rodar de novo NÃO manda de novo: o disparo já fechou e cada grupo tem desfecho", async () => {
    await rodarDisparosVencidos(deps());
    const segunda = await rodarDisparosVencidos(deps());
    expect(segunda).toEqual({ disparos: 0, enviados: 0, falhas: 0, concluidos: 0 });
    expect(enviosDeTexto).toHaveLength(3);
  });

  it("disparo com hora no futuro não sai", async () => {
    montar({ disparos: [disparo({ scheduled_at: "2026-10-02T15:30:00.000Z" })] });
    expect((await rodarDisparosVencidos(deps())).disparos).toBe(0);
    expect(enviosDeTexto).toHaveLength(0);
  });

  it("disparo reservado por outra rodada (prazo ainda valendo) é pulado; reserva vencida é retomada", async () => {
    montar({ disparos: [disparo({ status: "sending", claimed_until: "2026-10-02T15:04:00.000Z" })] });
    expect((await rodarDisparosVencidos(deps())).disparos).toBe(0);
    montar({ disparos: [disparo({ status: "sending", claimed_until: "2026-10-02T14:58:00.000Z" })] });
    expect((await rodarDisparosVencidos(deps())).enviados).toBe(3);
  });

  it("⭐ a falha de UM grupo não segura os outros, e fica registrada com o motivo", async () => {
    falharNoGrupo = "120363000000002@g.us";
    const r = await rodarDisparosVencidos(deps());
    expect(r).toMatchObject({ enviados: 2, falhas: 1, concluidos: 1 });
    expect(entregas().find((e) => e.group_id === "grupo-2")).toMatchObject({ status: "failed", error: "waha_500" });
    // Chegou a algum grupo: o disparo é "enviado"; as falhas aparecem por grupo.
    expect(oDisparo().status).toBe("sent");
  });

  it("falhou em TODOS os grupos: o disparo fecha como falho", async () => {
    const d = deps({ whatsapp: { sendMessage: vi.fn(async () => { throw new Error("waha_500"); }), sendMedia: vi.fn() } });
    const r = await rodarDisparosVencidos(d);
    expect(r).toMatchObject({ enviados: 0, falhas: 3 });
    expect(oDisparo().status).toBe("failed");
  });

  it("⭐ o que não cabe no tempo da rodada continua na SEGUINTE, sem repetir grupo", async () => {
    // Cada envio "demora" mais que o orçamento: só o primeiro grupo cabe.
    const lento = deps();
    lento.whatsapp.sendMessage = vi.fn(async (_s: string, grupo: string, texto: string) => {
      enviosDeTexto.push({ grupo, texto });
      relogio += ORCAMENTO_DA_RODADA_MS + 1;
    });
    const primeira = await rodarDisparosVencidos(lento);
    expect(primeira).toMatchObject({ enviados: 1, concluidos: 0 });
    expect(oDisparo()).toMatchObject({ status: "sending", claimed_until: null });

    relogio = AGORA.getTime() + 60_000;
    const segunda = await rodarDisparosVencidos(deps());
    expect(segunda).toMatchObject({ enviados: 2, concluidos: 1 });
    expect(enviosDeTexto.map((e) => e.grupo)).toEqual(["120363000000001@g.us", "120363000000002@g.us", "120363000000003@g.us"]);
  });

  it("⭐ entrega que ficou marcada como interrompida NÃO é reenviada — evita mandar em dobro para um grupo inteiro", async () => {
    montar({
      disparos: [disparo({ status: "sending", claimed_until: "2026-10-02T14:58:00.000Z" })],
      entregas: [{ id: "e1", organization_id: ORG, broadcast_id: "disp-1", group_id: "grupo-1", status: "failed", error: "interrompido" }],
    });
    await rodarDisparosVencidos(deps());
    expect(enviosDeTexto.map((e) => e.grupo)).toEqual(["120363000000002@g.us", "120363000000003@g.us"]);
    expect(entregas().find((e) => e.group_id === "grupo-1")).toMatchObject({ status: "failed", error: "interrompido" });
  });

  it("grupo fechado à mão e posição ainda em reserva não recebem", async () => {
    montar({ grupos: [grupo(1), grupo(2, { status: "closed" }), grupo(3, { wa_group_id: "reserva:abc", status: "closed" }), grupo(4, { status: "full" })] });
    await rodarDisparosVencidos(deps());
    expect(enviosDeTexto.map((e) => e.grupo)).toEqual(["120363000000001@g.us", "120363000000004@g.us"]);
  });

  it("⭐ lançamento pausado ou número fora do ar: o disparo ESPERA — não falha nem se perde", async () => {
    montar({ status: "paused" });
    expect(await rodarDisparosVencidos(deps())).toMatchObject({ enviados: 0, concluidos: 0 });
    expect(oDisparo()).toMatchObject({ status: "sending", claimed_until: null });

    montar();
    conectado = false;
    await rodarDisparosVencidos(deps());
    expect(enviosDeTexto).toHaveLength(0);
    expect(oDisparo().status).toBe("sending");

    conectado = true;
    relogio += 60_000;
    expect((await rodarDisparosVencidos(deps())).enviados).toBe(3);
  });

  it("lançamento encerrado ou sem grupo nenhum: o disparo fecha como falho", async () => {
    montar({ status: "archived" });
    await rodarDisparosVencidos(deps());
    expect(oDisparo().status).toBe("failed");
    montar({ grupos: [] });
    await rodarDisparosVencidos(deps());
    expect(oDisparo().status).toBe("failed");
  });

  it("conteúdo inválido no banco não derruba a rodada: fecha como falho e não manda nada", async () => {
    montar({ disparos: [disparo({ items: [{ type: "desconhecido" }] })] });
    await rodarDisparosVencidos(deps());
    expect(oDisparo().status).toBe("failed");
    expect(enviosDeTexto).toHaveLength(0);
  });

  it("há pausa entre um grupo e o seguinte, mas não antes do primeiro", async () => {
    const d = deps();
    await rodarDisparosVencidos(d);
    expect((d.dormir as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([2500, 2500]);
  });
});

describe("a sequência dentro de um grupo", () => {
  it("texto, mídia com legenda e pausa, na ordem — a mídia vai por URL assinada", async () => {
    const d = deps();
    await enviarItensAoGrupo(d, "sessao-1", "g@g.us", [
      { type: "text", body: "Olha isso" },
      { type: "delay", seconds: 3 },
      { type: "image", storage_path: "org-1/launch-content/lanc-1/foto.jpg", mime: "image/jpeg", caption: "A capa" },
      { type: "document", storage_path: "org-1/launch-content/lanc-1/guia.pdf", mime: "application/pdf", filename: "Guia.pdf" },
      { type: "audio", storage_path: "org-1/launch-content/lanc-1/voz.ogg", mime: "audio/ogg" },
    ]);
    expect(enviosDeTexto).toEqual([{ grupo: "g@g.us", texto: "Olha isso" }]);
    expect(enviosDeMidia.map((m) => m.endpoint)).toEqual(["sendImage", "sendFile", "sendVoice"]);
    expect(enviosDeMidia[0]!.payload).toMatchObject({ caption: "A capa", file: { url: expect.stringContaining("foto.jpg?assinada"), mimetype: "image/jpeg" } });
    expect(enviosDeMidia[1]!.payload).toMatchObject({ file: { filename: "Guia.pdf" } });
    // 3s da pausa pedida + a pausa curta entre mensagens seguidas.
    expect((d.dormir as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual([3000, 800, 800, 800]);
  });

  it("mídia que não dá para assinar interrompe a sequência — não manda o resto fora de ordem", async () => {
    const d = deps({ urlDaMidia: vi.fn(async () => null) });
    await expect(
      enviarItensAoGrupo(d, "sessao-1", "g@g.us", [
        { type: "image", storage_path: "x/y.jpg", mime: "image/jpeg" },
        { type: "text", body: "depois" },
      ]),
    ).rejects.toThrow("midia_indisponivel");
    expect(enviosDeTexto).toHaveLength(0);
  });
});
