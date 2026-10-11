/**
 * OS PRODUTOS QUE TÊM FLUXO DE ENTREGA — a outra metade de "produto completo".
 *
 * Um produto de entrega por `material` sai por um fluxo de entrega que o declara no gatilho
 * (`trigger_config.product_name`, o mesmo campo que `lib/pagamentos/compra-cakto.ts` lê para decidir
 * para onde a compra vai). Sem esse fluxo a pessoa pagaria e receberia a entrega de OUTRO produto — o
 * fluxo geral —, e por isso o catálogo não o oferece.
 *
 * A consulta é a mesma nos dois lados (o turno, por `pg`, e a tela, pelo cliente de serviço): fluxos
 * ATIVOS da organização cujo nome começa por "Entrega".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type pg from "pg";

function nomesDeclarados(linhas: ReadonlyArray<{ trigger_config: unknown }>): string[] {
  const nomes: string[] = [];
  for (const l of linhas) {
    const bruto = (l.trigger_config as { product_name?: unknown } | null)?.product_name;
    if (typeof bruto === "string" && bruto.trim() !== "") nomes.push(bruto.trim());
  }
  return nomes;
}

/** Para o turno do agente. Lança se o banco falhar — quem chama decide não oferecer. */
export async function produtosComFluxoDeEntrega(db: Pick<pg.Pool, "query">, organizationId: string): Promise<string[]> {
  const { rows } = await db.query<{ trigger_config: unknown }>(
    `select trigger_config
       from followup_flow_pointers
      where organization_id = $1 and status = 'active' and name ilike 'Entrega%'
      limit 50`,
    [organizationId],
  );
  return nomesDeclarados(rows);
}

/** Para a rota da aba Catálogo. Falha de leitura = nenhum fluxo conhecido (a tela mostra o que falta). */
export async function produtosComFluxoDeEntregaPelaApi(admin: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data } = await admin
    .from("followup_flow_pointers")
    .select("trigger_config")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .ilike("name", "Entrega%")
    .limit(50);
  return nomesDeclarados((data ?? []) as Array<{ trigger_config: unknown }>);
}
