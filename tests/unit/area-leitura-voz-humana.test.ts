/**
 * A LEITURA NARRADA NA VOZ HUMANA (Chatterbox em fila) — pedido do dono em 19/10/2026: "a conversa
 * ao vivo na voz rápida; a leitura, que não tem pressa, na voz mais humana".
 *
 * O que este arquivo guarda:
 *  - na fila: a resposta é `preparando`, com o lugar na fila, e nada é gravado;
 *  - pronto: o áudio humano é baixado e guardado como a narração da leitura;
 *  - a voz humana falhou ou caiu: a leitura sai na voz rápida — a pessoa não fica sem áudio;
 *  - o pedido leva o id da leitura (pedir de novo não duplica na fila) e a voz clonada escolhida;
 *  - sem a voz humana configurada, vale a rápida como sempre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  humanaConfigurada: true,
  pedir: vi.fn(),
  baixar: vi.fn(),
  falarRapida: vi.fn(),
  enviados: [] as Array<{ caminho: string; tamanho: number }>,
}));

vi.mock("@/lib/voz/servidor-humana", () => ({
  vozHumanaConfigurada: () => h.humanaConfigurada,
  pedirVozHumana: h.pedir,
  baixarVozHumana: h.baixar,
}));
vi.mock("@/lib/voz/servidor-proprio", () => ({ vozPropriaConfigurada: () => true, falarNaVozPropria: h.falarRapida }));
vi.mock("@/lib/area-do-cliente/leituras-servidor", () => ({
  lerTextoGravado: (t: string | null) => (t ? JSON.parse(t) : null),
}));

import { narrarLeitura } from "@/lib/area-do-cliente/leituras-voz";

const LEITURA = {
  id: "11111111-1111-4111-8111-111111111111",
  pago_at: "2026-10-19T10:00:00Z",
  cartas: [
    { id: 17, nome: "A Estrela", posicao: "O que pesa", sentido: "x" },
    { id: 10, nome: "A Roda", posicao: "O que está em movimento", sentido: "y" },
    { id: 6, nome: "Os Enamorados", posicao: "O conselho das cartas", sentido: "z" },
  ],
  texto: JSON.stringify({ cartas: ["a", "b", "c"], sintese: "s", passo: "p" }),
};

function admin(jaGuardada = false) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: LEITURA, error: null });
  let guardada = jaGuardada;
  return {
    from: () => q,
    storage: {
      from: () => ({
        createSignedUrl: async () => (guardada ? { data: { signedUrl: "https://storage/narracao.mp3" } } : { data: null }),
        upload: async (caminho: string, audio: Buffer) => {
          h.enviados.push({ caminho, tamanho: audio.length });
          guardada = true;
          return { error: null };
        },
      }),
    },
  } as never;
}

const narrar = (a = admin()) => narrarLeitura(a, "org-1", "contato-1", LEITURA.id, "Maria", { humana: { voz: "clone_abc" } });

beforeEach(() => {
  h.humanaConfigurada = true;
  h.pedir.mockReset();
  h.baixar.mockReset().mockResolvedValue(Buffer.alloc(5000, 1));
  h.falarRapida.mockReset().mockResolvedValue(Buffer.alloc(3000, 2));
  h.enviados = [];
});

describe("leitura narrada na voz humana", () => {
  it("⭐ na fila: responde preparando com o lugar, e não grava nada", async () => {
    h.pedir.mockResolvedValue({ id: `leitura-${LEITURA.id}`, status: "na_fila", posicao: 2 });
    expect(await narrar()).toEqual({ ok: false, motivo: "preparando", posicao: 2 });
    expect(h.enviados).toEqual([]);
    expect(h.falarRapida).not.toHaveBeenCalled();
  });

  it("o pedido leva o id da leitura e a voz clonada escolhida", async () => {
    h.pedir.mockResolvedValue({ id: "x", status: "gerando", posicao: 0 });
    await narrar();
    expect(h.pedir).toHaveBeenCalledWith(expect.objectContaining({ id: `leitura-${LEITURA.id}`, voz: "clone_abc" }));
    expect(String(h.pedir.mock.calls[0]![0].texto)).toContain("Maria, as suas cartas chegaram.");
  });

  it("⭐ pronto: guarda o áudio humano como a narração", async () => {
    h.pedir.mockResolvedValue({ id: `leitura-${LEITURA.id}`, status: "pronto", posicao: 0 });
    const r = await narrar();
    expect(r).toEqual({ ok: true, url: "https://storage/narracao.mp3" });
    expect(h.enviados).toEqual([{ caminho: `org-1/leitura/narracoes/${LEITURA.id}.mp3`, tamanho: 5000 }]);
    expect(h.falarRapida).not.toHaveBeenCalled();
  });

  it("⭐ a voz humana falhou ou caiu: a leitura sai na voz rápida", async () => {
    h.pedir.mockResolvedValueOnce({ id: "x", status: "falhou", posicao: 0 });
    expect((await narrar()).ok).toBe(true);
    h.pedir.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect((await narrar()).ok).toBe(true);
    expect(h.falarRapida).toHaveBeenCalledTimes(2);
  });

  it("narração já guardada: devolve sem pedir nada", async () => {
    expect(await narrar(admin(true))).toEqual({ ok: true, url: "https://storage/narracao.mp3" });
    expect(h.pedir).not.toHaveBeenCalled();
  });

  it("sem a voz humana configurada: vale a rápida", async () => {
    h.humanaConfigurada = false;
    expect((await narrar()).ok).toBe(true);
    expect(h.pedir).not.toHaveBeenCalled();
    expect(h.falarRapida).toHaveBeenCalledOnce();
  });
});
