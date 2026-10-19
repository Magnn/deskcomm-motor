/**
 * OS AVISOS DA ÁREA no servidor: guardar e apagar a inscrição de um aparelho, e a rodada do aviso diário
 * (chamada pelo cron `area-avisos`, de hora em hora — só age na empresa cujo relógio marca a hora do aviso).
 *
 * Mesmas chaves VAPID e mesma biblioteca do aviso da equipe (`lib/notifications/web_push.ts`); a tabela é
 * outra (`area_avisos`), porque quem recebe é o cliente da empresa, não quem trabalha nela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

import { partesNoFuso } from "@/lib/agenda/fuso";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { vapidPronto, vapidPublica, vapidSubject } from "@/lib/notifications/vapid";

import { avisoDoDia, configDosAvisos, deveAvisarAgora } from "./avisos";
import { lerConfigDaArea } from "./config";

const FUSO_PADRAO = "America/Sao_Paulo";
const TETO_POR_ORGANIZACAO = 5000;

export interface InscricaoDoAparelho {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function guardarInscricao(admin: SupabaseClient, orgId: string, contactId: string, i: InscricaoDoAparelho): Promise<void> {
  const { error } = await admin.from("area_avisos").upsert(
    { organization_id: orgId, contact_id: contactId, endpoint: i.endpoint, p256dh: i.keys.p256dh, auth: i.keys.auth },
    { onConflict: "organization_id,endpoint" },
  );
  if (error) throw new Error(error.message);
}

export async function apagarInscricao(admin: SupabaseClient, orgId: string, contactId: string, endpoint: string): Promise<void> {
  const { error } = await admin
    .from("area_avisos")
    .delete()
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("endpoint", endpoint);
  if (error) throw new Error(error.message);
}

export interface RodadaDosAvisos {
  organizacoes: number;
  enviados: number;
  removidos: number;
  falhas: number;
}

type Envio = (inscricao: { endpoint: string; keys: { p256dh: string; auth: string } }, corpo: string) => Promise<unknown>;

/** A rodada: para cada empresa com avisos ligados e na hora marcada, um aviso por aparelho que ainda não recebeu hoje. */
export async function enviarAvisosDoDia(admin: SupabaseClient, agora: Date, enviar?: Envio): Promise<RodadaDosAvisos> {
  const r: RodadaDosAvisos = { organizacoes: 0, enviados: 0, removidos: 0, falhas: 0 };
  if (!vapidPronto()) return r;
  const mandar: Envio =
    enviar ??
    (await (async () => {
      webpush.setVapidDetails(await vapidSubject(), vapidPublica()!, env.VAPID_PRIVATE_KEY.trim());
      return (inscricao, corpo) => webpush.sendNotification(inscricao, corpo, { TTL: 6 * 3600 });
    })());

  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id, slug, display_name, timezone, settings")
    .filter("settings->area->avisos->>ativo", "eq", "true")
    .is("suspended_at", null);
  if (error) throw new Error(error.message);

  for (const org of (orgs ?? []) as Array<{ id: string; slug: string; display_name: string | null; timezone: string | null; settings: unknown }>) {
    const area = lerConfigDaArea(org.settings);
    const cfg = configDosAvisos(area.avisos);
    if (!area.ativo || !cfg.ativo) continue;
    let parede: ReturnType<typeof partesNoFuso>;
    try {
      parede = partesNoFuso(agora, org.timezone ?? FUSO_PADRAO);
    } catch {
      continue; // fuso inválido numa empresa não derruba a rodada das outras
    }
    const hoje = `${parede.ano}-${String(parede.mes).padStart(2, "0")}-${String(parede.dia).padStart(2, "0")}`;
    if (parede.hora !== cfg.hora) continue;
    r.organizacoes += 1;

    const { data: aparelhos } = await admin
      .from("area_avisos")
      .select("id, endpoint, p256dh, auth, ultimo_aviso_dia")
      .eq("organization_id", org.id)
      .limit(TETO_POR_ORGANIZACAO);
    const aviso = avisoDoDia({ titulo: area.titulo || org.display_name || "", slug: org.slug, temCartaDoDia: Boolean(area.carta_do_dia) });
    const corpo = JSON.stringify({ ...aviso, icon: `/c/${org.slug}/icone` });

    for (const a of (aparelhos ?? []) as Array<{ id: string; endpoint: string; p256dh: string; auth: string; ultimo_aviso_dia: string | null }>) {
      if (!deveAvisarAgora({ horaLocal: parede.hora, horaDoAviso: cfg.hora, hojeLocal: hoje, ultimoAvisoDia: a.ultimo_aviso_dia })) continue;
      // Marca ANTES de mandar: rodada repetida na mesma hora não manda duas vezes.
      const { data: marcado } = await admin
        .from("area_avisos")
        .update({ ultimo_aviso_dia: hoje })
        .eq("id", a.id)
        .or(`ultimo_aviso_dia.is.null,ultimo_aviso_dia.neq.${hoje}`)
        .select("id");
      if (!marcado || marcado.length === 0) continue;
      try {
        await mandar({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, corpo);
        r.enviados += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // O aparelho cancelou a inscrição (ou desinstalou): não há a quem avisar.
          await admin.from("area_avisos").delete().eq("id", a.id);
          r.removidos += 1;
        } else {
          r.falhas += 1;
          logger.warn("[area.avisos] envio falhou", { organization_id: org.id, status: status ?? 0 });
        }
      }
    }
  }
  return r;
}
