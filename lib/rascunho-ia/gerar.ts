/**
 * Gera o rascunho: resolve o MESMO modelo/credencial que o agente usaria de verdade
 * (mesma ordem de `montarQuadro.ts` › `cerebroDoFuncionario` — credencial cadastrada
 * vence, e na falta dela vale a chave da instalação) e chama `generateObject` com o
 * schema solto do campo pedido.
 *
 * Resolve pela ÚLTIMA versão do agente (rascunho ou publicada), não só a publicada: um
 * agente recém-criado, que ainda não publicou nada, já tem uma versão de rascunho com
 * provider/model — e é exatamente quem mais precisa de ajuda para preencher a Identidade
 * pela primeira vez.
 */
import { generateObject } from "ai";

import { CredentialUnavailableError, loadCredential } from "@/lib/ai/credentials";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";
import type { createAdminClient } from "@/lib/supabase/admin";
import { type CampoRascunhavel, definicaoDoCampo } from "./tipos";

type Admin = ReturnType<typeof createAdminClient>;

interface VersaoRow {
  provider: string | null;
  model: string | null;
  credential_id: string | null;
}

type Cerebro =
  | { ok: true; provider: string; model: string; apiKey: string }
  | { ok: false; codigo: string };

async function resolverModeloDoAgente(
  admin: Admin,
  args: { agentId: string; organizationId: string },
): Promise<Cerebro> {
  const { data } = await admin
    .from("ai_agent_versions")
    .select("provider, model, credential_id")
    .eq("agent_id", args.agentId)
    .eq("organization_id", args.organizationId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versao = data as VersaoRow | null;
  if (!versao || !versao.provider || !versao.model) {
    return { ok: false, codigo: "agente_sem_modelo" };
  }

  if (versao.credential_id) {
    try {
      const credential = await loadCredential(versao.credential_id, args.organizationId);
      return { ok: true, provider: versao.provider, model: versao.model, apiKey: credential.apiKey };
    } catch (err) {
      const motivo = err instanceof CredentialUnavailableError ? err.reason : "decrypt_failed";
      return { ok: false, codigo: `credencial_${motivo}` };
    }
  }

  const daInstalacao = chaveDePlataforma(versao.provider);
  if (!daInstalacao) return { ok: false, codigo: `sem_chave_${versao.provider}` };
  return { ok: true, provider: versao.provider, model: versao.model, apiKey: daInstalacao };
}

/** Mensagem legível para quem está tentando gerar um rascunho, não para log. */
export function mensagemDoErroDeRascunho(codigo: string): string {
  if (codigo === "agente_sem_modelo") {
    return "Este agente ainda não tem um modelo configurado. Publique uma versão antes de gerar um rascunho.";
  }
  if (codigo.startsWith("sem_chave_")) {
    return `Esta instalação não tem uma chave de ${codigo.slice("sem_chave_".length)} configurada.`;
  }
  if (codigo.startsWith("credencial_")) {
    return "Não consegui usar a credencial de IA cadastrada deste agente.";
  }
  return "Não consegui gerar o rascunho agora. Tente de novo em instantes.";
}

export type ResultadoDeRascunho =
  | { ok: true; dados: Record<string, unknown> }
  | { ok: false; codigo: string };

export async function gerarRascunho(args: {
  admin: Admin;
  agentId: string;
  organizationId: string;
  campo: CampoRascunhavel;
  contexto: string;
}): Promise<ResultadoDeRascunho> {
  const cerebro = await resolverModeloDoAgente(args.admin, args);
  if (!cerebro.ok) return { ok: false, codigo: cerebro.codigo };

  const def = definicaoDoCampo(args.campo);
  try {
    const model = buildModel(cerebro.provider, cerebro.apiKey, cerebro.model);
    const gerado = await generateObject({
      model,
      schema: def.schema,
      system: def.system,
      prompt: args.contexto,
      temperature: 0.6,
      // Teto folgado de propósito: são poucos campos curtos, mas em modo FERRAMENTA
      // (que é como generateObject fala com Anthropic) o JSON custa mais do que texto
      // solto do mesmo tamanho — ver a lição registrada em workers/ai-sentiment-worker.ts.
      maxOutputTokens: 900,
    });
    return { ok: true, dados: gerado.object as Record<string, unknown> };
  } catch {
    // Timeout, resposta fora do schema, provedor fora do ar: tudo cai no mesmo código.
    // Quem chama já cai de volta para o formulário vazio — não há efeito parcial a desfazer.
    return { ok: false, codigo: "geracao_falhou" };
  }
}
