"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { appDaMeta, conferirParDoAppNaMeta, invalidarAppDaMeta } from "@/lib/channels/meta/app";
import { ativarTudoNoAppDaMeta, type ResultadoDoPasso } from "@/lib/channels/meta/ativar-app";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

/**
 * OUTROS APPS DA META, conectados AO LADO do principal.
 *
 * ── O caso ───────────────────────────────────────────────────────────────────
 *
 * Várias BMs, cada uma com o seu app e os seus números, atendidas pela mesma
 * instalação — por exemplo enquanto a Meta não aprova o app principal como
 * Provedor de Tecnologia. A Meta assina o aviso de cada número com a chave do
 * app dele; sem essa chave aqui, o aviso é recusado por assinatura e o número
 * fica mudo sem sintoma nenhuma tela.
 *
 * Até aqui um app só entrava nessa lista ao DEIXAR de ser o principal (0933).
 * Trocar o principal só para encaixar outro app derrubaria o "Conectar com
 * Facebook" de todo mundo. Esta action põe o app na mesma lista sem trocar nada.
 *
 * ── Por que a mesma tabela ───────────────────────────────────────────────────
 *
 * `platform_meta_apps_anteriores` já é lida em todos os lugares certos: conferir
 * a assinatura (`chavesQueAssinamAvisos`) e servir a chave do app do número
 * (`credencialDoAppDoNumero`). Uma tabela nova obrigaria a ensinar os dois
 * leitores, e o dia em que um deles esquecesse seria o número mudo de novo.
 *
 * Gate de plataforma, pelo mesmo motivo de `updateMetaApp.ts`: o objeto é a
 * instalação, não um tenant.
 */

const conectarSchema = z.object({
  app_id: z.string().trim().regex(/^\d{5,25}$/),
  app_secret: z.string().trim().min(16).max(300),
});

export type ConectarOutroAppResult =
  | { ok: true; nome: string | null; passos: ResultadoDoPasso[] | null }
  | { ok: false; error: "invalid_input" | "e_o_principal" | "app_recusado_pela_meta" | "cifra_indisponivel" | "nao_gravado"; motivo?: string };

export async function conectarOutroAppDaMeta(input: { app_id: string; app_secret: string }): Promise<ConectarOutroAppResult> {
  const { user } = await requirePlatformAdmin();
  const parsed = conectarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { app_id: appId, app_secret: appSecret } = parsed.data;

  const principal = await appDaMeta();
  // O principal tem a chave na linha dele; duplicar aqui faria a troca futura de app apagar a errada.
  if (principal.appId === appId) return { ok: false, error: "e_o_principal" };

  const par = await conferirParDoAppNaMeta(appId, appSecret);
  if (!par.ok) return { ok: false, error: "app_recusado_pela_meta", motivo: par.motivo };

  const admin = createAdminClient();
  const cifrado = await encryptWebhookSecret(admin, appSecret);
  if (!cifrado) return { ok: false, error: "cifra_indisponivel" };
  const { error } = await admin
    .from("platform_meta_apps_anteriores")
    .upsert({ app_id: appId, app_secret_encrypted: cifrado, aposentado_por: user.id, aposentado_em: new Date().toISOString() }, { onConflict: "app_id" });
  if (error) return { ok: false, error: "nao_gravado", motivo: error.code };
  invalidarAppDaMeta();

  // Aponta os avisos do app para esta instalação, com o MESMO verify token do
  // principal (o handshake confere um só). Sem endereço HTTPS ou sem token, o app
  // fica aceito mas a tela diz que falta ativar — nunca "pronto" sem estar.
  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const passos =
    base.startsWith("https://") && principal.verifyToken
      ? await ativarTudoNoAppDaMeta({ appId, appSecret, verifyToken: principal.verifyToken, base })
      : null;

  const cabecalhos = await headers();
  await audit({
    action: "platform_meta_app.outro_app_conectado",
    actorUserId: user.id,
    resourceType: "platform_meta_app",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    metadata: { app_id: appId, passos: passos?.map((p) => ({ chave: p.chave, ok: p.ok })) ?? null },
  });
  return { ok: true, nome: par.nome, passos };
}

export type DesconectarOutroAppResult =
  | { ok: true }
  | { ok: false; error: "invalid_input" | "app_com_numeros" | "nao_removido"; numeros?: number };

/** Recusa enquanto houver número ativo do app: tirar a chave dele deixaria esses números mudos. */
export async function desconectarOutroAppDaMeta(appIdBruto: string): Promise<DesconectarOutroAppResult> {
  const { user } = await requirePlatformAdmin();
  const appId = String(appIdBruto ?? "").trim();
  if (!/^\d{5,25}$/.test(appId)) return { ok: false, error: "invalid_input" };

  const admin = createAdminClient();
  const { count, error: erroDaContagem } = await admin
    .from("channel_sessions")
    .select("id", { count: "exact", head: true })
    .eq("meta_app_id", appId)
    .is("archived_at", null);
  if (erroDaContagem) return { ok: false, error: "nao_removido" };
  if ((count ?? 0) > 0) return { ok: false, error: "app_com_numeros", numeros: count ?? 0 };

  const { error } = await admin.from("platform_meta_apps_anteriores").delete().eq("app_id", appId);
  if (error) return { ok: false, error: "nao_removido" };
  invalidarAppDaMeta();

  const cabecalhos = await headers();
  await audit({
    action: "platform_meta_app.outro_app_desconectado",
    actorUserId: user.id,
    resourceType: "platform_meta_app",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    metadata: { app_id: appId },
  });
  return { ok: true };
}
