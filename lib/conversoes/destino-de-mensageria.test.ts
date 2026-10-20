/**
 * Venda de conversa num número que não é oficial ainda vai para o conjunto de dados da empresa.
 * Medido em 20/10/2026: com o número oficial banido e arquivado, toda venda era pulada
 * (`sem_conta_do_whatsapp` / `canal_sem_credencial`) enquanto as campanhas otimizavam por compra.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const credDoCanal = vi.fn();
const credDaTela = vi.fn();
vi.mock("@/lib/channels/meta/credentials", () => ({ resolveMetaCreds: (...a: unknown[]) => credDoCanal(...a) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({ lerCredencial: (...a: unknown[]) => credDaTela(...a) }));
vi.mock("@/lib/channels/meta/conjunto-de-dados-da-conta", () => ({ conjuntoDeDadosDaConta: vi.fn() }));

import { lerDestinoDeMensageria } from "./destino-de-mensageria";

/** Um client falso: cada tabela devolve o que o caso manda, para qualquer cadeia de filtros. */
function adminCom(linhas: { conversations: unknown[]; channel_sessions: unknown[] }) {
  return {
    from(tabela: "conversations" | "channel_sessions") {
      const fim = { data: linhas[tabela], error: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cadeia: any = new Proxy(
        { then: (ok: (v: unknown) => unknown) => Promise.resolve(fim).then(ok) },
        { get: (alvo, p) => (p in alvo ? alvo[p as "then"] : () => cadeia) },
      );
      return cadeia;
    },
  } as never;
}

const CANAL_ANTIGO = { id: "c1", meta_waba_id: "WABA", meta_phone_number_id: "PN", metadata: { conversions_dataset_id: "DS" } };

describe("lerDestinoDeMensageria", () => {
  beforeEach(() => {
    credDoCanal.mockReset().mockResolvedValue(null);
    credDaTela.mockReset().mockResolvedValue({ ok: true, credencial: { datasetId: "965", accessToken: "TOKEN_DA_TELA", testEventCode: null } });
  });

  it("⭐ o caso medido: contato só do número por QR — vai para o conjunto da empresa com o token da tela", async () => {
    const r = await lerDestinoDeMensageria(adminCom({ conversations: [], channel_sessions: [CANAL_ANTIGO] }), "org", "contato");
    expect(r).toEqual({ ok: true, destino: { contaDoWhatsApp: "WABA", datasetId: "DS", accessToken: "TOKEN_DA_TELA" } });
  });

  it("⭐ contato do número oficial arquivado (sem token): mesmo conjunto, token da tela", async () => {
    const r = await lerDestinoDeMensageria(adminCom({ conversations: [{ channel_sessions: CANAL_ANTIGO }], channel_sessions: [] }), "org", "contato");
    expect(r).toMatchObject({ ok: true, destino: { datasetId: "DS", accessToken: "TOKEN_DA_TELA" } });
  });

  it("canal oficial com token vivo: o token do canal vence o da tela", async () => {
    credDoCanal.mockResolvedValue({ token: "TOKEN_DO_CANAL" });
    const r = await lerDestinoDeMensageria(adminCom({ conversations: [{ channel_sessions: CANAL_ANTIGO }], channel_sessions: [] }), "org", "contato");
    expect(r).toMatchObject({ ok: true, destino: { accessToken: "TOKEN_DO_CANAL" } });
  });

  it("sem conjunto na empresa, ou sem token nenhum: pendência com nome, sem envio", async () => {
    expect(await lerDestinoDeMensageria(adminCom({ conversations: [], channel_sessions: [] }), "org", "c")).toEqual({ ok: false, motivo: "sem_conta_do_whatsapp" });
    credDaTela.mockResolvedValue({ ok: false, motivo: "sem_conexao" });
    expect(await lerDestinoDeMensageria(adminCom({ conversations: [], channel_sessions: [CANAL_ANTIGO] }), "org", "c")).toEqual({ ok: false, motivo: "canal_sem_credencial" });
  });
});
