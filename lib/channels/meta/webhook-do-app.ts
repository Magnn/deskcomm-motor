/**
 * O WEBHOOK DO APP na Meta, registrado pelo servidor — o passo que hoje pede
 * colar uma URL e um token no painel dela.
 *
 * O app tem UMA assinatura para as contas do WhatsApp Business, com uma URL só.
 * É para ela que vai tudo o que a Meta não deixa apontar por número: o estado
 * dos modelos e, no número em coexistência, o que o negócio manda pelo celular.
 * Quem atende essa URL é `app/api/v1/webhooks/meta/route.ts`.
 *
 * Feito daqui, ninguém precisa ver o token de verificação: o servidor o tem
 * guardado, manda para a Meta, e a Meta o devolve no handshake desta mesma
 * instalação DURANTE o pedido — por isso a rota precisa estar no ar.
 *
 * ⚠️ O pedido SUBSTITUI a assinatura inteira daquele objeto, inclusive a lista de
 * campos: campo que não for mandado aqui deixa de ser entregue. A lista é a que
 * o produto lê, e mora neste arquivo.
 *
 * Segredo no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12).
 */
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 20_000;

/** Os avisos da conta do WhatsApp que o produto trata. */
export const CAMPOS_DO_WEBHOOK_DO_APP = ["messages", "message_template_status_update", "smb_message_echoes"] as const;

export type RegistroDoWebhookDoApp = { ok: true; url: string } | { ok: false; motivo: string };

export async function registrarWebhookDoApp(
  p: { appId: string; appSecret: string; verifyToken: string; callbackUrl: string },
  buscar: typeof fetch = fetch,
): Promise<RegistroDoWebhookDoApp> {
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${encodeURIComponent(p.appId)}/subscriptions`, {
      method: "POST",
      body: new URLSearchParams({
        object: "whatsapp_business_account",
        callback_url: p.callbackUrl,
        verify_token: p.verifyToken,
        fields: CAMPOS_DO_WEBHOOK_DO_APP.join(","),
        access_token: `${p.appId}|${p.appSecret}`,
      }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    return { ok: false, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
  const corpo = (await res.json().catch(() => null)) as
    | { success?: boolean; error?: { message?: string; error_user_msg?: string } }
    | null;
  if (!res.ok || corpo?.error || corpo?.success !== true) {
    return {
      ok: false,
      motivo: corpo?.error?.error_user_msg ?? corpo?.error?.message ?? `http_${res.status}`,
    };
  }
  return { ok: true, url: p.callbackUrl };
}
