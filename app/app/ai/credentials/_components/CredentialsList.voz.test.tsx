/**
 * A chave de voz na tela de Credenciais.
 *
 * A rota de cadastro aceitava a chave da ElevenLabs desde que a voz existe, mas o seletor do diálogo
 * não a oferecia e a lista descartava em silêncio (`grouped[c.provider]?.push`) toda chave de provedor
 * fora de `PROVEDORES_COM_CHAVE`. Medido em produção em 07/10/2026: a organização tinha uma chave da
 * ElevenLabs e uma de outro provedor gravadas e em uso, e nenhuma das duas aparecia na tela.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CredentialsList } from "./CredentialsList";
import type { CredentialRow } from "@/hooks/ai/useCredentials";
import { PROVEDORES_SO_DE_VOZ } from "@/lib/voz/tipos";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../_actions", () => ({ refreshCredentialsView: vi.fn() }));

function linha(extra: Record<string, unknown>): CredentialRow {
  return {
    id: "c1",
    organization_id: "o1",
    provider: "anthropic",
    label: "Produção",
    api_key_last4: "abcd",
    validated_at: "2026-09-02T00:00:00Z",
    validation_error: null,
    models_available: null,
    is_active: true,
    created_by: null,
    created_at: "2026-09-02T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
    ...extra,
  } as CredentialRow;
}

function montar(linhas: CredentialRow[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <CredentialsList initialData={linhas} canWrite={false} usageMap={{}} />
    </QueryClientProvider>,
  );
}

describe("tela de Credenciais — chave de voz", () => {
  it("só a ElevenLabs é 'só de voz': a OpenAI já está na lista como provedor de conversa", () => {
    expect(PROVEDORES_SO_DE_VOZ.map((p) => p.id)).toEqual(["elevenlabs"]);
  });

  it("a chave da ElevenLabs aparece na lista, com o nome do provedor", () => {
    montar([
      linha({ id: "a", provider: "anthropic", label: "Conversa" }),
      linha({ id: "v", provider: "elevenlabs", label: "Voz da agente", api_key_last4: "d28e" }),
    ]);
    expect(screen.getByRole("heading", { name: "ElevenLabs" })).toBeInTheDocument();
    expect(screen.getByText("Voz da agente")).toBeInTheDocument();
  });

  it("chave de provedor que a lista não conhece NÃO some: aparece sob o próprio id", () => {
    montar([
      linha({ id: "a", provider: "anthropic", label: "Conversa" }),
      linha({ id: "x", provider: "provedor_desconhecido", label: "Chave antiga" }),
    ]);
    expect(screen.getByRole("heading", { name: "provedor_desconhecido" })).toBeInTheDocument();
    expect(screen.getByText("Chave antiga")).toBeInTheDocument();
  });

  it("o seletor do diálogo oferece a mesma união que a rota aceita", () => {
    const dialogo = readFileSync(join(__dirname, "AddCredentialDialog.tsx"), "utf8");
    expect(dialogo).toContain("const OPCOES_DE_PROVEDOR = [...PROVEDORES_COM_CHAVE, ...PROVEDORES_SO_DE_VOZ];");
    expect(dialogo).toContain("{OPCOES_DE_PROVEDOR.map((p) => (");
    expect(dialogo).toContain("provider: z.enum([...IDS_COM_CHAVE, ...IDS_DE_PROVEDOR_DE_VOZ]),");
    const rota = readFileSync(
      join(__dirname, "..", "..", "..", "..", "api", "v1", "ai", "credentials", "route.ts"),
      "utf8",
    );
    expect(rota).toContain("provider: z.enum([...IDS_COM_CHAVE, ...IDS_DE_PROVEDOR_DE_VOZ]),");
  });
});
