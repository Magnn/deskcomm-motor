/**
 * Link de cadastro: a volta só grava número do cliente DESTA organização, o
 * webhook nasce com segredo nosso, e reconectar o mesmo número não registra
 * outro (o provedor aceita um webhook no formato da Meta por número).
 */
import { createHmac } from "node:crypto";
import { beforeEach, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  chaveDoKapso: vi.fn(),
  garantirCliente: vi.fn(),
  criarLinkDeCadastro: vi.fn(),
  numeroDoKapso: vi.fn(),
  registrarWebhookDoNumero: vi.fn(),
  sessoesKapso: vi.fn(),
  salvarSessaoKapso: vi.fn(),
  recusaParaNovoNumero: vi.fn(),
}));

vi.mock("./api", () => ({
  KAPSO_LABEL: "Parceiro",
  chaveDoKapso: h.chaveDoKapso,
  garantirCliente: h.garantirCliente,
  criarLinkDeCadastro: h.criarLinkDeCadastro,
  numeroDoKapso: h.numeroDoKapso,
  registrarWebhookDoNumero: h.registrarWebhookDoNumero,
}));
vi.mock("./session", () => ({ sessoesKapso: h.sessoesKapso, salvarSessaoKapso: h.salvarSessaoKapso }));
vi.mock("@/lib/webhooks/secrets", () => ({ encryptWebhookSecret: vi.fn(async () => "cifrado") }));
vi.mock("@/lib/planos/assinatura-da-organizacao", () => ({
  recusaParaNovoNumero: h.recusaParaNovoNumero,
  mensagemDaRecusa: () => "sem vaga",
}));
vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: vi.fn() }));

import { emitirEstadoDaVolta } from "../estado-da-volta";
import { concluirLinkDeCadastro, iniciarLinkDeCadastro } from "./conexao";
import { verifyKapsoSignature } from "./webhook";

const agora = new Date("2026-11-18T12:00:00Z");
const ctx = {
  organizationId: "org-1",
  organizationNome: "Org",
  userId: "u-1",
  idioma: "pt-BR" as const,
  segredo: "s".repeat(32),
  agora,
  publicBase: "https://crm.exemplo",
  requestId: "req-1",
};
const estado = () =>
  emitirEstadoDaVolta({ organizationId: "org-1", userId: "u-1", profileId: "cliente-1" }, { segredo: ctx.segredo, agora });

beforeEach(() => {
  vi.clearAllMocks();
  h.chaveDoKapso.mockResolvedValue("chave");
  h.recusaParaNovoNumero.mockResolvedValue(null);
  h.sessoesKapso.mockResolvedValue([]);
  h.salvarSessaoKapso.mockResolvedValue({ error: null, channelSessionId: "sess-1" });
  h.registrarWebhookDoNumero.mockResolvedValue("wh-1");
  h.numeroDoKapso.mockResolvedValue({
    phoneNumberId: "1234567890",
    wabaId: "waba-1",
    customerId: "cliente-1",
    telefone: "+55 69 9999-0000",
    nome: "Esmeralda",
  });
});

test("iniciar: cliente da organização, link com volta pelo caminho e coexistência", async () => {
  h.garantirCliente.mockResolvedValue("cliente-1");
  h.criarLinkDeCadastro.mockResolvedValue("https://provedor/setup/abc");

  const r = await iniciarLinkDeCadastro({} as never, ctx, { coexistencia: true, cor: null });

  expect(r.url).toBe("https://provedor/setup/abc");
  expect(h.garantirCliente).toHaveBeenCalledWith("chave", { id: "org-1", nome: "Org" });
  const link = h.criarLinkDeCadastro.mock.calls[0]![1];
  expect(link.sucesso).toMatch(/^https:\/\/crm\.exemplo\/auth\/link-return\/[A-Za-z0-9_-]+\.[0-9a-f]{64}$/);
  expect(link.coexistencia).toBe(true);
  expect(link.idioma).toBe("pt");
});

test("iniciar sem vaga no plano é recusado antes de falar com o provedor", async () => {
  h.recusaParaNovoNumero.mockResolvedValue({ motivo: "limite_do_plano", limite: 1, plano: "Start" });
  await expect(iniciarLinkDeCadastro({} as never, ctx, { coexistencia: true, cor: null })).rejects.toMatchObject({ status: 402 });
  expect(h.garantirCliente).not.toHaveBeenCalled();
});

test("concluir: número de outro cliente é recusado e nada é gravado", async () => {
  h.numeroDoKapso.mockResolvedValue({ phoneNumberId: "1234567890", wabaId: null, customerId: "outro", telefone: null, nome: null });
  await expect(
    concluirLinkDeCadastro({} as never, ctx, { estado: estado(), phoneNumberId: "1234567890" }),
  ).rejects.toMatchObject({ status: 403 });
  expect(h.registrarWebhookDoNumero).not.toHaveBeenCalled();
  expect(h.salvarSessaoKapso).not.toHaveBeenCalled();
});

test("concluir: estado de outro usuário é recusado", async () => {
  await expect(
    concluirLinkDeCadastro({} as never, { ...ctx, userId: "u-2" }, { estado: estado(), phoneNumberId: "1234567890" }),
  ).rejects.toMatchObject({ status: 400 });
  expect(h.numeroDoKapso).not.toHaveBeenCalled();
});

test("concluir número novo: registra webhook com token no caminho e grava a sessão", async () => {
  const r = await concluirLinkDeCadastro({} as never, ctx, { estado: estado(), phoneNumberId: "1234567890" });

  const wh = h.registrarWebhookDoNumero.mock.calls[0]![1];
  expect(wh.url).toMatch(/^https:\/\/crm\.exemplo\/api\/v1\/webhooks\/channel\/[0-9a-f]{32}$/);
  expect(wh.segredo).toMatch(/^[0-9a-f]{64}$/);
  const gravado = h.salvarSessaoKapso.mock.calls[0]![1];
  expect(gravado.existente).toBeNull();
  expect(gravado.customerId).toBe("cliente-1");
  expect(gravado.webhook).toEqual({ id: "wh-1", pathToken: wh.url.split("/").pop(), segredoCifrado: "cifrado" });
  expect(r).toMatchObject({ channelSessionId: "sess-1", displayName: "Esmeralda" });
});

test("reconectar o mesmo número mantém o webhook e não gasta vaga", async () => {
  h.sessoesKapso.mockResolvedValue([
    { id: "sess-1", phoneNumberId: "1234567890", archivedAt: null, webhookId: "wh-1", webhookPathToken: "tok" },
  ]);
  await concluirLinkDeCadastro({} as never, ctx, { estado: estado(), phoneNumberId: "1234567890" });
  expect(h.registrarWebhookDoNumero).not.toHaveBeenCalled();
  expect(h.recusaParaNovoNumero).not.toHaveBeenCalled();
  expect(h.salvarSessaoKapso.mock.calls[0]![1].webhook).toBeNull();
});

test("assinatura: HMAC-SHA256 hex do corpo cru; qualquer outra coisa é recusada", () => {
  const corpo = '{"entry":[]}';
  const ok = createHmac("sha256", "segredo").update(corpo).digest("hex");
  expect(verifyKapsoSignature(corpo, ok, "segredo")).toBe(true);
  expect(verifyKapsoSignature(corpo, `sha256=${ok}`, "segredo")).toBe(true);
  expect(verifyKapsoSignature(`${corpo} `, ok, "segredo")).toBe(false);
  expect(verifyKapsoSignature(corpo, "abc", "segredo")).toBe(false);
  expect(verifyKapsoSignature(corpo, ok, null)).toBe(false);
});
