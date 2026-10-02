import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerCtx } from "@/lib/api/handlers/types";

const auditSpy = vi.fn(async () => undefined);

vi.mock("@/lib/audit", () => ({
  audit: auditSpy,
  isServiceRoleConfigured: () => false,
  hashEmail: (e: string) => e,
}));

/**
 * O cliente de SERVIÇO que apaga os rastros de fluxo antes de tudo. Registra na
 * mesma lista de chamadas (com o prefixo "servico:") para o teste ver a ORDEM, e
 * guarda os filtros: sem o de organização, apagaria fluxo de outra empresa.
 */
const filtrosDoServico: Record<string, Array<[string, unknown]>> = {};
let erroDoServico: { tabela: string; code: string; message: string } | null = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => ({
      delete: () => {
        chamadas.push({ tabela: `servico:${tabela}`, op: "delete" });
        const filtros: Array<[string, unknown]> = (filtrosDoServico[tabela] = []);
        const cadeia = {
          eq: (coluna: string, valor: unknown) => {
            filtros.push([coluna, valor]);
            return cadeia;
          },
          then: (r: (v: unknown) => unknown) =>
            r({ error: erroDoServico?.tabela === tabela ? { code: erroDoServico.code, message: erroDoServico.message } : null }),
        };
        return cadeia;
      },
    }),
  }),
}));

const ORG = "c05e7a00-0000-4000-8000-000000000001";
const CONTATO = "c05e7a00-0000-4000-8000-0000000000c1";
const USUARIO = "c05e7a00-0000-4000-8000-0000000000a1";

const chamadas: Array<{ tabela: string; op: string }> = [];
const contagens: Array<{ tabela: string; filtros: Array<[string, unknown]> }> = [];

interface CadeiaContagem {
  eq: (coluna: string, valor: unknown) => CadeiaContagem;
  maybeSingle: () => Promise<{ data: null; error: null }>;
  then: (resolve: (valor: unknown) => unknown) => unknown;
}

interface OpcoesFake {
  missing?: boolean;
  /** DELETE de messages/conversations falha com 23503 (comportamento de antes da #752). */
  fk?: boolean;
  /** Só o DELETE da ficha (contacts) falha com 23503. */
  fkNaFicha?: boolean;
  /** Quantos vínculos RESTRICT a pré-checagem encontra na agenda. */
  vinculos?: number;
  /** A contagem do vínculo falha (tabela/RLS fora do ar). */
  erroContagem?: { message: string };
}

function clienteFalso(opts?: OpcoesFake): unknown {
  return {
    from: (tabela: string) => {
      const erroDoDelete =
        (opts?.fk && tabela !== "contacts") || (opts?.fkNaFicha && tabela === "contacts")
          ? { code: "23503", message: "fk" }
          : null;
      const del = {
        eq: () => del,
        select: () => del,
        // O DELETE da ficha passa por `.select("id").maybeSingle()`: o erro do
        // 23503 tem de sair por aqui, não só pelo `then` (que serve os DELETE
        // de messages/conversations, aguardados direto).
        maybeSingle: async () =>
          opts?.missing
            ? { data: null, error: erroDoDelete }
            : { data: { id: CONTATO }, error: erroDoDelete },
        then: (r: (v: unknown) => unknown) => r({ error: erroDoDelete }),
      };
      return {
        // `select("id", {count, head})` é a pré-checagem de vínculo: só conta.
        select: (_colunas?: string, opcoes?: { count?: string; head?: boolean }) => {
          if (opcoes?.count) {
            const filtros: Array<[string, unknown]> = [];
            const cadeia: CadeiaContagem = {
              eq: (coluna, valor) => {
                filtros.push([coluna, valor]);
                return cadeia;
              },
              maybeSingle: async () => ({ data: null, error: null }),
              then: (resolve) => {
                contagens.push({ tabela, filtros });
                return resolve(
                  opts?.erroContagem
                    ? { count: null, error: opts.erroContagem }
                    : { count: opts?.vinculos ?? 0, error: null },
                );
              },
            };
            return cadeia;
          }
          return {
            eq: () => ({
              eq: () => ({
                maybeSingle: async () =>
                  opts?.missing
                    ? { data: null, error: null }
                    : { data: { id: CONTATO, organization_id: ORG }, error: null },
              }),
            }),
          };
        },
        delete: () => {
          chamadas.push({ tabela, op: "delete" });
          return del;
        },
      };
    },
    rpc: () => ({ then: (r: (v: unknown) => unknown) => r({ error: null }) }),
  };
}

function ctxFalso(): HandlerCtx {
  return { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" };
}

function ultimaAuditoria(): Record<string, unknown> | undefined {
  return (auditSpy.mock.calls.at(-1) as unknown as [Record<string, unknown>] | undefined)?.[0];
}

describe("deleteContactHandler", () => {
  beforeEach(() => {
    auditSpy.mockClear();
    chamadas.length = 0;
    contagens.length = 0;
    erroDoServico = null;
    for (const k of Object.keys(filtrosDoServico)) delete filtrosDoServico[k];
  });

  it("os rastros de fluxo saem PRIMEIRO, pelo cliente de serviço, filtrados por organização e contato", async () => {
    // Medido em produção: o trigger que protege os registros internos do fluxo
    // recusava a cascata feita com sessão de usuário, a ficha não saía, e as
    // mensagens e a conversa já tinham sido apagadas.
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await deleteContactHandler(clienteFalso() as never, ctxFalso(), CONTATO);
    expect(chamadas.map((c) => c.tabela)).toEqual([
      "servico:job_queue",
      "servico:followup_enrollments",
      "messages",
      "conversations",
      "contacts",
    ]);
    expect(filtrosDoServico.job_queue).toEqual([
      ["organization_id", ORG],
      ["contact_id", CONTATO],
      ["kind", "followup_turn"],
    ]);
    expect(filtrosDoServico.followup_enrollments).toEqual([
      ["organization_id", ORG],
      ["contact_id", CONTATO],
    ]);
  });

  it("se os rastros de fluxo não saem, NADA do histórico é tocado", async () => {
    erroDoServico = { tabela: "job_queue", code: "42501", message: "followup_job_internal" };
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(deleteContactHandler(clienteFalso() as never, ctxFalso(), CONTATO)).rejects.toMatchObject({ status: 500 });
    expect(chamadas.map((c) => c.tabela)).toEqual(["servico:job_queue"]);
    expect(ultimaAuditoria()).toMatchObject({
      action: "contact.delete_blocked",
      metadata: { motivo: "falha_ao_apagar", apagados: [] },
    });
  });

  it("apaga mensagens e conversas antes do contato e audita", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    const out = await deleteContactHandler(
      clienteFalso() as never,
      { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" },
      CONTATO,
    );
    expect(out).toEqual({ id: CONTATO });
    expect(chamadas.map((c) => c.tabela).filter((t) => !t.startsWith("servico:"))).toEqual(["messages", "conversations", "contacts"]);
    // A pré-checagem da #752 conta o vínculo com os DOIS filtros (contato +
    // organização): sem o de organização, contato de outra org bloquearia.
    expect(contagens).toEqual([
      { tabela: "calendar_appointments", filtros: [["contact_id", CONTATO], ["organization_id", ORG]] },
    ]);
    const ultima = (auditSpy.mock.calls.at(-1) as unknown as [Record<string, unknown>] | undefined)?.[0];
    expect(ultima).toMatchObject({
      action: "contact.deleted",
      resourceId: CONTATO,
      organizationId: ORG,
    });
  });

  it("contato com compromisso na agenda: 409 e o histórico fica intacto (issue #752)", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ vinculos: 1 }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 409, code: "state_conflict" });
    // O ponto da issue: nada foi apagado antes de saber que a ficha não sai.
    expect(chamadas).toEqual([]);
    expect(auditSpy).not.toHaveBeenCalledWith(expect.objectContaining({ action: "contact.deleted" }));
    expect(ultimaAuditoria()).toMatchObject({
      action: "contact.delete_blocked",
      resourceId: CONTATO,
      organizationId: ORG,
      metadata: { motivo: "vinculo_restrict", vinculos: ["1 compromisso(s) na agenda"], apagados: [] },
    });
  });

  it("ficha falha depois do histórico apagado: audita o que saiu e propaga o 409", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ fkNaFicha: true }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 409, code: "state_conflict" });
    expect(chamadas.map((c) => c.tabela).filter((t) => !t.startsWith("servico:"))).toEqual(["messages", "conversations", "contacts"]);
    // Se o RESTRICT escapar da pré-checagem (corrida, RLS, tabela nova), o
    // estrago fica registrado em vez de sumir.
    expect(ultimaAuditoria()).toMatchObject({
      action: "contact.delete_blocked",
      resourceId: CONTATO,
      metadata: {
        motivo: "falha_ao_apagar",
        vinculos: [],
        apagados: ["job_queue", "followup_enrollments", "messages", "conversations"],
      },
    });
  });

  it("falha ao contar o vínculo não segue apagando o histórico", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(clienteFalso({ erroContagem: { message: "contagem fora do ar" } }) as never, ctxFalso(), CONTATO),
    ).rejects.toMatchObject({ status: 500, code: "internal_error" });
    expect(chamadas).toEqual([]);
  });

  it("404 se o contato não existe na org", async () => {
    const { deleteContactHandler } = await import("@/app/api/v1/contacts/_handler");
    await expect(
      deleteContactHandler(
        clienteFalso({ missing: true }) as never,
        { organization_id: ORG, actor: { type: "user", id: USUARIO }, requestId: "req-1" },
        CONTATO,
      ),
    ).rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(auditSpy).not.toHaveBeenCalled();
  });
});
