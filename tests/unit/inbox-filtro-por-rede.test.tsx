/**
 * O filtro de canal do inbox em DOIS níveis: primeiro a rede, depois o canal.
 *
 * O caso que o motivou, medido numa instalação real: 2 números de WhatsApp e 28
 * páginas do Messenger no mesmo menu corrido. Com a rede escolhida antes, o menu
 * mostra só os canais dela, e "tudo do Messenger" não exige escolher página.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { InboxFilters, type InboxFiltersValue } from "@/components/inbox/InboxFilters";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";
import {
  CHANNEL_PROVIDER_MESSENGER,
  CHANNEL_PROVIDER_META,
  CHANNEL_PROVIDER_TELEGRAM,
  CHANNEL_PROVIDER_WAHA,
} from "@/lib/channels/capabilities";
import { redeDoCanal, REDES_DO_INBOX } from "@/lib/channels/presentation";
import { CANAIS_DE_CONVERSA } from "@/lib/channels/canais-de-conversa";

const canaisRef: { current: ChannelSession[] | undefined } = { current: [] };
const contagemRef: { current: unknown } = { current: null };

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { orgId: "org-1", name: "Org", role: "admin", visibility_mode: "all" } }),
}));
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => ({ data: canaisRef.current }) };
});
vi.mock("@/hooks/inbox/useConversationTags", () => ({ useConversationTagVocabulary: () => ({ data: [] }) }));
vi.mock("@/hooks/contacts/useContactTagVocabulary", () => ({ useContactTagVocabulary: () => ({ data: [] }) }));
vi.mock("@/hooks/inbox/useConversationCounts", () => ({
  useConversationCounts: (_org: unknown, filtros: unknown) => {
    contagemRef.current = filtros;
    return { data: { unassigned: 1, mine: 1, all: 1 } };
  },
}));

const VALUE: InboxFiltersValue = { tab: "all", search: "", onlyUnread: false };

function canal(id: string, provider: string, display_name: string): ChannelSession {
  return {
    id,
    provider,
    waha_session_name: null,
    display_name,
    phone_number: null,
    status: "WORKING",
    status_reason: null,
    last_health_check_at: null,
    last_status_change_at: null,
    daily_message_limit: 250,
    is_warmup_complete: null,
    created_at: "2026-10-01T00:00:00Z",
  };
}

const NUMERO_QR = canal("w1", CHANNEL_PROVIDER_WAHA, "Vendas");
const NUMERO_OFICIAL = canal("w2", CHANNEL_PROVIDER_META, "Suporte");
const PAGINA_A = canal("m1", CHANNEL_PROVIDER_MESSENGER, "Messenger · Loja");
const PAGINA_B = canal("m2", CHANNEL_PROVIDER_MESSENGER, "Messenger · Clínica");
const BOT = canal("t1", CHANNEL_PROVIDER_TELEGRAM, "Telegram · @loja_bot");

beforeEach(() => {
  canaisRef.current = [];
  contagemRef.current = null;
});
afterEach(cleanup);

describe("redes do inbox", () => {
  it("toda rede oferecida filtra por um valor que o banco conhece", () => {
    for (const r of REDES_DO_INBOX) expect(CANAIS_DE_CONVERSA as readonly string[]).toContain(r.canal);
  });

  it("a rede sai do canal: dois WhatsApp de transportes diferentes são a MESMA rede", () => {
    expect(redeDoCanal(NUMERO_QR)?.canal).toBe("whatsapp");
    expect(redeDoCanal(NUMERO_OFICIAL)?.canal).toBe("whatsapp");
    expect(redeDoCanal(PAGINA_A)?.canal).toBe("facebook");
    expect(redeDoCanal(BOT)?.canal).toBe("telegram");
    expect(redeDoCanal({ provider: "desconhecido" })).toBeNull();
  });
});

describe("InboxFilters — rede antes do canal", () => {
  it("só WhatsApp conectado: não há linha de redes (não há o que escolher)", () => {
    canaisRef.current = [NUMERO_QR, NUMERO_OFICIAL];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    expect(screen.queryByRole("group", { name: "Filtrar por rede" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar por canal")).toBeInTheDocument();
  });

  it("oferece só as redes que TÊM canal conectado", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A, PAGINA_B];
    render(<InboxFilters value={VALUE} onChange={() => {}} />);
    const grupo = screen.getByRole("group", { name: "Filtrar por rede" });
    expect(grupo).toHaveTextContent("Todas as redes");
    expect(grupo).toHaveTextContent("WhatsApp");
    expect(grupo).toHaveTextContent("Messenger");
    expect(grupo).not.toHaveTextContent("Telegram");
    expect(grupo).not.toHaveTextContent("Instagram");
  });

  it("escolher a rede filtra por ela — sem exigir escolher página", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A, PAGINA_B];
    const onChange = vi.fn();
    render(<InboxFilters value={VALUE} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rede-facebook"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channel: "facebook", channel_session_id: undefined }));
  });

  it("⭐ trocar de rede solta o canal que era da rede anterior (senão a lista ficaria sempre vazia)", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A, BOT];
    const onChange = vi.fn();
    render(<InboxFilters value={{ ...VALUE, channel: "whatsapp", channel_session_id: "w1" }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rede-facebook"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channel: "facebook", channel_session_id: undefined }));
  });

  it("escolher a rede do canal já filtrado MANTÉM o canal", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A, PAGINA_B];
    const onChange = vi.fn();
    render(<InboxFilters value={{ ...VALUE, channel_session_id: "m2" }} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("rede-facebook"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channel: "facebook", channel_session_id: "m2" }));
  });

  it("com a rede escolhida, o seletor de canal só existe se ela tiver 2+ canais", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A, PAGINA_B, BOT];
    const { rerender } = render(<InboxFilters value={{ ...VALUE, channel: "facebook" }} onChange={() => {}} />);
    expect(screen.getByLabelText("Filtrar por canal")).toBeInTheDocument();
    rerender(<InboxFilters value={{ ...VALUE, channel: "telegram" }} onChange={() => {}} />);
    expect(screen.queryByLabelText("Filtrar por canal")).not.toBeInTheDocument();
  });

  it("o contador das abas recebe a MESMA rede que a lista (badge não conta o que a aba não mostra)", () => {
    canaisRef.current = [NUMERO_QR, PAGINA_A];
    render(<InboxFilters value={{ ...VALUE, channel: "facebook" }} onChange={() => {}} />);
    expect(contagemRef.current).toMatchObject({ channel: "facebook" });
  });

  it("rede aplicada cujo último canal foi excluído: a linha FICA, para o filtro poder ser desfeito", () => {
    canaisRef.current = [NUMERO_QR];
    const onChange = vi.fn();
    render(<InboxFilters value={{ ...VALUE, channel: "telegram" }} onChange={onChange} />);
    const grupo = screen.getByRole("group", { name: "Filtrar por rede" });
    expect(grupo).toHaveTextContent("Rede sem canal conectado");
    fireEvent.click(screen.getByText(/Rede sem canal conectado/));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ channel: undefined }));
  });
});
