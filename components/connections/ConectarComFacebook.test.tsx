import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConectarComFacebook } from "./ConectarComFacebook";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: h }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const login = { appId: "app1", configId: "cfg1", versao: "v22.0" };

type AoVoltar = (resposta: { authResponse?: { code?: string } | null }) => void;
let aoVoltar: AoVoltar | null = null;
let opcoesDoLogin: Record<string, unknown> | null = null;
const init = vi.fn();

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  aoVoltar = null;
  opcoesDoLogin = null;
  window.FB = {
    init,
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

function mount(conectado = false) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConectarComFacebook login={login} conectado={conectado} />
    </QueryClientProvider>,
  );
}

const avisoDaJanela = (origem: string, dados: unknown): void => {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { origin: origem, data: JSON.stringify(dados) }));
  });
};

const botao = () => screen.findByRole("button", { name: "Conectar com Facebook" });

it("⭐ um clique: abre a janela do cadastro e manda o código com a conta e o número escolhidos", async () => {
  mount();
  const b = await botao();
  await waitFor(() => expect(b).toBeEnabled());
  expect(init).toHaveBeenCalledWith(expect.objectContaining({ appId: "app1", version: "v22.0" }));

  fireEvent.click(b);
  expect(opcoesDoLogin).toMatchObject({ config_id: "cfg1", response_type: "code", override_default_response_type: true });

  avisoDaJanela("https://www.facebook.com", {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { phone_number_id: "num1", waba_id: "waba1" },
  });
  act(() => aoVoltar?.({ authResponse: { code: "cod-da-janela" } }));

  await waitFor(() =>
    expect(h.post).toHaveBeenCalledWith("/api/v1/channels/official", {
      code: "cod-da-janela",
      phone_number_id: "num1",
      waba_id: "waba1",
    }),
  );
});

it("aviso que não vem do Facebook é ignorado: o código segue sem conta nem número", async () => {
  mount();
  const b = await botao();
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(b);

  avisoDaJanela("https://facebook.com.exemplo.test", {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { phone_number_id: "num-falso", waba_id: "waba-falsa" },
  });
  act(() => aoVoltar?.({ authResponse: { code: "cod-da-janela" } }));

  await waitFor(() => expect(h.post).toHaveBeenCalledWith("/api/v1/channels/official", { code: "cod-da-janela" }));
});

it("janela fechada antes do fim: nada é enviado e a tela diz que nada conectou", async () => {
  mount();
  const b = await botao();
  await waitFor(() => expect(b).toBeEnabled());
  fireEvent.click(b);
  act(() => aoVoltar?.({ authResponse: null }));

  await screen.findByText("A janela do Facebook foi fechada antes do fim. Nada foi conectado.");
  expect(h.post).not.toHaveBeenCalled();
});

it("SDK barrado pelo navegador: o botão fica desabilitado e a tela diz por quê", async () => {
  delete window.FB;
  mount();
  const script = document.head.querySelector<HTMLScriptElement>('script[src*="sdk.js"]');
  expect(script).not.toBeNull();
  act(() => script!.onerror?.(new Event("error")));

  await screen.findByTestId("sdk-bloqueado");
  expect(screen.getByTestId("btn-conectar-com-facebook")).toBeDisabled();
});

it("⭐ marcado para manter no celular, a janela abre no modo de coexistência; desmarcado, no modo padrão", async () => {
  mount();
  const b = await botao();
  await waitFor(() => expect(b).toBeEnabled());

  fireEvent.click(b);
  expect((opcoesDoLogin as { extras: { featureType: string } }).extras.featureType).toBe("");
  act(() => aoVoltar?.({ authResponse: null }));

  fireEvent.click(screen.getByTestId("manter-no-celular"));
  fireEvent.click(b);
  expect((opcoesDoLogin as { extras: { featureType: string } }).extras.featureType).toBe("whatsapp_business_app_onboarding");
});

it("com canal já conectado, o botão diz reconectar", async () => {
  mount(true);
  await screen.findByRole("button", { name: "Reconectar com Facebook" });
});
