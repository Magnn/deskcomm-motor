/**
 * Vários números pela conexão de um clique: o provedor aceita um WhatsApp por
 * perfil, então mais um número ganha perfil próprio e passa pelo plano; a
 * reconexão grava na sessão DA CONTA, nunca na "mais recente" da organização.
 */
import { beforeEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  findPartnerSession: vi.fn(),
  perfisEmUsoDaOrganizacao: vi.fn(),
  savePartnerSession: vi.fn(),
  garantirPerfil: vi.fn(),
  perfilParaNovoNumero: vi.fn(),
  whatsappDoPerfil: vi.fn(),
  contaConectadaNoPerfil: vi.fn(),
  urlDaPaginaDeConexao: vi.fn(),
  recusaParaNovoNumero: vi.fn(),
}));

vi.mock("./connect", () => ({
  PARTNER_CHANNEL_LABEL: "Parceiro",
  findPartnerSession: h.findPartnerSession,
  perfisEmUsoDaOrganizacao: h.perfisEmUsoDaOrganizacao,
  savePartnerSession: h.savePartnerSession,
  registrarNoWebhookDaInstalacao: vi.fn(async () => "wh-1"),
  segredoAtualDoWebhook: vi.fn(async () => "segredo"),
}));
vi.mock("./zernio/conexao-pela-instalacao", () => ({
  ID_DO_PROVEDOR: /^[a-z0-9]+$/,
  garantirPerfil: h.garantirPerfil,
  perfilParaNovoNumero: h.perfilParaNovoNumero,
  whatsappDoPerfil: h.whatsappDoPerfil,
  contaConectadaNoPerfil: h.contaConectadaNoPerfil,
  urlDaPaginaDeConexao: h.urlDaPaginaDeConexao,
  motivoDaVolta: (e: string) => e,
}));
vi.mock("./zernio/credentials", () => ({ chaveDaInstalacao: vi.fn(async () => "chave") }));
vi.mock("@/lib/branding/saida", () => ({
  marcaDaSaida: vi.fn(async () => ({ nome: "Produto", origens: { nome: "padrao" } })),
}));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "cifrado") }));
vi.mock("@/lib/planos/assinatura-da-organizacao", () => ({
  recusaParaNovoNumero: h.recusaParaNovoNumero,
  mensagemDaRecusa: () => "sem vaga",
}));

import { emitirEstadoDaVolta } from "./estado-da-volta";
import { concluirConexaoUmClique, iniciarConexaoUmClique } from "./conexao-um-clique";

const agora = new Date("2026-11-18T12:00:00Z");
const ctx = {
  organizationId: "org-1",
  organizationNome: "Org",
  userId: "u-1",
  idioma: "pt-BR" as const,
  segredo: "s".repeat(32),
  agora,
  publicBase: "https://crm.exemplo",
};
const sessao7336 = {
  id: "sess-7336",
  accountId: "conta7336",
  archivedAt: null,
  pelaInstalacao: true,
  profileId: "perfil-1",
  webhookPathToken: "tok",
  webhookId: null,
  displayName: "Esmeralda",
};
const opcoes = { coexistencia: true, marca: "M", cor: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.recusaParaNovoNumero.mockResolvedValue(null);
  h.savePartnerSession.mockResolvedValue({ error: null, id: "sess-nova" });
  h.urlDaPaginaDeConexao.mockResolvedValue("https://provedor/cadastro");
});

test("outro número: perfil próprio, passa pelo plano e vai à Meta mesmo com o 1º no perfil", async () => {
  h.findPartnerSession.mockResolvedValue(sessao7336);
  h.perfisEmUsoDaOrganizacao.mockResolvedValue(["perfil-1"]);
  h.perfilParaNovoNumero.mockResolvedValue("perfil-2");

  const r = await iniciarConexaoUmClique({} as never, ctx, { ...opcoes, novoNumero: true });

  expect(r).toEqual({ tipo: "pagina", url: "https://provedor/cadastro" });
  expect(h.recusaParaNovoNumero).toHaveBeenCalledWith({}, "org-1");
  expect(h.perfilParaNovoNumero).toHaveBeenCalledWith("chave", expect.objectContaining({ id: "org-1" }), ["perfil-1"]);
  expect(h.whatsappDoPerfil).not.toHaveBeenCalled();
  expect(h.urlDaPaginaDeConexao.mock.calls[0][1].profileId).toBe("perfil-2");
});

test("outro número sem vaga no plano é recusado antes de criar perfil", async () => {
  h.findPartnerSession.mockResolvedValue(sessao7336);
  h.recusaParaNovoNumero.mockResolvedValue({ motivo: "limite_do_plano", limite: 1, plano: "Start" });

  await expect(iniciarConexaoUmClique({} as never, ctx, { ...opcoes, novoNumero: true })).rejects.toMatchObject({ status: 402 });
  expect(h.perfilParaNovoNumero).not.toHaveBeenCalled();
});

test("a volta de uma conta nova cria sessão nova (não sobrescreve o 1º número)", async () => {
  h.findPartnerSession.mockImplementation(async (_a: unknown, _o: string, conta?: string) =>
    conta === "conta5000" ? null : sessao7336,
  );
  h.contaConectadaNoPerfil.mockResolvedValue({ accountId: "conta5000", telefone: "+5569900005000", nome: "Estela" });
  const estado = emitirEstadoDaVolta({ organizationId: "org-1", userId: "u-1", profileId: "perfil-2" }, { segredo: ctx.segredo, agora });

  await concluirConexaoUmClique({} as never, ctx, { estado, accountId: "conta5000", profileId: "perfil-2" });

  const gravado = h.savePartnerSession.mock.calls[0][1];
  expect(gravado.existingId).toBeNull();
  expect(gravado.credencial).toEqual({ tipo: "instalacao", profileId: "perfil-2" });
  expect(h.recusaParaNovoNumero).toHaveBeenCalled();
});

test("a volta de uma conta já conectada atualiza a sessão dela, sem gastar vaga", async () => {
  h.findPartnerSession.mockResolvedValue(sessao7336);
  h.contaConectadaNoPerfil.mockResolvedValue({ accountId: "conta7336", telefone: "+556981087336", nome: "Esmeralda" });
  const estado = emitirEstadoDaVolta({ organizationId: "org-1", userId: "u-1", profileId: "perfil-1" }, { segredo: ctx.segredo, agora });

  await concluirConexaoUmClique({} as never, ctx, { estado, accountId: "conta7336", profileId: "perfil-1" });

  expect(h.findPartnerSession).toHaveBeenCalledWith({}, "org-1", "conta7336");
  expect(h.savePartnerSession.mock.calls[0][1].existingId).toBe("sess-7336");
  expect(h.recusaParaNovoNumero).not.toHaveBeenCalled();
});

test("reconectar com o número já no perfil conclui na hora, na sessão daquela conta", async () => {
  h.findPartnerSession.mockResolvedValue(sessao7336);
  h.garantirPerfil.mockResolvedValue("perfil-1");
  h.whatsappDoPerfil.mockResolvedValue({ accountId: "conta7336", telefone: "+556981087336", nome: "Esmeralda" });

  const r = await iniciarConexaoUmClique({} as never, ctx, opcoes);

  expect(r.tipo).toBe("concluida");
  expect(h.savePartnerSession.mock.calls[0][1].existingId).toBe("sess-7336");
});
