/**
 * COMPRA NA CAKTO → ENTREGA NO CRM.
 *
 * O que estes testes seguram:
 *  - o aviso é lido como a Cakto o manda (exemplo da documentação) e o segredo do CORPO é conferido;
 *  - sem segredo configurado nada é aceito (aviso forjado não entrega trabalho);
 *  - pagou → marcas, nota, follow-up de recuperação PARADO antes de a entrega começar;
 *  - reenvio do mesmo aviso NÃO entrega duas vezes;
 *  - reembolso/chargeback param tudo; Pix gerado e abandono só são registrados;
 *  - compra de quem nunca falou no WhatsApp vai para uma pessoa, sem fluxo.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { aplicarEventoDaCakto, type DepsDaCompra } from "@/lib/pagamentos/compra-cakto";
import { isCaktoPayload, mapCaktoPayload, segredoDaCaktoConfere, slugDoTrabalho } from "@/lib/webhooks/cakto";

/** O exemplo da documentação da Cakto, com o produto de um dos trabalhos. */
const AVISO = {
  secret: "meu-segredo",
  event: "purchase_approved",
  data: {
    id: "81b408ee-2a91-427d-80bd-226cbeae1fa0",
    refId: "AUAe5xK",
    customer: { name: "Marina", birthDate: "1990-04-09", email: "Marina@Exemplo.com", phone: "11987654321" },
    offer: { id: "B8BcHrY", name: "Oferta Única", price: 130 },
    product: { name: "Trabalho Espiritual: Abertura do Coração", id: "cd287b31-d4b7-4e94-858a-96e05ce2f4a2" },
    status: "paid",
    amount: 50.7,
    fees: 2.49,
    paymentMethod: "pix",
    paidAt: "2026-09-24T11:39:57.113068-03:00",
    coupon: "cupomteste1",
  },
};

describe("leitura do aviso", () => {
  it("reconhece o aviso da Cakto e nada além dele", () => {
    expect(isCaktoPayload(AVISO)).toBe(true);
    expect(isCaktoPayload({ name: "Ana", phone: "1199999999" })).toBe(false); // captação comum
    expect(isCaktoPayload({ form: {}, respondent: { answers: {} } })).toBe(false); // Respondi
    expect(isCaktoPayload({ event: "algo_que_nao_existe", data: {} })).toBe(false);
    expect(isCaktoPayload({ event: "purchase_approved", data: "texto" })).toBe(false);
  });

  it("extrai pedido, produto, valor em centavos, cupom e o telefone normalizado; ignora a data de nascimento", () => {
    const c = mapCaktoPayload(AVISO)!;
    expect(c).toMatchObject({
      evento: "purchase_approved",
      pedidoId: "81b408ee-2a91-427d-80bd-226cbeae1fa0",
      produtoNome: "Trabalho Espiritual: Abertura do Coração",
      valorCentavos: 5070,
      cupom: "cupomteste1",
      metodo: "pix",
    });
    expect(c.cliente.telefone).toBe("+5511987654321");
    expect(c.cliente.email).toBe("marina@exemplo.com");
    expect(JSON.stringify(c)).not.toContain("1990"); // birthDate não é lido
  });

  it("cupom em objeto {code} também vale; sem id nem refId não há pedido", () => {
    const c = mapCaktoPayload({ ...AVISO, data: { ...AVISO.data, coupon: { code: "ABC" } } })!;
    expect(c.cupom).toBe("ABC");
    expect(mapCaktoPayload({ event: "purchase_approved", data: { customer: {} } })).toBeNull();
  });

  it("mapeia o trabalho pelo nome do produto, com ou sem acento", () => {
    expect(slugDoTrabalho("Trabalho Espiritual: Abertura do Coração")).toBe("abertura-do-coracao");
    expect(slugDoTrabalho("trabalho espiritual: abertura da prosperidade")).toBe("abertura-da-prosperidade");
    expect(slugDoTrabalho("Trabalho Espiritual: Limpeza e Proteção")).toBe("limpeza-e-protecao");
    expect(slugDoTrabalho("Trabalho Espiritual: Desbloqueio dos Caminhos")).toBe("desbloqueio-dos-caminhos");
    expect(slugDoTrabalho("Ritual da Lua Nova")).toBeNull();
    expect(slugDoTrabalho(null)).toBeNull();
  });
});

describe("o segredo do corpo", () => {
  it("confere quando é o da fonte", () => {
    expect(segredoDaCaktoConfere(AVISO, "meu-segredo")).toBe(true);
  });

  it("recusa segredo errado, ausente no corpo ou ausente na fonte", () => {
    expect(segredoDaCaktoConfere(AVISO, "outro")).toBe(false);
    expect(segredoDaCaktoConfere({ ...AVISO, secret: "" }, "meu-segredo")).toBe(false);
    const { secret: _s, ...semSegredo } = AVISO;
    expect(segredoDaCaktoConfere(semSegredo, "meu-segredo")).toBe(false);
    // Fonte sem segredo configurado: NADA é aceito (nem "" contra "").
    expect(segredoDaCaktoConfere(AVISO, null)).toBe(false);
    expect(segredoDaCaktoConfere({ ...AVISO, secret: "" }, "")).toBe(false);
  });
});

function fake(sobrescreve: Partial<DepsDaCompra> = {}) {
  const chamadas: string[] = [];
  const gravado: Array<{ id: string; tags: string[]; ultimaCompra: Record<string, unknown> }> = [];
  const notas: string[] = [];
  const deps: DepsDaCompra = {
    async acharContato() {
      chamadas.push("acharContato");
      return { id: "c1", tags: ["lead-quente"] };
    },
    async gravarCompra(id, patch) {
      chamadas.push("gravarCompra");
      gravado.push({ id, ...patch });
    },
    async anotar(_id, texto) {
      chamadas.push("anotar");
      notas.push(texto);
    },
    async pararFluxosVivos(_id, motivo) {
      chamadas.push(`parar:${motivo}`);
      return 1;
    },
    async acharFluxoDeEntrega() {
      chamadas.push("acharFluxo");
      return "fluxo-entrega";
    },
    async inscrever(_id, fluxo) {
      chamadas.push(`inscrever:${fluxo}`);
      return { ok: true };
    },
    async fluxosDoEvento(_compra) {
      return [];
    },
    async adicionarTags() {},
    ...sobrescreve,
  };
  return { deps, chamadas, gravado, notas };
}

describe("compra aprovada", () => {
  it("marca a compra, anota, PARA a recuperação e SÓ ENTÃO inscreve a entrega — nessa ordem", async () => {
    const { deps, chamadas, gravado, notas } = fake();
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r).toEqual({ resultado: "entrega_iniciada", contatoId: "c1", trabalho: "abertura-do-coracao" });
    expect(gravado[0]!.tags).toEqual(
      expect.arrayContaining(["lead-quente", "pago", "produto:abertura-do-coracao", "compra:81b408ee-2a91-427d-80bd-226cbeae1fa0"]),
    );
    expect(gravado[0]!.ultimaCompra).toMatchObject({ valor_centavos: 5070, cupom: "cupomteste1" });
    expect(notas[0]).toContain("R$ 50,70");
    expect(notas[0]).toContain("cupom cupomteste1");
    // Quem pagou não recebe o "quer continuar?" — parar ANTES de inscrever.
    expect(chamadas.indexOf("parar:compra_aprovada")).toBeGreaterThan(-1);
    expect(chamadas.indexOf("parar:compra_aprovada")).toBeLessThan(chamadas.indexOf("inscrever:fluxo-entrega"));
  });

  it("o MESMO aviso reenviado não entrega de novo", async () => {
    const { deps, chamadas } = fake({
      async acharContato() {
        return { id: "c1", tags: ["pago", "compra:81b408ee-2a91-427d-80bd-226cbeae1fa0"] };
      },
    });
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r).toEqual({ resultado: "ja_processada", contatoId: "c1" });
    expect(chamadas.some((c) => c.startsWith("inscrever") || c === "gravarCompra")).toBe(false);
  });

  it("outro pedido da mesma pessoa entrega normalmente (a marca é por pedido, não por pessoa)", async () => {
    const { deps } = fake({
      async acharContato() {
        return { id: "c1", tags: ["pago", "compra:outro-pedido"] };
      },
    });
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r.resultado).toBe("entrega_iniciada");
  });

  it("quem nunca falou no WhatsApp não tem contato: vai para uma pessoa, sem fluxo", async () => {
    const { deps, chamadas } = fake({ async acharContato() { return null; } });
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r).toEqual({ resultado: "contato_nao_encontrado" });
    expect(chamadas).toEqual([]);
  });

  it("sem fluxo de entrega ativo a compra fica registrada e o motivo aparece", async () => {
    const { deps } = fake({ async acharFluxoDeEntrega() { return null; } });
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r).toMatchObject({ resultado: "compra_registrada_sem_fluxo", contatoId: "c1" });
  });

  it("inscrição recusada não derruba a compra registrada", async () => {
    const { deps } = fake({ async inscrever() { return { ok: false, motivo: "flow_not_active: Fluxo não está ativo" }; } });
    const r = await aplicarEventoDaCakto(deps, mapCaktoPayload(AVISO)!);
    expect(r).toMatchObject({ resultado: "compra_registrada_sem_fluxo", motivo: expect.stringContaining("flow_not_active") });
  });

  it("produto que não é um dos trabalhos: registra como `produto:outro`", async () => {
    const { deps, gravado } = fake();
    await aplicarEventoDaCakto(deps, mapCaktoPayload({ ...AVISO, data: { ...AVISO.data, product: { name: "Ritual da Lua Nova", id: "x" } } })!);
    expect(gravado[0]!.tags).toContain("produto:outro");
  });
});

describe("os outros eventos", () => {
  it("reembolso e chargeback marcam, anotam e PARAM os fluxos; nenhuma entrega é iniciada", async () => {
    for (const evento of ["refund", "chargeback"] as const) {
      const { deps, chamadas, gravado } = fake();
      const r = await aplicarEventoDaCakto(deps, mapCaktoPayload({ ...AVISO, event: evento })!);
      expect(r).toEqual({ resultado: "reembolso_registrado", contatoId: "c1" });
      expect(gravado[0]!.tags).toContain(evento === "refund" ? "reembolso" : "chargeback");
      expect(chamadas).toContain(`parar:compra_${evento === "refund" ? "reembolso" : "chargeback"}`);
      expect(chamadas.some((c) => c.startsWith("inscrever"))).toBe(false);
    }
  });

  it.each(["pix_gerado", "boleto_gerado", "purchase_refused", "checkout_abandonment"] as const)(
    "%s só é registrado — não há o que entregar",
    async (evento) => {
      const { deps, chamadas } = fake();
      const r = await aplicarEventoDaCakto(deps, mapCaktoPayload({ ...AVISO, event: evento })!);
      expect(r).toEqual({ resultado: "ignorada", evento });
      expect(chamadas).toEqual([]);
    },
  );
});

describe("a fiação da rota de captação", () => {
  const rota = readFileSync("app/api/v1/webhooks/in/[token]/route.ts", "utf8");

  it("o ramo da Cakto vem ANTES da checagem de assinatura HMAC (a Cakto não manda o cabeçalho)", () => {
    const ramo = rota.indexOf("if (isCaktoPayload(payload))");
    const hmac = rota.indexOf('const sigHeader = req.headers.get("x-deskcomm-signature")');
    expect(ramo).toBeGreaterThan(-1);
    expect(hmac).toBeGreaterThan(ramo);
  });

  it("exige o segredo da fonte e NUNCA grava o segredo no log", () => {
    expect(rota).toContain("segredoDaCaktoConfere(payload, segredoDaFonte)");
    expect(rota).toContain('secret: "[omitido]"');
    // O corpo bruto (que contém o segredo) não é o que vai para `webhook_events_log` neste ramo.
    const ramo = rota.slice(rota.indexOf("if (isCaktoPayload(payload))"), rota.indexOf('const sigHeader = req.headers.get("x-deskcomm-signature")'));
    expect(ramo).not.toContain("raw_body: rawBody");
  });

  it("erro real devolve 5xx (a Cakto reenvia; a marca do pedido impede entrega dupla)", () => {
    expect(rota).toContain('fail("internal_error", "cakto_event_failed", 500');
  });
});
