/**
 * RECOMEÇAR O FLUXO PARA O MESMO CONTATO.
 *
 * ─── O defeito, medido em produção ───────────────────────────────────────────
 *
 * Um lead de anúncio teve o fluxo encerrado no meio (um envio recusado). A rota
 * que inscreve um contato num fluxo existia, mas NENHUMA tela a chamava: para
 * recolocar a pessoa no fluxo só restava esperar ela mandar outra mensagem — ou
 * mexer no banco à mão.
 *
 * O botão mora no dossiê do follow-up encerrado, que é para onde quem investiga
 * "o que aconteceu com este contato?" já foi levado.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  dossie: null as Record<string, unknown> | null,
  recomecar: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/hooks/i18n/useLocaleDeData", async () => {
  const { ptBR } = await import("date-fns/locale");
  return { useLocaleDeData: () => ptBR, useTagDeIdioma: () => "pt-BR" };
});
vi.mock("@/hooks/followup/useFollowupQueue", () => ({
  useCancelFollowupEnrollment: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/followup/useFollowupEnrollment", async (original) => {
  const real = await original<typeof import("@/hooks/followup/useFollowupEnrollment")>();
  return {
    ...real,
    useFollowupEnrollment: () => ({ data: h.dossie, isLoading: false, isError: false }),
    useIntervirNoFollowup: () => ({ mutate: vi.fn(), isPending: false }),
    useRecomecarFollowup: () => ({ mutate: h.recomecar, isPending: false }),
  };
});
vi.mock("@/app/app/ai/followups/enrollments/[id]/_components/PlanoDeTempo", () => ({ PlanoDeTempoBloco: () => null }));

const { DossieDoFollowup } = await import("@/app/app/ai/followups/enrollments/[id]/_components/DossieDoFollowup");
const { followupEncerrado } = await import("@/hooks/followup/useFollowupEnrollment");

const dossie = (mudancas: Record<string, unknown> = {}) => ({
  id: "enr-1",
  status: "cancelled",
  current_node_id: "action-4",
  next_eval_at: null,
  claimed_until: null,
  motor_ocupado: false,
  started_at: "2026-10-02T17:52:49Z",
  completed_at: "2026-10-02T17:54:33Z",
  updated_at: "2026-10-02T17:54:33Z",
  outcome: null,
  cancel_reason: "O envio foi recusado pelas regras do atendimento.",
  last_error: null,
  attempts: 0,
  max_attempts: 3,
  steps_taken: 3,
  contact: { id: "contato-1", name: "Marina" },
  flow: { pointer_id: "fluxo-1", name: "Noivas", version_id: "v1" },
  agent_name: null,
  no_atual: null,
  nos: [],
  saidas: [],
  eventos: [],
  eventos_truncados: false,
  plano_de_tempo: null,
  autores: {},
  ...mudancas,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.dossie = dossie();
});

describe("quando o follow-up acabou", () => {
  it("cancelado, concluído ou morto: acabou. Vivo, pausado ou esperando resposta: não", () => {
    for (const status of ["cancelled", "completed", "dead"]) {
      expect(followupEncerrado({ status, completed_at: null })).toBe(true);
    }
    for (const status of ["active", "waiting_reply", "paused_manual", "paused_handoff", "dormente"]) {
      expect(followupEncerrado({ status, completed_at: null })).toBe(false);
    }
    // Estado que a tela não conhece, mas com data de encerramento: acabou.
    expect(followupEncerrado({ status: "outro", completed_at: "2026-10-02T17:54:33Z" })).toBe(true);
  });
});

describe("o botão no dossiê", () => {
  it("⭐ follow-up encerrado: oferece recomeçar, e inscreve o MESMO contato no MESMO fluxo", () => {
    render(<DossieDoFollowup id="enr-1" canWrite />);
    fireEvent.click(screen.getByTestId("dossie-recomecar"));
    expect(h.recomecar).toHaveBeenCalledTimes(1);
    expect(h.recomecar.mock.calls[0]![0]).toEqual({ pointerId: "fluxo-1", contactId: "contato-1" });
  });

  it("depois de recomeçar, a tela vai para o follow-up NOVO — o antigo fica com a história dele", () => {
    h.recomecar.mockImplementation((_p: unknown, opts: { onSuccess: (novo: { id: string }) => void }) => opts.onSuccess({ id: "enr-2" }));
    render(<DossieDoFollowup id="enr-1" canWrite />);
    fireEvent.click(screen.getByTestId("dossie-recomecar"));
    expect(h.push).toHaveBeenCalledWith("/app/ai/followups/enrollments/enr-2");
  });

  it("follow-up VIVO não oferece: o banco recusaria uma segunda inscrição do mesmo contato", () => {
    h.dossie = dossie({ status: "active", completed_at: null, next_eval_at: "2026-10-02T18:00:00Z" });
    render(<DossieDoFollowup id="enr-1" canWrite />);
    expect(screen.queryByTestId("dossie-recomecar")).not.toBeInTheDocument();
  });

  it("fluxo que foi removido: não há onde recomeçar, e o botão não existe", () => {
    h.dossie = dossie({ flow: { pointer_id: "fluxo-1", name: null, version_id: "v1" } });
    render(<DossieDoFollowup id="enr-1" canWrite />);
    expect(screen.queryByTestId("dossie-recomecar")).not.toBeInTheDocument();
  });

  it("quem só lê não recomeça", () => {
    render(<DossieDoFollowup id="enr-1" canWrite={false} />);
    expect(screen.queryByTestId("dossie-recomecar")).not.toBeInTheDocument();
  });
});
