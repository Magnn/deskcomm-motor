/**
 * O segundo provedor parceiro — cliente HTTP mínimo.
 *
 * Duas APIs com a MESMA chave (`X-API-Key`, nunca em query string):
 *
 *  - **Platform** (`/platform/v1`): clientes, links de cadastro, números e
 *    webhooks — é a parte "SaaS": cada organização vira um cliente no projeto
 *    da instalação e conecta o número por um link de cadastro hospedado.
 *  - **Meta proxy** (`/meta/whatsapp/<versão da Graph>`): o dialeto da Cloud API (envio,
 *    mídia). Por isso o corpo do envio sai das MESMAS funções do canal oficial.
 *
 * A chave é da INSTALAÇÃO (painel de configuração), lida a cada chamada: trocar
 * na tela vale na hora para todas as conexões.
 */
import { graphVersion } from "@/lib/graph-version";
import { valorDaInstalacao } from "@/lib/instalacao/config";

export const KAPSO_LABEL = "Kapso";

export function kapsoRootUrl(): string {
  return (process.env.KAPSO_API_BASE_URL?.trim() || "https://api.kapso.ai").replace(/\/+$/, "");
}

export function kapsoMetaBase(): string {
  // A versão é a da instalação (`lib/graph-version.ts`): o proxy repassa à Meta.
  return `${kapsoRootUrl()}/meta/whatsapp/${graphVersion()}`;
}

function platformBase(): string {
  return `${kapsoRootUrl()}/platform/v1`;
}

/** `null` = a instalação não configurou a chave (canal desligado). */
export async function chaveDoKapso(): Promise<string | null> {
  const { valor } = await valorDaInstalacao("KAPSO_API_KEY");
  return valor?.trim() || null;
}

export class ErroDoKapso extends Error {
  constructor(
    readonly status: number,
    detalhe: string,
  ) {
    super(`kapso_${status}: ${detalhe}`.slice(0, 400));
  }
}

async function chamar<T>(
  chave: string,
  metodo: "GET" | "POST",
  url: string,
  corpo?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: {
      "X-API-Key": chave,
      Accept: "application/json",
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string | { message?: string; code?: number };
  };
  if (!res.ok) {
    const e = json.error;
    const detalhe = typeof e === "string" ? e : (e?.message ?? res.statusText);
    throw new ErroDoKapso(res.status, detalhe || `http_${res.status}`);
  }
  return json;
}

/** O cliente desta organização no projeto — achado pelo id externo, ou criado. */
export async function garantirCliente(
  chave: string,
  org: { id: string; nome: string },
): Promise<string> {
  const lista = await chamar<{ data?: { id: string; external_customer_id: string | null }[] }>(
    chave,
    "GET",
    `${platformBase()}/customers?external_customer_id=${encodeURIComponent(org.id)}&per_page=5`,
  );
  const achado = lista.data?.find((c) => c.external_customer_id === org.id);
  if (achado) return achado.id;
  const criado = await chamar<{ data: { id: string } }>(chave, "POST", `${platformBase()}/customers`, {
    customer: { name: org.nome.slice(0, 120) || org.id, external_customer_id: org.id },
  });
  return criado.data.id;
}

/** O link de cadastro hospedado (Facebook + número). Expira; criar um a cada pedido. */
export async function criarLinkDeCadastro(
  chave: string,
  input: {
    customerId: string;
    sucesso: string;
    falha: string;
    coexistencia: boolean;
    idioma: "pt" | "es" | "en";
    cor: string | null;
  },
): Promise<string> {
  const r = await chamar<{ data: { url: string } }>(
    chave,
    "POST",
    `${platformBase()}/customers/${encodeURIComponent(input.customerId)}/setup_links`,
    {
      setup_link: {
        success_redirect_url: input.sucesso,
        failure_redirect_url: input.falha,
        allowed_connection_types: [input.coexistencia ? "coexistence" : "dedicated"],
        language: input.idioma,
        ...(input.cor && /^#[0-9a-fA-F]{6}$/.test(input.cor)
          ? { theme_config: { primary_color: input.cor } }
          : {}),
      },
    },
  );
  return r.data.url;
}

export interface NumeroDoKapso {
  phoneNumberId: string;
  wabaId: string | null;
  customerId: string | null;
  telefone: string | null;
  nome: string | null;
}

export async function numeroDoKapso(chave: string, phoneNumberId: string): Promise<NumeroDoKapso> {
  const r = await chamar<{
    data: {
      phone_number_id: string;
      business_account_id: string | null;
      customer_id: string | null;
      display_phone_number: string | null;
      verified_name: string | null;
    };
  }>(chave, "GET", `${platformBase()}/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}`);
  const d = r.data;
  return {
    phoneNumberId: d.phone_number_id,
    wabaId: d.business_account_id,
    customerId: d.customer_id,
    telefone: d.display_phone_number,
    nome: d.verified_name,
  };
}

/** Webhook do número no formato da Meta, assinado com o segredo gerado aqui. */
export async function registrarWebhookDoNumero(
  chave: string,
  input: { phoneNumberId: string; url: string; segredo: string },
): Promise<string> {
  const r = await chamar<{ data: { id: string } }>(
    chave,
    "POST",
    `${platformBase()}/whatsapp/phone_numbers/${encodeURIComponent(input.phoneNumberId)}/webhooks`,
    { whatsapp_webhook: { kind: "meta", url: input.url, secret_key: input.segredo, active: true } },
  );
  return r.data.id;
}

/** URL de download da mídia recebida, já autenticada pelo token embutido (vale ~4 min). */
export async function urlDaMidia(
  chave: string,
  input: { mediaId: string; phoneNumberId: string },
): Promise<{ url: string; mime: string | null }> {
  const r = await chamar<{ download_url?: string; mime_type?: string }>(
    chave,
    "GET",
    `${kapsoMetaBase()}/${encodeURIComponent(input.mediaId)}?phone_number_id=${encodeURIComponent(input.phoneNumberId)}`,
  );
  if (!r.download_url) throw new ErroDoKapso(502, "midia_sem_download_url");
  return { url: r.download_url, mime: r.mime_type ?? null };
}
