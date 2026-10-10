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

import {
  aplicarEventoDaCakto,
  type DepsDaCompra,
  escolherFluxoDeEntrega,
  negocioQueRecebeOValor,
  type NegocioDoContato,
} from "@/lib/pagamentos/compra-cakto";
import { triggerConfigSchema } from "@/lib/followup/api-schemas";
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
    async registrarValorNoNegocio(_id, valor) {
      chamadas.push(`valor:${valor}`);
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
    // ⭐ O valor pago vai para o negócio: sem ele a venda não é reportada à plataforma de anúncio.
    expect(chamadas).toContain("valor:5070");
    expect(chamadas.indexOf("valor:5070")).toBeGreaterThan(chamadas.indexOf("gravarCompra"));
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
    // E o valor NÃO é somado de novo no negócio.
    expect(chamadas.some((c) => c.startsWith("valor:"))).toBe(false);
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

  it("produto que não é um dos trabalhos: a marca leva o nome dele (é o que o pós-venda lê para não oferecer de novo)", async () => {
    const { deps, gravado } = fake();
    await aplicarEventoDaCakto(deps, mapCaktoPayload({ ...AVISO, data: { ...AVISO.data, product: { name: "Ritual da Lua Nova", id: "x" } } })!);
    expect(gravado[0]!.tags).toContain("produto:ritual-da-lua-nova");
    expect(gravado[0]!.tags).not.toContain("produto:outro");
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

describe("cada produto com o seu fluxo de entrega", () => {
  // Do mais recente para o mais antigo, como a consulta devolve.
  const fluxos = [
    { id: "sons", produto: "Sons Vocálicos" },
    { id: "oracao", produto: "Oração dos Sonhos" },
    { id: "geral", produto: null },
  ];

  it("⭐ a compra do produto declarado vai para o fluxo dele — não para o fluxo geral", () => {
    expect(escolherFluxoDeEntrega(fluxos, "Sons Vocálicos")).toBe("sons");
    expect(escolherFluxoDeEntrega(fluxos, "ORAÇÃO DOS SONHOS")).toBe("oracao");
    expect(escolherFluxoDeEntrega(fluxos, "sons vocalicos — acesso")).toBe("sons");
  });

  it("⭐ produto sem fluxo próprio vai para o geral, mesmo com fluxos de produto mais recentes", () => {
    expect(escolherFluxoDeEntrega(fluxos, "Trabalho Espiritual: Abertura do Coração")).toBe("geral");
    expect(escolherFluxoDeEntrega(fluxos, null)).toBe("geral");
  });

  it("sem fluxo geral, produto desconhecido fica sem entrega automática (não cai no fluxo de outro produto)", () => {
    expect(escolherFluxoDeEntrega(fluxos.slice(0, 2), "Trabalho Espiritual: Abertura do Coração")).toBeNull();
    expect(escolherFluxoDeEntrega([], "Sons Vocálicos")).toBeNull();
  });

  it("a fiação: a compra passa o nome do produto, e o gatilho de automação aceita declarar o produto", () => {
    const compra = readFileSync("lib/pagamentos/compra-cakto.ts", "utf8");
    expect(compra).toContain("deps.acharFluxoDeEntrega(compra.produtoNome)");
    expect(triggerConfigSchema.safeParse({ kind: "webhook", product_name: "Sons Vocálicos" }).success).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "webhook" }).success).toBe(true);
    expect(triggerConfigSchema.safeParse({ kind: "webhook", product_name: "" }).success).toBe(false);
  });
});

describe("em qual negócio o valor da compra entra", () => {
  const AGORA = new Date("2026-10-10T15:00:00Z");
  const ha = (horas: number) => new Date(AGORA.getTime() - horas * 3_600_000).toISOString();
  const negocio = (over: Partial<NegocioDoContato>): NegocioDoContato => ({
    id: "n1",
    status: "open",
    value_cents: null,
    closed_at: null,
    last_activity_at: ha(1),
    created_at: ha(48),
    ...over,
  });

  it("⭐ negócio ABERTO recebe o valor — quando o agente fechar, a venda já tem quanto valeu", () => {
    expect(negocioQueRecebeOValor([negocio({})], 13_000, AGORA)).toEqual({ id: "n1", novoValor: 13_000, jaGanho: false });
  });

  it("com dois abertos, vale o de atividade mais recente", () => {
    const r = negocioQueRecebeOValor([negocio({ id: "velho", last_activity_at: ha(30) }), negocio({ id: "novo", last_activity_at: ha(2) })], 13_000, AGORA);
    expect(r?.id).toBe("novo");
  });

  it("⭐ o agente fechou ANTES de o aviso chegar: o ganho recente recebe o valor, marcado como já ganho", () => {
    // `jaGanho` é o que faz o envio da venda ser refeito: o evento de fechamento passou sem valor.
    const r = negocioQueRecebeOValor([negocio({ status: "won", closed_at: ha(0.1) })], 13_000, AGORA);
    expect(r).toEqual({ id: "n1", novoValor: 13_000, jaGanho: true });
  });

  it("segunda compra da mesma pessoa (oferta de pós-venda): o valor SOMA no negócio ganho", () => {
    const r = negocioQueRecebeOValor([negocio({ status: "won", closed_at: ha(20), value_cents: 13_000 })], 4_500, AGORA);
    expect(r).toEqual({ id: "n1", novoValor: 17_500, jaGanho: true });
  });

  it("negócio perdido, ou ganho há mais de 7 dias, não é desta compra: nada é escrito", () => {
    expect(negocioQueRecebeOValor([negocio({ status: "lost", closed_at: ha(1) })], 13_000, AGORA)).toBeNull();
    expect(negocioQueRecebeOValor([negocio({ status: "won", closed_at: ha(24 * 8) })], 13_000, AGORA)).toBeNull();
    expect(negocioQueRecebeOValor([], 13_000, AGORA)).toBeNull();
  });
});
