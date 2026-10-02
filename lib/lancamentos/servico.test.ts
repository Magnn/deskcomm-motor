/**
 * O link único e os grupos. O que se cobra: ninguém é mandado para grupo lotado,
 * o próximo grupo abre ANTES de faltar vaga, dois cliques simultâneos não criam
 * dois grupos, e um lançamento não nasce sem grupo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { criarBancoEmMemoria, type BancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/channels/numeros-para-grupos", () => ({
  lerSessaoDeGrupos: vi.fn(async (_db: unknown, _org: string, id: string) =>
    sessoes[id] ? { channelSessionId: id, sessionName: `sessao-${id}`, conectado: sessoes[id] === "conectado" } : null,
  ),
}));

const { abrirProximoGrupo, criarLancamento, LancamentoError, manterLancamento, resolverLinkPublico } = await import("./servico");
type Lancamento = import("./servico").Lancamento;

let sessoes: Record<string, "conectado" | "desconectado">;
let banco: BancoEmMemoria;
let membrosNoWhatsapp: Record<string, number>;
let criados: number;

const ORG = "org-1";
const NUMERO = "numero-1";

const UNICOS = {
  group_launch_groups: [["launch_id", "position"]],
  group_launches: [["slug"]],
};

function whatsapp(mudancas: Partial<Record<string, unknown>> = {}) {
  return {
    createGroup: vi.fn(async () => {
      criados++;
      const id = `12036300000000${criados}@g.us`;
      membrosNoWhatsapp[id] = 2;
      return { id };
    }),
    getGroupInfo: vi.fn(async (_s: string, id: string) => ({ membros: membrosNoWhatsapp[id] ?? 0, nome: null })),
    getGroupInviteCode: vi.fn(async (_s: string, id: string) => `ConviteDoGrupoNovo${id.replace(/\D/g, "").slice(-3)}`),
    setGroupDescription: vi.fn(async () => undefined),
    setGroupAdminsOnly: vi.fn(async () => undefined),
    ...mudancas,
  } as never;
}

const lancamento = (mudancas: Partial<Lancamento> = {}): Lancamento => ({
  id: "lanc-1",
  organization_id: ORG,
  channel_session_id: NUMERO,
  name: "Aulão",
  slug: "aulao",
  group_name_template: "Aulão #{n}",
  group_description: "Regras do grupo",
  group_capacity: 100,
  admins_only: true,
  seed_participant: "5511999990000",
  status: "active",
  created_at: "2026-10-02T12:00:00Z",
  ...mudancas,
});

const grupo = (position: number, members_count: number, mudancas: Record<string, unknown> = {}) => ({
  id: `grupo-${position}`,
  organization_id: ORG,
  launch_id: "lanc-1",
  position,
  wa_group_id: `12036399999999${position}@g.us`,
  name: `Aulão #${position}`,
  invite_url: `https://chat.whatsapp.com/ConviteAntigo${position}xx`,
  members_count,
  members_checked_at: new Date().toISOString(),
  status: "open",
  ...mudancas,
});

beforeEach(() => {
  vi.clearAllMocks();
  sessoes = { [NUMERO]: "conectado" };
  membrosNoWhatsapp = {};
  criados = 0;
  banco = criarBancoEmMemoria({ group_launches: [lancamento()], group_launch_groups: [], group_launch_clicks: [] }, UNICOS);
});

describe("abrir o próximo grupo", () => {
  it("cria no WhatsApp com o nome numerado e o número de apoio, e grava convite, contagem e 'só admin'", async () => {
    const wa = whatsapp();
    const g = await abrirProximoGrupo(banco.cliente as never, wa, lancamento());

    expect((wa as { createGroup: ReturnType<typeof vi.fn> }).createGroup).toHaveBeenCalledWith(`sessao-${NUMERO}`, "Aulão #1", ["5511999990000"]);
    expect(g).toMatchObject({ position: 1, name: "Aulão #1", status: "open", members_count: 2 });
    expect(g?.invite_url).toMatch(/^https:\/\/chat\.whatsapp\.com\//);
    expect((wa as { setGroupAdminsOnly: ReturnType<typeof vi.fn> }).setGroupAdminsOnly).toHaveBeenCalledWith(`sessao-${NUMERO}`, g!.wa_group_id, true);
    expect((wa as { setGroupDescription: ReturnType<typeof vi.fn> }).setGroupDescription).toHaveBeenCalled();
  });

  it("⭐ dois cliques ao mesmo tempo: só UM cria o grupo — o outro encontra a posição reservada", async () => {
    const wa = whatsapp();
    // A segunda chamada chega depois de a primeira reservar a posição 1.
    banco.tabelas.group_launch_groups!.push(grupo(1, 0, { wa_group_id: "reserva:abc", status: "closed", invite_url: null }));
    banco.tabelas.group_launch_groups![0]!.position = 1;
    // Simula a corrida: a leitura não vê a reserva, mas o índice único vê.
    const original = banco.cliente.from;
    let primeiraLeitura = true;
    banco.cliente.from = ((tabela: string) => {
      const q = original(tabela);
      if (tabela === "group_launch_groups" && primeiraLeitura) {
        primeiraLeitura = false;
        return original("tabela_vazia");
      }
      return q;
    }) as never;

    expect(await abrirProximoGrupo(banco.cliente as never, wa, lancamento())).toBeNull();
    expect((wa as { createGroup: ReturnType<typeof vi.fn> }).createGroup).not.toHaveBeenCalled();
  });

  it("o WhatsApp recusou: a reserva é desfeita e o erro diz o que conferir", async () => {
    const wa = whatsapp({ createGroup: vi.fn(async () => { throw new Error("transporte_400"); }) });
    await expect(abrirProximoGrupo(banco.cliente as never, wa, lancamento())).rejects.toMatchObject({ code: "grupo_nao_criado" });
    expect(banco.tabelas.group_launch_groups).toHaveLength(0);
  });

  it("acabamento que falha (descrição, só admin, convite) NÃO perde o grupo criado", async () => {
    const wa = whatsapp({
      setGroupDescription: vi.fn(async () => { throw new Error("transporte_500"); }),
      setGroupAdminsOnly: vi.fn(async () => { throw new Error("transporte_500"); }),
      getGroupInviteCode: vi.fn(async () => { throw new Error("transporte_500"); }),
    });
    const g = await abrirProximoGrupo(banco.cliente as never, wa, lancamento());
    expect(g).toMatchObject({ status: "open", invite_url: null });
    expect(g?.wa_group_id).toMatch(/@g\.us$/);
  });

  it("número desconectado ou que não faz grupo: recusa antes de falar com o WhatsApp", async () => {
    const wa = whatsapp();
    sessoes[NUMERO] = "desconectado";
    await expect(abrirProximoGrupo(banco.cliente as never, wa, lancamento())).rejects.toMatchObject({ code: "numero_desconectado" });
    sessoes = {};
    await expect(abrirProximoGrupo(banco.cliente as never, wa, lancamento())).rejects.toMatchObject({ code: "numero_invalido" });
    expect((wa as { createGroup: ReturnType<typeof vi.fn> }).createGroup).not.toHaveBeenCalled();
  });
});

describe("criar o lançamento", () => {
  const input = {
    name: "Semana do Açaí",
    channel_session_id: NUMERO,
    group_name_template: "Semana do Açaí #{n}",
    group_capacity: 900,
    admins_only: true,
    seed_participant: "+55 (11) 99999-0000",
  };

  it("nasce com o primeiro grupo, o slug do nome e o número de apoio só com dígitos", async () => {
    banco = criarBancoEmMemoria({ group_launches: [], group_launch_groups: [] }, UNICOS);
    const r = await criarLancamento(banco.cliente as never, whatsapp(), { organizationId: ORG, userId: "u1", input });
    expect(r.lancamento).toMatchObject({ slug: "semana-do-acai", seed_participant: "5511999990000", name: "Semana do Açaí" });
    expect(r.grupo.position).toBe(1);
  });

  it("slug já usado ganha um sufixo — dois lançamentos não dividem o link", async () => {
    banco = criarBancoEmMemoria({ group_launches: [lancamento({ slug: "semana-do-acai" })], group_launch_groups: [] }, UNICOS);
    const r = await criarLancamento(banco.cliente as never, whatsapp(), { organizationId: ORG, userId: "u1", input });
    expect(r.lancamento.slug).toMatch(/^semana-do-acai-[0-9a-f]{6}$/);
  });

  it("⭐ o WhatsApp recusou o primeiro grupo: o lançamento NÃO fica — link sem grupo não leva a lugar nenhum", async () => {
    banco = criarBancoEmMemoria({ group_launches: [], group_launch_groups: [] }, UNICOS);
    const wa = whatsapp({ createGroup: vi.fn(async () => { throw new Error("transporte_400"); }) });
    await expect(criarLancamento(banco.cliente as never, wa, { organizationId: ORG, userId: "u1", input })).rejects.toBeInstanceOf(LancamentoError);
    expect(banco.tabelas.group_launches).toHaveLength(0);
  });

  it("número de apoio que não é telefone: recusa sem criar nada", async () => {
    banco = criarBancoEmMemoria({ group_launches: [], group_launch_groups: [] }, UNICOS);
    await expect(
      criarLancamento(banco.cliente as never, whatsapp(), { organizationId: ORG, userId: "u1", input: { ...input, seed_participant: "123" } }),
    ).rejects.toMatchObject({ code: "participante_invalido" });
    expect(banco.tabelas.group_launches).toHaveLength(0);
  });
});

describe("o link público", () => {
  it("manda para o grupo com vaga e registra o clique", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 40));
    const d = await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao");
    expect(d).toEqual({ tipo: "grupo", url: "https://chat.whatsapp.com/ConviteAntigo1xx" });
    expect(banco.tabelas.group_launch_clicks).toHaveLength(1);
    expect(banco.tabelas.group_launch_clicks![0]).toMatchObject({ launch_id: "lanc-1", group_id: "grupo-1" });
  });

  it("⭐ contagem velha é relida: grupo que LOTOU desde a última olhada não recebe mais ninguém", async () => {
    const velho = new Date(Date.now() - 5 * 60_000).toISOString();
    banco.tabelas.group_launch_groups!.push(grupo(1, 40, { members_checked_at: velho }), grupo(2, 0));
    membrosNoWhatsapp["120363999999991@g.us"] = 100; // lotou
    const d = await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao");
    expect(d).toEqual({ tipo: "grupo", url: "https://chat.whatsapp.com/ConviteAntigo2xx" });
    expect(banco.tabelas.group_launch_groups![0]).toMatchObject({ members_count: 100, status: "full" });
  });

  it("⭐ vagas no fim: o próximo grupo é aberto no próprio clique, e quem clica ainda entra no atual", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 85));
    const wa = whatsapp();
    const d = await resolverLinkPublico(banco.cliente as never, wa, "aulao");
    expect(d).toEqual({ tipo: "grupo", url: "https://chat.whatsapp.com/ConviteAntigo1xx" });
    expect((wa as { createGroup: ReturnType<typeof vi.fn> }).createGroup).toHaveBeenCalledWith(expect.any(String), "Aulão #2", expect.any(Array));
    expect(banco.tabelas.group_launch_groups).toHaveLength(2);
  });

  it("tudo lotado: abre um grupo e já manda para ele", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 100, { status: "full" }));
    const d = await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao");
    expect(d.tipo).toBe("grupo");
    expect(banco.tabelas.group_launch_groups).toHaveLength(2);
  });

  it("lotado e sem conseguir abrir outro (número fora do ar): página de espera, não um convite recusado", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 100, { status: "full" }));
    sessoes[NUMERO] = "desconectado";
    expect(await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao")).toEqual({ tipo: "indisponivel", motivo: "sem_vaga" });
    // O clique é contado mesmo assim: é demanda que o lançamento perdeu.
    expect(banco.tabelas.group_launch_clicks![0]).toMatchObject({ group_id: null });
  });

  it("WhatsApp fora do ar na releitura: vale a última contagem, e o link segue funcionando", async () => {
    const velho = new Date(Date.now() - 5 * 60_000).toISOString();
    banco.tabelas.group_launch_groups!.push(grupo(1, 40, { members_checked_at: velho }));
    const wa = whatsapp({ getGroupInfo: vi.fn(async () => { throw new Error("transporte_sem_resposta"); }) });
    expect(await resolverLinkPublico(banco.cliente as never, wa, "aulao")).toMatchObject({ tipo: "grupo" });
  });

  it("pausado, encerrado ou inexistente: nenhum convite sai", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 10));
    banco.tabelas.group_launches![0]!.status = "paused";
    expect(await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao")).toEqual({ tipo: "indisponivel", motivo: "pausado" });
    banco.tabelas.group_launches![0]!.status = "archived";
    expect(await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao")).toEqual({ tipo: "indisponivel", motivo: "nao_existe" });
    expect(await resolverLinkPublico(banco.cliente as never, whatsapp(), "outro")).toEqual({ tipo: "indisponivel", motivo: "nao_existe" });
    expect(banco.tabelas.group_launch_clicks).toHaveLength(0);
  });

  it("grupo fechado à mão sai do link", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 10, { status: "closed" }), grupo(2, 10));
    expect(await resolverLinkPublico(banco.cliente as never, whatsapp(), "aulao")).toEqual({
      tipo: "grupo",
      url: "https://chat.whatsapp.com/ConviteAntigo2xx",
    });
  });
});

describe("a manutenção da rodada", () => {
  it("relê a contagem de cada grupo e abre o próximo quando as vagas estão no fim", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 10), grupo(2, 0, { status: "closed" }));
    membrosNoWhatsapp["120363999999991@g.us"] = 95;
    const r = await manterLancamento(banco.cliente as never, whatsapp(), lancamento());
    expect(r).toEqual({ atualizados: 1, abriu: true });
    expect(banco.tabelas.group_launch_groups![0]).toMatchObject({ members_count: 95, status: "open" });
    expect(banco.tabelas.group_launch_groups).toHaveLength(3);
  });

  it("reserva esquecida (criação que morreu no meio) é limpa; reserva recente fica", async () => {
    const velha = new Date(Date.now() - 10 * 60_000).toISOString();
    banco.tabelas.group_launch_groups!.push(
      grupo(1, 10),
      grupo(2, 0, { wa_group_id: "reserva:velha", status: "closed", invite_url: null, created_at: velha }),
      grupo(3, 0, { wa_group_id: "reserva:nova", status: "closed", invite_url: null, created_at: new Date().toISOString() }),
    );
    membrosNoWhatsapp["120363999999991@g.us"] = 10;
    await manterLancamento(banco.cliente as never, whatsapp(), lancamento());
    expect(banco.tabelas.group_launch_groups!.map((g) => g.wa_group_id)).toEqual(["120363999999991@g.us", "reserva:nova"]);
  });

  it("número desconectado: não mexe em nada", async () => {
    banco.tabelas.group_launch_groups!.push(grupo(1, 99));
    sessoes[NUMERO] = "desconectado";
    expect(await manterLancamento(banco.cliente as never, whatsapp(), lancamento())).toEqual({ atualizados: 0, abriu: false });
  });
});
