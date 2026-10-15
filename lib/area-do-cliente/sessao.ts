/**
 * QUEM ESTÁ DENTRO da área do cliente.
 *
 * Não é o login da equipe: o cliente final não tem usuário no Auth, e não pode
 * ter — um usuário do Auth atravessaria o `proxy.ts` como se fosse da equipe.
 * A identidade aqui é um cookie HttpOnly com um token aleatório, cujo hash mora
 * em `area_sessoes`, amarrado a UM contato de UMA organização.
 *
 * `SameSite=Lax`, e não `Strict` como o da equipe: a pessoa chega pelo link que
 * recebeu no WhatsApp ou no e-mail, e essa navegação vem de outro site — com
 * `Strict` o cookie não viajaria e ela cairia na tela de entrar toda vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { cookieSecure } from "@/lib/supabase/cookie-secure";

import { lerConfigDaArea, type ConfigDaArea } from "./config";
import { FORMA_DO_TOKEN, gerarToken, hashDoToken } from "./token";
import {
  FORMA_DO_SLUG_DA_AREA,
  VALIDADE_DA_SESSAO_DIAS,
  nomeDoCookieDaArea,
  type OrigemDeSessaoDaArea,
} from "./vocabulario";

export interface OrgDaArea {
  id: string;
  slug: string;
  nome: string;
  /** Quem vende, para o rodapé de confiança e o recibo. */
  razaoSocial: string | null;
  cnpj: string | null;
  fuso: string;
  config: ConfigDaArea;
}

export interface SessaoDaArea {
  sessaoId: string;
  contactId: string;
}

/** A organização da URL, só se a área dela estiver LIGADA. */
export async function orgDaArea(admin: SupabaseClient, slug: string): Promise<OrgDaArea | null> {
  if (!FORMA_DO_SLUG_DA_AREA.test(slug)) return null;
  const { data } = await admin
    .from("organizations")
    .select("id, slug, display_name, legal_name, cnpj, timezone, settings, suspended_at, redacted_at")
    .eq("slug", slug)
    .maybeSingle();
  const org = data as {
    id: string;
    slug: string;
    display_name: string | null;
    legal_name: string | null;
    cnpj: string | null;
    timezone: string | null;
    settings: unknown;
    suspended_at: string | null;
    redacted_at: string | null;
  } | null;
  if (!org || org.suspended_at || org.redacted_at) return null;
  const config = lerConfigDaArea(org.settings);
  if (!config.ativo) return null;
  return {
    id: org.id,
    slug: org.slug,
    nome: org.display_name || org.legal_name || org.slug,
    razaoSocial: org.legal_name || null,
    cnpj: org.cnpj || null,
    fuso: org.timezone || "America/Sao_Paulo",
    config,
  };
}

/** A sessão do cookie, se ainda valer. Atualiza o "visto por último" no máximo a cada 10 minutos. */
export async function sessaoDoCookie(
  admin: SupabaseClient,
  org: OrgDaArea,
  token: string | undefined,
): Promise<SessaoDaArea | null> {
  if (!token || !FORMA_DO_TOKEN.test(token)) return null;
  const { data } = await admin
    .from("area_sessoes")
    .select("id, contact_id, expires_at, revoked_at, last_seen_at")
    .eq("token_hash", hashDoToken(token))
    .eq("organization_id", org.id)
    .maybeSingle();
  const s = data as {
    id: string;
    contact_id: string;
    expires_at: string;
    revoked_at: string | null;
    last_seen_at: string;
  } | null;
  if (!s || s.revoked_at || new Date(s.expires_at).getTime() <= Date.now()) return null;
  if (Date.now() - new Date(s.last_seen_at).getTime() > 10 * 60_000) {
    await admin.from("area_sessoes").update({ last_seen_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { sessaoId: s.id, contactId: s.contact_id };
}

export interface SessaoCriada extends SessaoDaArea {
  token: string;
  expira: Date;
}

export async function criarSessao(
  admin: SupabaseClient,
  org: OrgDaArea,
  contactId: string,
  origem: OrigemDeSessaoDaArea,
): Promise<SessaoCriada> {
  const token = gerarToken();
  const expira = new Date(Date.now() + VALIDADE_DA_SESSAO_DIAS * 86_400_000);
  const { data, error } = await admin
    .from("area_sessoes")
    .insert({
      organization_id: org.id,
      contact_id: contactId,
      token_hash: hashDoToken(token),
      origem,
      expires_at: expira.toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "sessão não criada");
  return { sessaoId: (data as { id: string }).id, contactId, token, expira };
}

export function opcoesDoCookie(expira: Date) {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    expires: expira,
  };
}

export { nomeDoCookieDaArea };
