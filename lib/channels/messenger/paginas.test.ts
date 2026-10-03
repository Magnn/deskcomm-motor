import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_db: unknown, texto: string) => `cifrado(${texto})`),
  decryptWebhookSecret: vi.fn(async (_db: unknown, cifrado: string) => cifrado.replace(/^cifrado\(|\)$/g, "")),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { conectarPaginas, type DepsDaConexao } from "./conexao";
import { gravarPagina, paginasDaOrganizacao, sessaoDaPagina, tokenDaPagina } from "./paginas";
import type { PaginaAutorizada } from "./api";

const pagina = (p: Partial<PaginaAutorizada> = {}): PaginaAutorizada => ({
  id: "pg-1",
  name: "Loja",
  accessToken: "token-1",
  podeAtender: true,
  pictureUrl: null,
  ...p,
});

const banco = (linhas: object[] = []) => {
  // O índice único da 0911 é PARCIAL (só ativos): página + `archived_at` nulo
  // reproduz isso aqui — duas ativas colidem, uma ativa e uma excluída não.
  const b = criarBancoEmMemoria({ channel_sessions: linhas }, { channel_sessions: [["messenger_page_id", "archived_at"]] });
  return { b, db: b.cliente as unknown as SupabaseClient };
};

describe("gravarPagina", () => {
  beforeEach(() => vi.mocked(audit).mockClear());

  it("página nova vira canal do Messenger, com o token cifrado e a IA nascendo pausada", async () => {
    const { b, db } = banco();
    const r = await gravarPagina(db, { organizationId: "org-1", userId: "u", pagina: pagina() });
    expect(r.resultado).toBe("conectada");
    const [linha] = b.tabelas.channel_sessions ?? [];
    expect(linha).toMatchObject({
      organization_id: "org-1",
      provider: "meta_messenger",
      messenger_page_id: "pg-1",
      messenger_page_token_encrypted: "cifrado(token-1)",
      display_name: "Messenger · Loja",
    });
    expect((linha?.metadata as Record<string, unknown>).ai_gate_mode).toBe("pre_go_live");
    await expect(tokenDaPagina(db, { organizationId: "org-1", pageId: "pg-1" })).resolves.toBe("token-1");
    await expect(tokenDaPagina(db, { organizationId: "org-2", pageId: "pg-1" })).resolves.toBeNull();
  });

  it("a mesma página ativa em OUTRA organização é recusada, sem tocar na linha de lá", async () => {
    const { b, db } = banco([{ id: "s1", organization_id: "org-2", provider: "meta_messenger", messenger_page_id: "pg-1", archived_at: null, metadata: {} }]);
    const r = await gravarPagina(db, { organizationId: "org-1", userId: "u", pagina: pagina() });
    expect(r.resultado).toBe("de_outra_empresa");
    expect(b.tabelas.channel_sessions).toHaveLength(1);
  });

  it("reconectar a página ativa da própria organização troca o token, sem linha nova", async () => {
    const { b, db } = banco([{ id: "s1", organization_id: "org-1", provider: "meta_messenger", messenger_page_id: "pg-1", archived_at: null, metadata: { ai_gate_mode: "open" } }]);
    const r = await gravarPagina(db, { organizationId: "org-1", userId: "u", pagina: pagina({ accessToken: "token-novo" }) });
    expect(r).toMatchObject({ resultado: "reconectada", channelSessionId: "s1" });
    expect(b.tabelas.channel_sessions).toHaveLength(1);
    expect(b.tabelas.channel_sessions?.[0]?.messenger_page_token_encrypted).toBe("cifrado(token-novo)");
    // A liberação da IA que o dono já tinha feito não volta ao zero.
    expect((b.tabelas.channel_sessions?.[0]?.metadata as Record<string, unknown>).ai_gate_mode).toBe("open");
  });

  it("página excluída antes RESSUSCITA a mesma linha (as conversas continuam ligadas) e audita a volta", async () => {
    const { b, db } = banco([{ id: "s-velha", organization_id: "org-1", provider: "meta_messenger", messenger_page_id: "pg-1", archived_at: "2026-10-01T00:00:00Z", metadata: {} }]);
    const r = await gravarPagina(db, { organizationId: "org-1", userId: "u", pagina: pagina() });
    expect(r).toMatchObject({ resultado: "reconectada", channelSessionId: "s-velha" });
    expect(b.tabelas.channel_sessions).toHaveLength(1);
    expect(b.tabelas.channel_sessions?.[0]?.archived_at).toBeNull();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.reactivated", resourceId: "s-velha" }));
  });

  it("quem conectou sem a tarefa de mensagens na página não ganha canal", async () => {
    const { b, db } = banco();
    const r = await gravarPagina(db, { organizationId: "org-1", userId: "u", pagina: pagina({ podeAtender: false }) });
    expect(r.resultado).toBe("sem_permissao_de_mensagens");
    expect(b.tabelas.channel_sessions ?? []).toHaveLength(0);
  });
});

describe("roteamento e leitura", () => {
  it("a sessão é achada pela página só entre as ATIVAS", async () => {
    const { db } = banco([
      { id: "s-velha", organization_id: "org-9", provider: "meta_messenger", messenger_page_id: "pg-1", archived_at: "2026-01-01T00:00:00Z" },
      { id: "s1", organization_id: "org-1", provider: "meta_messenger", messenger_page_id: "pg-1", archived_at: null },
    ]);
    await expect(sessaoDaPagina(db, "pg-1")).resolves.toEqual({ id: "s1", organizationId: "org-1" });
    await expect(sessaoDaPagina(db, "pg-x")).resolves.toBeNull();
  });

  it("a tela recebe o motivo da falha, nunca o token", async () => {
    const { db } = banco([
      {
        id: "s1",
        organization_id: "org-1",
        provider: "meta_messenger",
        messenger_page_id: "pg-1",
        messenger_page_token_encrypted: "cifrado(segredo)",
        display_name: "Messenger · Loja",
        status: "FAILED",
        archived_at: null,
        created_at: "2026-10-01T00:00:00Z",
        metadata: { messenger_falha: "(#200) permissão" },
      },
    ]);
    const [p] = await paginasDaOrganizacao(db, "org-1");
    expect(p).toMatchObject({ pageId: "pg-1", status: "FAILED", falha: "(#200) permissão" });
    expect(JSON.stringify(p)).not.toContain("segredo");
  });
});

describe("conectarPaginas", () => {
  const deps = (over: Partial<DepsDaConexao> = {}): DepsDaConexao => ({
    listarPaginas: vi.fn(async () => [pagina(), pagina({ id: "pg-2", name: "Outra", accessToken: "token-2" })]),
    assinarWebhookDoApp: vi.fn(async () => {}),
    assinarAvisosDaPagina: vi.fn(async () => {}),
    ...over,
  });

  it("cada página autorizada vira canal WORKING depois de ligar os avisos dela", async () => {
    const { b, db } = banco();
    const d = deps();
    const r = await conectarPaginas(db, d, { organizationId: "org-1", userId: "u", tokenDoUsuario: "tu" });
    expect(r.map((x) => x.resultado)).toEqual(["conectada", "conectada"]);
    expect(d.assinarAvisosDaPagina).toHaveBeenCalledWith("pg-1", "token-1");
    expect(b.tabelas.channel_sessions?.map((l) => l.status)).toEqual(["WORKING", "WORKING"]);
  });

  it("avisos que não ligam deixam a página FAILED com o motivo — e não derrubam a outra", async () => {
    const { b, db } = banco();
    const d = deps({
      assinarAvisosDaPagina: vi.fn(async (pageId: string) => {
        if (pageId === "pg-1") throw new Error("(#200) faltou pages_manage_metadata");
      }),
    });
    const r = await conectarPaginas(db, d, { organizationId: "org-1", userId: "u", tokenDoUsuario: "tu" });
    expect(r.map((x) => x.resultado)).toEqual(["avisos_nao_ligados", "conectada"]);
    const [primeira, segunda] = b.tabelas.channel_sessions ?? [];
    expect(primeira?.status).toBe("FAILED");
    expect((primeira?.metadata as Record<string, unknown>).messenger_falha).toContain("pages_manage_metadata");
    expect(segunda?.status).toBe("WORKING");
  });

  it("o webhook do app que não liga por aqui não impede as páginas (pode já estar no painel)", async () => {
    const { db } = banco();
    const d = deps({ assinarWebhookDoApp: vi.fn(async () => Promise.reject(new Error("sem permissão de app"))) });
    const r = await conectarPaginas(db, d, { organizationId: "org-1", userId: "u", tokenDoUsuario: "tu" });
    expect(r.every((x) => x.resultado === "conectada")).toBe(true);
  });

  it("nenhuma página autorizada: nada é gravado e o webhook do app nem é tocado", async () => {
    const { db } = banco();
    const d = deps({ listarPaginas: vi.fn(async () => []) });
    await expect(conectarPaginas(db, d, { organizationId: "org-1", userId: "u", tokenDoUsuario: "tu" })).resolves.toEqual([]);
    expect(d.assinarWebhookDoApp).not.toHaveBeenCalled();
  });
});
