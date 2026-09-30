/**
 * O FILTRO POR EVENTO DA CAKTO. O dono escolhe no gatilho do fluxo qual aviso o inicia;
 * antes, só «compra aprovada» fazia algo e achava o fluxo pelo NOME («Entrega…»).
 *
 * O que estes testes seguram:
 *  - evento com fluxo configurado inicia ESSE fluxo (Pix gerado, carrinho abandonado…);
 *  - evento sem nenhum fluxo configurado continua só registrado (comportamento anterior);
 *  - o reenvio do mesmo aviso não recomeça o fluxo;
 *  - compra aprovada: o fluxo configurado por evento vence a busca por nome; sem ele, vale o legado;
 *  - reembolso/chargeback param os vivos ANTES de o fluxo do evento começar;
 *  - quem nunca falou no WhatsApp vai para uma pessoa, sem fluxo;
 *  - o schema do gatilho só aceita os eventos que a Cakto manda.
 */
import { describe, expect, it } from "vitest";

import { aplicarEventoDaCakto, type DepsDaCompra } from "@/lib/pagamentos/compra-cakto";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
import { mapCaktoPayload } from "@/lib/webhooks/cakto";

function aviso(evento: string, pedido = "pedido-1") {
  return mapCaktoPayload({
    event: evento,
    data: {
      id: pedido,
      customer: { name: "Marina", email: "marina@exemplo.com", phone: "11987654321" },
      product: { name: "Trabalho Espiritual: Abertura do Coração" },
      amount: 130,
    },
  })!;
}

type Sobrescritas = Partial<DepsDaCompra> & { fluxos?: Record<string, string[]>; tags?: string[] };

function montar(over: Sobrescritas = {}) {
  const { fluxos, tags, ...pontas } = over;
  const log: string[] = [];
  const tagsGravadas: string[][] = [];
  const deps: DepsDaCompra = {
    async acharContato() {
      return { id: "c1", tags: tags ?? [] };
    },
    async gravarCompra() {
      log.push("gravarCompra");
    },
    async anotar() {},
    async pararFluxosVivos(_id, motivo) {
      log.push(`parar:${motivo}`);
      return 1;
    },
    async acharFluxoDeEntrega() {
      log.push("fluxoPorNome");
      return "fluxo-entrega-por-nome";
    },
    async inscrever(_id, fluxo) {
      log.push(`inscrever:${fluxo}`);
      return { ok: true };
    },
    async fluxosDoEvento(evento) {
      return fluxos?.[evento] ?? [];
    },
    async adicionarTags(_id, novas) {
      tagsGravadas.push(novas);
    },
    ...pontas,
  };
  return { deps, log, tagsGravadas };
}

describe("eventos que não são compra aprovada", () => {
  it("Pix gerado com um fluxo configurado inicia ESSE fluxo e marca pedido+evento", async () => {
    const { deps, log, tagsGravadas } = montar({ fluxos: { pix_gerado: ["fluxo-pix"] } });
    const r = await aplicarEventoDaCakto(deps, aviso("pix_gerado"));
    expect(r).toEqual({ resultado: "fluxos_do_evento_iniciados", contatoId: "c1", quantidade: 1 });
    expect(log).toContain("inscrever:fluxo-pix");
    expect(tagsGravadas).toEqual([["cakto:pix_gerado:pedido-1"]]);
  });

  it("vários fluxos para o mesmo evento começam todos", async () => {
    const { deps, log } = montar({ fluxos: { checkout_abandonment: ["a", "b"] } });
    const r = await aplicarEventoDaCakto(deps, aviso("checkout_abandonment"));
    expect(r).toMatchObject({ resultado: "fluxos_do_evento_iniciados", quantidade: 2 });
    expect(log).toEqual(["inscrever:a", "inscrever:b"]);
  });

  it("sem fluxo configurado para o evento, segue só registrado (comportamento anterior)", async () => {
    const { deps, log } = montar({ fluxos: { pix_gerado: ["fluxo-pix"] } });
    const r = await aplicarEventoDaCakto(deps, aviso("boleto_gerado"));
    expect(r).toEqual({ resultado: "ignorada", evento: "boleto_gerado" });
    expect(log).toEqual([]);
  });

  it("o reenvio do mesmo aviso não recomeça o fluxo", async () => {
    const { deps, log } = montar({ fluxos: { pix_gerado: ["fluxo-pix"] }, tags: ["cakto:pix_gerado:pedido-1"] });
    const r = await aplicarEventoDaCakto(deps, aviso("pix_gerado"));
    expect(r).toEqual({ resultado: "ja_processada", contatoId: "c1" });
    expect(log).toEqual([]);
  });

  it("pedido diferente, mesmo evento: começa de novo (é outra compra)", async () => {
    const { deps, log } = montar({ fluxos: { pix_gerado: ["fluxo-pix"] }, tags: ["cakto:pix_gerado:pedido-1"] });
    const r = await aplicarEventoDaCakto(deps, aviso("pix_gerado", "pedido-2"));
    expect(r).toMatchObject({ resultado: "fluxos_do_evento_iniciados" });
    expect(log).toContain("inscrever:fluxo-pix");
  });

  it("contato já em outro fluxo vivo: a inscrição é recusada e isso não vira erro nem marca", async () => {
    const { deps, tagsGravadas } = montar({
      fluxos: { pix_gerado: ["fluxo-pix"] },
      async inscrever() {
        return { ok: false, motivo: "already_live" };
      },
    });
    const r = await aplicarEventoDaCakto(deps, aviso("pix_gerado"));
    expect(r).toEqual({ resultado: "ja_processada", contatoId: "c1" });
    expect(tagsGravadas).toEqual([]);
  });

  it("quem nunca falou no WhatsApp vai para uma pessoa, sem fluxo", async () => {
    const { deps, log } = montar({
      fluxos: { pix_gerado: ["fluxo-pix"] },
      async acharContato() {
        return null;
      },
    });
    const r = await aplicarEventoDaCakto(deps, aviso("pix_gerado"));
    expect(r).toEqual({ resultado: "contato_nao_encontrado" });
    expect(log).toEqual([]);
  });
});

describe("compra aprovada", () => {
  it("o fluxo configurado por EVENTO vence a busca pelo nome «Entrega»", async () => {
    const { deps, log } = montar({ fluxos: { purchase_approved: ["fluxo-da-compra"] } });
    const r = await aplicarEventoDaCakto(deps, aviso("purchase_approved"));
    expect(r.resultado).toBe("entrega_iniciada");
    expect(log).toContain("inscrever:fluxo-da-compra");
    expect(log).not.toContain("fluxoPorNome");
  });

  it("sem nenhum fluxo configurado por evento, vale o legado (nome começando com «Entrega»)", async () => {
    const { deps, log } = montar();
    const r = await aplicarEventoDaCakto(deps, aviso("purchase_approved"));
    expect(r.resultado).toBe("entrega_iniciada");
    expect(log).toContain("inscrever:fluxo-entrega-por-nome");
  });

  it("configurado mas nenhum iniciou: a compra fica registrada para uma pessoa, sem cair no legado", async () => {
    const { deps, log } = montar({
      fluxos: { purchase_approved: ["fluxo-da-compra"] },
      async inscrever() {
        return { ok: false, motivo: "flow_not_active: Fluxo não está ativo" };
      },
    });
    const r = await aplicarEventoDaCakto(deps, aviso("purchase_approved"));
    expect(r).toMatchObject({ resultado: "compra_registrada_sem_fluxo", motivo: expect.stringContaining("flow_not_active") });
    expect(log).not.toContain("fluxoPorNome");
  });
});

describe("reembolso e chargeback", () => {
  it("param os fluxos vivos ANTES de o fluxo do evento começar", async () => {
    const { deps, log } = montar({ fluxos: { refund: ["fluxo-reembolso"] } });
    const r = await aplicarEventoDaCakto(deps, aviso("refund"));
    expect(r.resultado).toBe("reembolso_registrado");
    const parou = log.findIndex((l) => l.startsWith("parar:"));
    const iniciou = log.indexOf("inscrever:fluxo-reembolso");
    expect(parou).toBeGreaterThanOrEqual(0);
    expect(iniciou).toBeGreaterThan(parou);
  });
});

describe("triggerConfigSchema — payment_event", () => {
  it("aceita só eventos da Cakto, do provedor cakto", () => {
    expect(triggerConfigSchema.safeParse({ kind: "payment_event", params: { provider: "cakto", event: "pix_gerado" } }).success).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "payment_event", params: { provider: "cakto", event: "nao_existe" } }).success).toBe(false);
    expect(triggerConfigSchema.safeParse({ kind: "payment_event", params: { provider: "kiwify", event: "pix_gerado" } }).success).toBe(false);
    expect(triggerConfigSchema.safeParse({ kind: "payment_event" }).success).toBe(false);
  });
});
