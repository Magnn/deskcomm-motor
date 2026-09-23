/**
 * A ABA "VOZ" FAZ O QUE PROMETE — provada pela tela, não pela função.
 *
 * O que a tela precisa garantir: o operador vê as vozes do serviço escolhido,
 * filtra por gênero, escolhe uma, e o que vai para o servidor é EXATAMENTE a
 * config que a engine lê (`config.voice_reply`); e a clonagem NÃO sai sem a
 * declaração de consentimento marcada.
 *
 * `fetch` e o `apiClient` são dublados: a rede é do provedor, a tela é nossa.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { VozDoAgente } from "@/app/app/ai/agents/[id]/_components/VozDoAgente";
import { TEXTO_DO_CONSENTIMENTO } from "@/lib/voz/consentimento";
import { voiceReplySchema } from "@/lib/voz/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

const RESPOSTA_DE_VOZES = {
  data: {
    provedores: [
      { id: "openai", rotulo: "OpenAI", quandoUsar: "Usa a mesma chave.", clona: false, ondePegarAChave: "", prefixoDaChave: "sk-…", configurado: true },
      { id: "elevenlabs", rotulo: "ElevenLabs", quandoUsar: "Vozes expressivas.", clona: true, ondePegarAChave: "", prefixoDaChave: "sk_…", configurado: true },
    ],
    vozes: [
      { provedor: "openai", id: "coral", nome: "Coral", genero: "feminina", categoria: "pronta", descricao: "Calorosa." },
      { provedor: "openai", id: "onyx", nome: "Onyx", genero: "masculina", categoria: "pronta", descricao: "Grave." },
      { provedor: "elevenlabs", id: "clone-1", nome: "Esmeralda", genero: "feminina", categoria: "clonada" },
    ],
  },
};

function renderizar(config: Record<string, unknown> | null = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VozDoAgente agentId={AGENTE} config={config} active />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  api.get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/ai/voices") return RESPOSTA_DE_VOZES;
    if (url === "/api/v1/ai/credentials") return { data: [] };
    throw new Error(`GET inesperado: ${url}`);
  });
  api.patch.mockResolvedValue({ data: {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("aba Voz", () => {
  it("começa desligada, sem voz, e lista os dois serviços", async () => {
    renderizar({});
    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("ElevenLabs")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Responder em áudio" })).toHaveAttribute("aria-checked", "false");
    // Sem serviço escolhido, não há lista de vozes nem ajustes.
    expect(screen.queryByTestId("lista-de-vozes")).not.toBeInTheDocument();
  });

  it("escolher o serviço mostra as vozes dele; o filtro de gênero separa feminina e masculina", async () => {
    renderizar({});
    fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));

    const lista = await screen.findByTestId("lista-de-vozes");
    expect(lista).toHaveTextContent("Coral");
    expect(lista).toHaveTextContent("Onyx");
    expect(lista).not.toHaveTextContent("Esmeralda"); // é do outro serviço

    fireEvent.click(screen.getByRole("button", { name: "Masculinas" }));
    expect(screen.getByTestId("lista-de-vozes")).toHaveTextContent("Onyx");
    expect(screen.getByTestId("lista-de-vozes")).not.toHaveTextContent("Coral");

    fireEvent.click(screen.getByRole("button", { name: "Femininas" }));
    expect(screen.getByTestId("lista-de-vozes")).toHaveTextContent("Coral");
    expect(screen.getByTestId("lista-de-vozes")).not.toHaveTextContent("Onyx");
  });

  it("voz clonada aparece marcada como clonada", async () => {
    renderizar({});
    fireEvent.click(await screen.findByRole("button", { name: /ElevenLabs/ }));
    const lista = await screen.findByTestId("lista-de-vozes");
    expect(lista).toHaveTextContent("Esmeralda");
    expect(lista).toHaveTextContent("Clonada");
  });

  it("salva a config que a engine lê: config.voice_reply, no PATCH do agente", async () => {
    renderizar({});
    fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));
    await screen.findByTestId("lista-de-vozes");

    // "Usar" da Coral (a primeira voz da lista) e liga o interruptor.
    fireEvent.click(screen.getAllByRole("button", { name: "Usar" })[0]!);
    fireEvent.click(screen.getByRole("switch", { name: "Responder em áudio" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar voz" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const [url, corpo] = api.patch.mock.calls[0] as [string, { config: { voice_reply: Record<string, unknown> } }];
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}`);
    const salvo = corpo.config.voice_reply;
    expect(salvo).toMatchObject({ enabled: true, mode: "mirror", provider: "openai", voice_id: "coral", voice_name: "Coral" });
    // O contrato: o que a tela grava tem de passar no schema que a engine usa.
    expect(voiceReplySchema.safeParse(salvo).success).toBe(true);
  });

  it("não deixa ligar sem escolher uma voz", async () => {
    renderizar({});
    fireEvent.click(await screen.findByRole("switch", { name: "Responder em áudio" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar voz" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("carrega o que já estava salvo", async () => {
    renderizar({ voice_reply: { enabled: true, provider: "openai", voice_id: "onyx", voice_name: "Onyx" } });
    const chave = await screen.findByRole("switch", { name: "Responder em áudio" });
    expect(chave).toHaveAttribute("aria-checked", "true");
    const lista = await screen.findByTestId("lista-de-vozes");
    expect(lista).toHaveTextContent("Escolhida");
  });

  it("config com shape estranho no banco abre desligada, sem quebrar a tela", async () => {
    renderizar({ voice_reply: "lixo" });
    expect(await screen.findByRole("switch", { name: "Responder em áudio" })).toHaveAttribute("aria-checked", "false");
  });

  describe("clonar voz", () => {
    async function abrirClonagem() {
      renderizar({});
      fireEvent.click(await screen.findByRole("button", { name: /ElevenLabs/ }));
      return screen.findByTestId("clonar-voz");
    }

    it("só existe para o serviço que clona", async () => {
      renderizar({});
      fireEvent.click(await screen.findByRole("button", { name: /OpenAI/ }));
      await screen.findByTestId("lista-de-vozes");
      expect(screen.queryByTestId("clonar-voz")).not.toBeInTheDocument();
    });

    it("mostra o texto de consentimento e mantém o botão travado até marcá-lo", async () => {
      const cartao = await abrirClonagem();
      expect(cartao).toHaveTextContent(TEXTO_DO_CONSENTIMENTO);

      fireEvent.change(screen.getByLabelText("Nome da voz"), { target: { value: "Esmeralda 2" } });
      const arquivo = new File([new Uint8Array([1, 2, 3])], "amostra.mp3", { type: "audio/mpeg" });
      fireEvent.change(screen.getByLabelText("Gravações"), { target: { files: [arquivo] } });

      const botao = screen.getByRole("button", { name: "Clonar voz" });
      expect(botao, "sem a declaração de consentimento não clona").toBeDisabled();

      fireEvent.click(screen.getByRole("checkbox"));
      expect(botao).toBeEnabled();
    });

    it("envia multipart com consent=true e as gravações, e mostra a voz nova", async () => {
      const fetchDublado = vi.fn(async () =>
        new Response(JSON.stringify({ data: { provedor: "elevenlabs", id: "nova", nome: "Esmeralda 2", genero: "feminina", categoria: "clonada" } }), {
          status: 201,
        }),
      );
      vi.stubGlobal("fetch", fetchDublado);
      await abrirClonagem();

      fireEvent.change(screen.getByLabelText("Nome da voz"), { target: { value: "Esmeralda 2" } });
      const arquivo = new File([new Uint8Array([1, 2, 3])], "amostra.mp3", { type: "audio/mpeg" });
      fireEvent.change(screen.getByLabelText("Gravações"), { target: { files: [arquivo] } });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "Clonar voz" }));

      await waitFor(() => expect(fetchDublado).toHaveBeenCalledTimes(1));
      const [url, init] = fetchDublado.mock.calls[0] as unknown as [string, { method: string; body: FormData }];
      expect(url).toBe("/api/v1/ai/voices/clone");
      expect(init.method).toBe("POST");
      expect(init.body.get("consent")).toBe("true");
      expect(init.body.get("name")).toBe("Esmeralda 2");
      expect(init.body.get("gender")).toBe("feminina");
      expect(init.body.getAll("samples")).toHaveLength(1);
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it("erro do servidor (ex.: plano sem clonagem) aparece para a pessoa, com o motivo", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ error: { message: "O plano da sua conta no provedor não inclui clonagem de voz." } }), { status: 402 })),
      );
      await abrirClonagem();
      fireEvent.change(screen.getByLabelText("Nome da voz"), { target: { value: "Esmeralda 2" } });
      fireEvent.change(screen.getByLabelText("Gravações"), {
        target: { files: [new File([new Uint8Array([1])], "a.mp3", { type: "audio/mpeg" })] },
      });
      fireEvent.click(screen.getByRole("checkbox"));
      fireEvent.click(screen.getByRole("button", { name: "Clonar voz" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("O plano da sua conta no provedor não inclui clonagem de voz."));
    });
  });
});
