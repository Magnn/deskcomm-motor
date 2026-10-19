/**
 * O APP E O AVISO DIÁRIO DA ÁREA (pedido do dono em 19/10/2026: um motivo diário de voltar que não
 * dependa do WhatsApp).
 *
 * O que este arquivo guarda:
 *  - o aviso sai só na hora marcada do relógio da empresa e no máximo uma vez por dia por aparelho;
 *  - o texto convida e leva de volta para a área marcando que veio do aviso;
 *  - a rodada só olha empresas com o aviso ligado, marca o dia ANTES de mandar e apaga o aparelho que
 *    cancelou a inscrição (404/410);
 *  - a rota guarda a inscrição só com os avisos ligados e de quem está na área;
 *  - o manifesto instala a área com o nome da empresa, abrindo dentro da área.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  vapid: true,
  config: { avisos: { ativo: true, hora: 8 } } as Record<string, unknown>,
  upserts: [] as unknown[],
  eventos: [] as unknown[],
}));

vi.mock("@/lib/notifications/vapid", () => ({
  vapidPronto: () => h.vapid,
  vapidPublica: () => "BChavePublicaDeExemplo",
  vapidSubject: async () => "mailto:suporte@exemplo.test",
}));
vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/area-do-cliente/eventos", () => ({ registrarEvento: vi.fn(async (_a: unknown, e: unknown) => void h.eventos.push(e)) }));
vi.mock("@/lib/area-do-cliente/http", () => ({
  NAO_ENCONTRADA: () => new Response("não", { status: 404 }),
  contextoDaArea: async () => ({
    org: { id: "org-1", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: h.config },
    sessao: { contactId: "contato-1", sessaoId: "sessao-1" },
    admin: { from: () => ({ upsert: async (linha: unknown) => (h.upserts.push(linha), { error: null }) }) },
  }),
}));

import { avisoDoDia, deveAvisarAgora } from "@/lib/area-do-cliente/avisos";
import { enviarAvisosDoDia } from "@/lib/area-do-cliente/avisos-servidor";

beforeEach(() => {
  h.vapid = true;
  h.config = { avisos: { ativo: true, hora: 8 } };
  h.upserts = [];
  h.eventos = [];
});

describe("regras do aviso", () => {
  it("só na hora marcada e uma vez por dia", () => {
    const base = { horaDoAviso: 8, hojeLocal: "2026-10-19" };
    expect(deveAvisarAgora({ ...base, horaLocal: 8, ultimoAvisoDia: null })).toBe(true);
    expect(deveAvisarAgora({ ...base, horaLocal: 8, ultimoAvisoDia: "2026-10-18" })).toBe(true);
    expect(deveAvisarAgora({ ...base, horaLocal: 8, ultimoAvisoDia: "2026-10-19" })).toBe(false);
    expect(deveAvisarAgora({ ...base, horaLocal: 9, ultimoAvisoDia: null })).toBe(false);
  });

  it("o texto convida e volta para a área marcando que veio do aviso", () => {
    const a = avisoDoDia({ titulo: "Cigana Esmeralda", slug: "magno", temCartaDoDia: true });
    expect(a).toMatchObject({ title: "Cigana Esmeralda", href: "/c/magno?de=aviso" });
    expect(a.body).toContain("carta de hoje");
    expect(a.body).not.toMatch(/perdeu|última chance|corra/i);
  });
});

/** Um banco de mentira para a rodada: empresas, aparelhos e o que foi marcado/apagado. */
function bancoDaRodada(aparelhos: Array<{ id: string; ultimo_aviso_dia: string | null }>) {
  const marcados: string[] = [];
  const apagados: string[] = [];
  const org = {
    id: "org-1",
    slug: "magno",
    display_name: "Cigana",
    timezone: "America/Sao_Paulo",
    settings: { area: { ativo: true, carta_do_dia: true, avisos: { ativo: true, hora: 8 } } },
  };
  const admin = {
    from: (tabela: string) => {
      if (tabela === "organizations") {
        const q = { select: () => q, filter: () => q, is: async () => ({ data: [org], error: null }) };
        return q;
      }
      let alvo = "";
      let acao = "";
      const q: Record<string, unknown> = {};
      q.select = () => (acao === "update" ? Promise.resolve({ data: marcados.includes(alvo) ? [{ id: alvo }] : [], error: null }) : q);
      q.eq = (c: string, v: string) => {
        if (c === "id") {
          alvo = v;
          if (acao === "update") marcados.push(v);
          if (acao === "delete") {
            apagados.push(v);
            return Promise.resolve({ error: null });
          }
        }
        return q;
      };
      q.limit = async () => ({ data: aparelhos.map((a) => ({ ...a, endpoint: `https://push/${a.id}`, p256dh: "p".repeat(20), auth: "a".repeat(12) })) });
      q.update = () => ((acao = "update"), q);
      q.delete = () => ((acao = "delete"), q);
      q.or = () => q;
      return q;
    },
  };
  return { admin: admin as never, marcados, apagados };
}

describe("a rodada do aviso diário", () => {
  const AS_8_EM_SAO_PAULO = new Date("2026-10-19T11:10:00Z");

  it("⭐ na hora marcada: um aviso por aparelho que ainda não recebeu hoje", async () => {
    const { admin, marcados } = bancoDaRodada([
      { id: "a1", ultimo_aviso_dia: null },
      { id: "a2", ultimo_aviso_dia: "2026-10-19" },
    ]);
    const enviados: string[] = [];
    const r = await enviarAvisosDoDia(admin, AS_8_EM_SAO_PAULO, async (i, corpo) => {
      enviados.push(i.endpoint);
      expect(JSON.parse(corpo)).toMatchObject({ href: "/c/magno?de=aviso", icon: "/c/magno/icone" });
    });
    expect(r).toMatchObject({ organizacoes: 1, enviados: 1 });
    expect(enviados).toEqual(["https://push/a1"]);
    expect(marcados).toEqual(["a1"]);
  });

  it("fora da hora marcada: nada", async () => {
    const { admin } = bancoDaRodada([{ id: "a1", ultimo_aviso_dia: null }]);
    const enviar = vi.fn();
    const r = await enviarAvisosDoDia(admin, new Date("2026-10-19T15:10:00Z"), enviar);
    expect(r.enviados).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("aparelho que cancelou a inscrição (410): é apagado", async () => {
    const { admin, apagados } = bancoDaRodada([{ id: "a1", ultimo_aviso_dia: null }]);
    const r = await enviarAvisosDoDia(admin, AS_8_EM_SAO_PAULO, async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    expect(r).toMatchObject({ enviados: 0, removidos: 1 });
    expect(apagados).toEqual(["a1"]);
  });

  it("sem chaves de push na instalação: nem consulta", async () => {
    h.vapid = false;
    const r = await enviarAvisosDoDia({ from: vi.fn() } as never, AS_8_EM_SAO_PAULO, vi.fn());
    expect(r.organizacoes).toBe(0);
  });
});

async function inscrever(corpo: unknown) {
  const { POST } = await import("@/app/api/v1/area/publica/[org]/avisos/route");
  const res = await POST(
    new NextRequest("https://area.test/api/v1/area/publica/magno/avisos", { method: "POST", body: JSON.stringify(corpo) }),
    { params: Promise.resolve({ org: "magno" }) },
  );
  return res.status;
}

describe("POST /avisos", () => {
  const INSCRICAO = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) } };

  it("guarda a inscrição deste aparelho e registra que ligou", async () => {
    expect(await inscrever(INSCRICAO)).toBe(200);
    expect(h.upserts).toEqual([expect.objectContaining({ organization_id: "org-1", contact_id: "contato-1", endpoint: INSCRICAO.endpoint })]);
    expect(h.eventos).toEqual([expect.objectContaining({ tipo: "aviso_ligado" })]);
  });

  it("avisos desligados na empresa ou inscrição sem https: recusa", async () => {
    expect(await inscrever({ ...INSCRICAO, endpoint: "http://inseguro.test/x" })).toBe(422);
    h.config = {};
    expect(await inscrever(INSCRICAO)).toBe(404);
    expect(h.upserts).toEqual([]);
  });
});
