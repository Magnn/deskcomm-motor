/**
 * O que as telas de lançamento leem — o lançamento com os grupos, os disparos e
 * os números, num retrato só. Cliente de serviço, sempre filtrando a organização
 * (as tabelas são deny-all).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

import type { StatusDoDisparo } from "./regras";
import {
  grupoEhReserva,
  lerLancamento,
  listarGrupos,
  listarLancamentos,
  type GrupoDoLancamento,
  type Lancamento,
} from "./servico";

type Admin = SupabaseClient;

/** O endereço que vai no anúncio. */
export function linkPublicoDoLancamento(slug: string): string {
  return `${(env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/g/${slug}`;
}

export interface ResumoDoLancamento {
  id: string;
  name: string;
  status: Lancamento["status"];
  link: string;
  grupos: number;
  participantes: number;
  cliques: number;
  created_at: string;
}

async function contarCliques(admin: Admin, organizationId: string, launchId: string): Promise<number> {
  const { count, error } = await admin
    .from("group_launch_clicks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("launch_id", launchId);
  if (error) throw new Error(`lançamentos: contagem de cliques falhou: ${error.message}`);
  return count ?? 0;
}

const gruposDeVerdade = (grupos: GrupoDoLancamento[]) => grupos.filter((g) => !grupoEhReserva(g));

export async function resumirLancamentos(admin: Admin, organizationId: string): Promise<ResumoDoLancamento[]> {
  const lancamentos = await listarLancamentos(admin, organizationId);
  return Promise.all(
    lancamentos.map(async (l) => {
      const grupos = gruposDeVerdade(await listarGrupos(admin, organizationId, l.id));
      return {
        id: l.id,
        name: l.name,
        status: l.status,
        link: linkPublicoDoLancamento(l.slug),
        grupos: grupos.length,
        participantes: grupos.reduce((soma, g) => soma + g.members_count, 0),
        cliques: await contarCliques(admin, organizationId, l.id),
        created_at: l.created_at,
      };
    }),
  );
}

export interface DisparoDoLancamento {
  id: string;
  items: unknown;
  scheduled_at: string;
  status: StatusDoDisparo;
  started_at: string | null;
  finished_at: string | null;
  enviados: number;
  falhas: number;
  pendentes: number;
}

export interface DetalheDoLancamento {
  lancamento: Lancamento;
  link: string;
  grupos: GrupoDoLancamento[];
  participantes: number;
  cliques: number;
  disparos: DisparoDoLancamento[];
}

export async function detalharLancamento(admin: Admin, organizationId: string, id: string): Promise<DetalheDoLancamento | null> {
  const lancamento = await lerLancamento(admin, organizationId, id);
  if (!lancamento) return null;
  const grupos = gruposDeVerdade(await listarGrupos(admin, organizationId, id));

  const { data: disparosRaw, error } = await admin
    .from("group_launch_broadcasts")
    .select("id, items, scheduled_at, status, started_at, finished_at")
    .eq("organization_id", organizationId)
    .eq("launch_id", id)
    .order("scheduled_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`lançamentos: leitura dos disparos falhou: ${error.message}`);
  const disparos = (disparosRaw ?? []) as Array<Omit<DisparoDoLancamento, "enviados" | "falhas" | "pendentes">>;

  const porDisparo = new Map<string, { enviados: number; falhas: number; pendentes: number }>();
  if (disparos.length > 0) {
    const { data: entregas, error: erroDasEntregas } = await admin
      .from("group_launch_deliveries")
      .select("broadcast_id, status")
      .eq("organization_id", organizationId)
      .in(
        "broadcast_id",
        disparos.map((d) => d.id),
      );
    if (erroDasEntregas) throw new Error(`lançamentos: leitura das entregas falhou: ${erroDasEntregas.message}`);
    for (const e of (entregas ?? []) as Array<{ broadcast_id: string; status: string }>) {
      const c = porDisparo.get(e.broadcast_id) ?? { enviados: 0, falhas: 0, pendentes: 0 };
      if (e.status === "sent") c.enviados++;
      else if (e.status === "failed") c.falhas++;
      else c.pendentes++;
      porDisparo.set(e.broadcast_id, c);
    }
  }

  return {
    lancamento,
    link: linkPublicoDoLancamento(lancamento.slug),
    grupos,
    participantes: grupos.reduce((soma, g) => soma + g.members_count, 0),
    cliques: await contarCliques(admin, organizationId, id),
    disparos: disparos.map((d) => ({ ...d, ...(porDisparo.get(d.id) ?? { enviados: 0, falhas: 0, pendentes: 0 }) })),
  };
}
