import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";

import { EscolherConexao } from "./EscolherConexao";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: h }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const login = { appId: "app1", configId: "cfg1", versao: "v22.0" };

type AoVoltar = (resposta: { authResponse?: { code?: string } | null }) => void;
let aoVoltar: AoVoltar | null = null;
let opcoesDoLogin: Record<string, unknown> | null = null;

/**
 * "Conectar WhatsApp" — o ÚNICO botão de conectar número. Cobra-se que a
 * escolha diga a diferença que IMPORTA, com os números do motor, e que cada
 * forma siga em janela: QR pede o QR, API oficial abre o Facebook ali mesmo.
 */
describe("Conectar WhatsApp — a escolha", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    aoVoltar = null;
    opcoesDoLogin = null;
    window.FB = {
      init: vi.fn(),
      login: (volta, opcoes) => {
        aoVoltar = volta;
        opcoesDoLogin = opcoes;
      },
    };
    h.post.mockResolvedValue({ data: { connected: true, displayName: "Loja", phoneNumber: "+5531999998888" } });
  });
  afterEach(() => {
    delete window.FB;
  });

  const montar = (props: Partial<Parameters<typeof EscolherConexao>[0]> = {}) => {
    const onEscolher = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <EscolherConexao onEscolher={onEscolher} {...props} />
      </QueryClientProvider>,
    );
    return onEscolher;
  };
  const abrir = (props: Partial<Parameters<typeof EscolherConexao>[0]> = {}) => {
    const onEscolher = montar(props);
    fireEvent.click(screen.getByTestId("conectar-whatsapp"));
    return onEscolher;
  };

  it("fechado, só o botão aparece — a escolha não ocupa a tela de quem já conectou", () => {
    montar();
    expect(screen.queryByTestId("conexao-qr")).toBeNull();
    expect(screen.getByTestId("conectar-whatsapp")).toBeTruthy();
  });

  it("mostra as duas formas lado a lado, cada uma dizendo para que serve", () => {
    abrir();
    expect(within(screen.getByTestId("conexao-qr")).getByText("Indicado para atendimento e conversa.")).toBeTruthy();
    expect(within(screen.getByTestId("conexao-oficial")).getByText("Indicado para funil fixo e volume.")).toBeTruthy();
  });

  it("os limites do QR vêm dos MESMOS padrões do motor — não de números copiados para a tela", () => {
    abrir();
    const qr = screen.getByTestId("conexao-qr").textContent ?? "";
    expect(qr).toContain(`${SPINNING_DEFAULTS.repetitionThreshold + 1}ª`);
    expect(qr).toContain(`${PACING_DEFAULTS.warmupDailyCaps[0]!.cap} envios por dia`);
    expect(qr).toContain(`${PACING_DEFAULTS.windowStartHour}h–${PACING_DEFAULTS.windowEndHour}h`);
    expect(qr).toContain("risco de banimento");
  });

  it("o lado oficial diz o que ele dispensa e o que ele cobra — sem prometer só vantagem", () => {
    abrir();
    const oficial = screen.getByTestId("conexao-oficial").textContent ?? "";
    expect(oficial).toContain("Sem risco de banimento por volume.");
    expect(oficial).toContain("A Meta pode cobrar");
    expect(oficial).toContain("24 horas");
  });

  it("escolher QR pede o QR e fecha a escolha", () => {
    const onEscolher = abrir();
    fireEvent.click(screen.getByTestId("escolher-qr"));
    expect(onEscolher).toHaveBeenCalledWith("qr");
    expect(screen.queryByTestId("conexao-qr")).toBeNull();
  });

  it("⭐ com o login do Facebook configurado, API oficial abre a janela da Meta ALI MESMO — sem levar a outra aba", async () => {
    const onEscolher = abrir({ login });
    const b = screen.getByTestId("escolher-oficial");
    await waitFor(() => expect(b).toBeEnabled());
    expect(b.textContent).toBe("Conectar com Facebook");
    expect(screen.getByTestId("conectar-qualquer-portfolio")).toBeTruthy();

    fireEvent.click(b);

    expect(onEscolher).not.toHaveBeenCalled();
    expect(opcoesDoLogin).toEqual({
      config_id: "cfg1",
      response_type: "code",
      override_default_response_type: true,
      extras: {},
    });
  });

  it("concluída a janela, o código vai ao servidor e a escolha fecha", async () => {
    abrir({ login });
    const b = screen.getByTestId("escolher-oficial");
    await waitFor(() => expect(b).toBeEnabled());
    fireEvent.click(b);
    act(() => aoVoltar?.({ authResponse: { code: "cod" } }));

    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/channels/official", { code: "cod" }));
    await waitFor(() => expect(screen.queryByTestId("conexao-oficial")).toBeNull());
  });

  it("manter no celular abre a janela no modo de coexistência", async () => {
    abrir({ login });
    const b = screen.getByTestId("escolher-oficial");
    await waitFor(() => expect(b).toBeEnabled());
    fireEvent.click(screen.getByTestId("manter-no-celular"));
    fireEvent.click(b);
    expect(opcoesDoLogin?.extras).toEqual({ featureType: "whatsapp_business_app_onboarding" });
  });

  it("com número oficial já conectado, o botão diz trocar", async () => {
    abrir({ login, oficialConectado: true });
    await waitFor(() => expect(screen.getByTestId("escolher-oficial").textContent).toBe("Trocar o número com Facebook"));
  });

  it("sem login configurado na instalação, API oficial leva ao formulário colado", () => {
    const onEscolher = abrir();
    fireEvent.click(screen.getByTestId("escolher-oficial"));
    expect(onEscolher).toHaveBeenCalledWith("oficial");
  });
});
