/**
 * CRIAR UMA VERSÃO DO AGENTE A PARTIR DE OUTRA — a cópia INTEIRA, com o que se quer mudar por cima.
 *
 * ⚠️ Até 10/10/2026 cada lugar que duplicava uma versão escrevia a própria lista de colunas, e
 * as listas envelheceram: aplicar uma proposta de melhoria copiava 15 colunas e publicava uma
 * versão SEM o follow-up, sem a divisão de mensagens, sem as fontes de conhecimento, sem os funis e
 * sem o modo operador — o agente "aprendia" uma frase e perdia metade da configuração no mesmo
 * clique. Coluna nova em `ai_agent_versions` não pode depender de alguém lembrar de três listas.
 *
 * Aqui a regra é invertida: copia-se TUDO, menos o que identifica a linha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** O que é da LINHA, não do conteúdo: nunca passa de uma versão para outra. */
export const COLUNAS_QUE_NAO_SE_COPIAM = [
  "id",
  "organization_id",
  "agent_id",
  "version_number",
  "status",
  "published_at",
  "superseded_at",
  "created_at",
  "created_by",
  "provisioning_origin",
] as const;

/** O conteúdo de uma versão, pronto para virar outra. Pura. */
export function conteudoDaVersao(linha: Record<string, unknown>): Record<string, unknown> {
  const fora = new Set<string>(COLUNAS_QUE_NAO_SE_COPIAM);
  return Object.fromEntries(Object.entries(linha).filter(([coluna]) => !fora.has(coluna)));
}

export type VersaoCriada =
  | { ok: true; id: string; versionNumber: number; base: Record<string, unknown> }
  | { ok: false; code: "version_not_found" | "internal_error"; message: string };

/**
 * Cria um RASCUNHO idêntico a `baseVersionId`, com `mudar` aplicado por cima. Não publica.
 * Repete em `23505`: duas criações ao mesmo tempo disputam o mesmo `version_number`.
 */
export async function criarVersaoAPartirDe(
  admin: SupabaseClient,
  p: {
    orgId: string;
    agentId: string;
    baseVersionId: string;
    userId: string;
    mudar?: (conteudo: Record<string, unknown>) => Record<string, unknown>;
  },
): Promise<VersaoCriada> {
  const { data: base } = await admin
    .from("ai_agent_versions")
    .select("*")
    .eq("id", p.baseVersionId)
    .eq("organization_id", p.orgId)
    .eq("agent_id", p.agentId)
    .maybeSingle();
  if (!base) return { ok: false, code: "version_not_found", message: "Versão de origem não encontrada." };

  const copia = conteudoDaVersao(base as Record<string, unknown>);
  const conteudo = p.mudar ? p.mudar(copia) : copia;

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const { data: maior } = await admin
      .from("ai_agent_versions")
      .select("version_number")
      .eq("agent_id", p.agentId)
      .eq("organization_id", p.orgId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const proximo = ((maior as { version_number: number } | null)?.version_number ?? 0) + 1;

    const { data: criada, error } = await admin
      .from("ai_agent_versions")
      .insert({
        ...conteudo,
        organization_id: p.orgId,
        agent_id: p.agentId,
        version_number: proximo,
        status: "draft",
        created_by: p.userId,
      })
      .select("id, version_number")
      .single();
    if (!error && criada) {
      const c = criada as { id: string; version_number: number };
      return { ok: true, id: c.id, versionNumber: c.version_number, base: base as Record<string, unknown> };
    }
    if (error?.code !== "23505") {
      return { ok: false, code: "internal_error", message: "Falha ao criar a versão nova." };
    }
  }
  return { ok: false, code: "internal_error", message: "Conflito de versionamento." };
}
