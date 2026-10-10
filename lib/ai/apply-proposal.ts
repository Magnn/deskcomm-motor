/**
 * Épico Operação Visível (F3) — aplicar uma proposta do flywheel como versão
 * nova do agente, pelo fluxo publish-por-ponteiro EXISTENTE (regras duras
 * 10/11): nada muda a versão publicada; cria-se uma versão nova (cópia da
 * publicada + bullet proposto no fim do system_prompt) e o ponteiro flipa via
 * fn_publish_ai_agent_version. O gate humano é o clique de aplicar — nada
 * auto-aplica; o rastro fica em applied_at/applied_version_id/applied_by (0053).
 *
 * DESFAZER é a outra metade (0921): toda aplicação guarda a versão que estava no ar
 * (`previous_version_id`), e `revertProposal` volta a ela. Aprendizado que não tem volta não é
 * experimento, é aposta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarVersaoAPartirDe } from "@/lib/ai/agents/clonar-versao";
import { publishAgentVersion } from "@/lib/ai/agents/publish";

const CABECALHO_DO_APRENDIZADO = "## Aprendizado do flywheel";

/** O trecho que a aplicação acrescenta — e que o desfazer procura. Pura. */
export function trechoAplicado(bulletContent: string): string {
  return `\n\n${CABECALHO_DO_APRENDIZADO}\n- ${bulletContent.trim()}\n`;
}

/** Bullet entra como seção datável no FIM do prompt — diff auditável, nunca rewrite. */
export function composeAppliedPrompt(basePrompt: string, bulletContent: string): string {
  return `${basePrompt.trimEnd()}${trechoAplicado(bulletContent)}`;
}

/**
 * O prompt SEM o trecho de uma proposta, ou `null` quando o trecho não está mais lá como foi
 * escrito (alguém editou o roteiro por cima). Tira a ÚLTIMA ocorrência. Pura.
 */
export function removerTrechoAplicado(prompt: string, bulletContent: string): string | null {
  // Sem a quebra do fim: quando outra proposta entra depois, o `trimEnd` da composição já a comeu,
  // e a linha seguinte começa com as quebras do PRÓXIMO trecho — que não são deste.
  const trecho = trechoAplicado(bulletContent).trimEnd();
  const i = prompt.lastIndexOf(trecho);
  if (i === -1) return null;
  const depois = prompt.slice(i + trecho.length);
  // O bullet tem de terminar ali: "…antes do valor" não pode casar com "…antes do valor e do link".
  if (depois !== "" && !depois.startsWith("\n")) return null;
  const resto = (prompt.slice(0, i) + depois).trimEnd();
  return resto === "" ? null : resto;
}

export type ApplyProposalResult =
  | { ok: true; versionId: string; versionNumber: number }
  | { ok: true; entryId: string }
  | { ok: false; code: ApplyProposalErrorCode; message: string };

export type ApplyProposalErrorCode =
  | "proposal_not_found"
  | "proposal_already_applied"
  | "proposal_dismissed"
  | "proposal_type_unsupported"
  | "agent_not_published"
  | "publish_failed"
  | "internal_error";

export async function applyProposal(
  admin: SupabaseClient,
  params: { orgId: string; agentId: string; proposalId: string; userId: string },
): Promise<ApplyProposalResult> {
  const { orgId, agentId, proposalId, userId } = params;

  const { data: proposal } = await admin
    .from("flywheel_distiller_proposals")
    .select("id, type, content, applied_at, dismissed_at")
    .eq("id", proposalId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!proposal) {
    return { ok: false, code: "proposal_not_found", message: "Proposta não encontrada." };
  }
  if (proposal.applied_at !== null) {
    return {
      ok: false,
      code: "proposal_already_applied",
      message: "Proposta já foi aplicada.",
    };
  }
  if (proposal.dismissed_at !== null && proposal.dismissed_at !== undefined) {
    return { ok: false, code: "proposal_dismissed", message: "Proposta foi dispensada." };
  }
  if (proposal.type === "org_memory_entry") {
    const title =
      proposal.content.length > 80 ? `${proposal.content.slice(0, 77)}...` : proposal.content;
    const { data: entry, error: entryErr } = await admin
      .from("org_memory_entries")
      .insert({
        organization_id: orgId,
        title,
        body: proposal.content,
        source: "flywheel",
        status: "active",
        proposal_id: proposalId,
        created_by: userId,
      })
      .select("id")
      .single();
    if (entryErr || !entry) {
      return { ok: false, code: "internal_error", message: "Falha ao gravar a memória da org." };
    }
    const { error: markErr } = await admin
      .from("flywheel_distiller_proposals")
      .update({ applied_at: new Date().toISOString(), applied_by: userId })
      .eq("id", proposalId)
      .eq("organization_id", orgId);
    if (markErr) {
      return {
        ok: false,
        code: "internal_error",
        message: "Memória gravada, mas falhou ao marcar a proposta.",
      };
    }
    return { ok: true, entryId: entry.id };
  }

  if (proposal.type !== "playbook_bullet") {
    return {
      ok: false,
      code: "proposal_type_unsupported",
      message: `Aplicação automática só existe para playbook_bullet (esta é ${proposal.type}).`,
    };
  }

  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, published_version_id")
    .eq("id", agentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!agent?.published_version_id) {
    return {
      ok: false,
      code: "agent_not_published",
      message: "O agente precisa de uma versão publicada para receber a proposta.",
    };
  }
  const versaoNoAr: string = agent.published_version_id;

  // A cópia é INTEIRA (`clonar-versao.ts`): só o roteiro muda.
  const criada = await criarVersaoAPartirDe(admin, {
    orgId,
    agentId,
    baseVersionId: versaoNoAr,
    userId,
    mudar: (c) => ({ ...c, system_prompt: composeAppliedPrompt(String(c.system_prompt ?? ""), proposal.content) }),
  });
  if (!criada.ok) {
    return {
      ok: false,
      code: "internal_error",
      message: criada.code === "version_not_found" ? "Versão publicada não encontrada." : criada.message,
    };
  }

  const published = await publishAgentVersion(admin, {
    orgId,
    agentId,
    versionId: criada.id,
  });
  if (!published.ok) {
    // Versão draft órfã fica como rastro inofensivo (draft nunca roda) — o
    // motivo real da falha (credencial revogada, sessão offline) volta ao operador.
    return {
      ok: false,
      code: "publish_failed",
      message: `Publicação vetada: ${published.code}. A proposta segue pendente.`,
    };
  }

  const { error: markErr } = await admin
    .from("flywheel_distiller_proposals")
    .update({
      applied_at: new Date().toISOString(),
      applied_version_id: criada.id,
      applied_by: userId,
      // A versão que estava no ar: é para ela que o "Desfazer" volta.
      previous_version_id: versaoNoAr,
      reverted_at: null,
      reverted_by: null,
    })
    .eq("id", proposalId)
    .eq("organization_id", orgId)
    .is("applied_at", null);
  if (markErr) {
    return { ok: false, code: "internal_error", message: "Versão publicada, mas falhou ao marcar a proposta." };
  }

  return { ok: true, versionId: criada.id, versionNumber: criada.versionNumber };
}

export type RevertProposalErrorCode =
  | "proposal_not_found"
  | "proposal_not_applied"
  | "proposal_already_reverted"
  | "proposal_type_unsupported"
  | "agent_not_published"
  | "revert_needs_manual_edit"
  | "publish_failed"
  | "internal_error";

export type RevertProposalResult =
  | { ok: true; versionId: string; versionNumber: number; modo: "versao_anterior" | "trecho_removido" }
  | { ok: true; entryId: string; modo: "memoria_arquivada" }
  | { ok: false; code: RevertProposalErrorCode; message: string };

/**
 * DESFAZER uma proposta aplicada. Sempre por uma versão NOVA — o histórico não é reescrito.
 *
 *  - O agente ainda está na versão que a proposta criou: publica-se uma cópia da versão que estava
 *    no ar ANTES. É a volta exata.
 *  - O roteiro já mudou depois (outra edição, outra proposta): voltar à versão antiga apagaria esse
 *    trabalho. Tira-se só o trecho da proposta do roteiro que está no ar.
 *  - O trecho não está mais lá como foi escrito: não há o que tirar com segurança, e a resposta
 *    diz isso em vez de adivinhar.
 *
 * Proposta de memória da organização: a anotação é arquivada (não apagada).
 */
export async function revertProposal(
  admin: SupabaseClient,
  params: { orgId: string; agentId: string; proposalId: string; userId: string },
): Promise<RevertProposalResult> {
  const { orgId, agentId, proposalId, userId } = params;

  const { data: proposal } = await admin
    .from("flywheel_distiller_proposals")
    .select("id, type, content, applied_at, applied_version_id, previous_version_id, reverted_at")
    .eq("id", proposalId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!proposal) return { ok: false, code: "proposal_not_found", message: "Proposta não encontrada." };
  if (proposal.applied_at === null) {
    return { ok: false, code: "proposal_not_applied", message: "Esta proposta não foi aplicada." };
  }
  if (proposal.reverted_at !== null && proposal.reverted_at !== undefined) {
    return { ok: false, code: "proposal_already_reverted", message: "Esta proposta já foi desfeita." };
  }

  const marcar = async (): Promise<boolean> => {
    const { error } = await admin
      .from("flywheel_distiller_proposals")
      .update({ reverted_at: new Date().toISOString(), reverted_by: userId })
      .eq("id", proposalId)
      .eq("organization_id", orgId);
    return !error;
  };

  if (proposal.type === "org_memory_entry") {
    const { data: entrada, error } = await admin
      .from("org_memory_entries")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("organization_id", orgId)
      .eq("proposal_id", proposalId)
      .select("id")
      .maybeSingle();
    if (error || !entrada) {
      return { ok: false, code: "internal_error", message: "Não encontrei a anotação de memória desta proposta." };
    }
    if (!(await marcar())) {
      return { ok: false, code: "internal_error", message: "Anotação arquivada, mas falhou ao marcar a proposta." };
    }
    return { ok: true, entryId: (entrada as { id: string }).id, modo: "memoria_arquivada" };
  }

  if (proposal.type !== "playbook_bullet") {
    return { ok: false, code: "proposal_type_unsupported", message: "Este tipo de proposta não tem como ser desfeito aqui." };
  }

  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, published_version_id")
    .eq("id", agentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!agent?.published_version_id) {
    return { ok: false, code: "agent_not_published", message: "O agente não tem versão publicada." };
  }
  const noAr: string = agent.published_version_id;

  const aindaNaVersaoDaProposta = proposal.applied_version_id !== null && proposal.applied_version_id === noAr;
  const temVersaoAnterior = typeof proposal.previous_version_id === "string" && proposal.previous_version_id !== "";

  let criada;
  let modo: "versao_anterior" | "trecho_removido";
  if (aindaNaVersaoDaProposta && temVersaoAnterior) {
    modo = "versao_anterior";
    criada = await criarVersaoAPartirDe(admin, {
      orgId,
      agentId,
      baseVersionId: proposal.previous_version_id as string,
      userId,
    });
  } else {
    modo = "trecho_removido";
    const { data: atual } = await admin
      .from("ai_agent_versions")
      .select("system_prompt")
      .eq("id", noAr)
      .eq("organization_id", orgId)
      .maybeSingle();
    const semTrecho = removerTrechoAplicado(String((atual as { system_prompt?: string } | null)?.system_prompt ?? ""), proposal.content);
    if (semTrecho === null) {
      return {
        ok: false,
        code: "revert_needs_manual_edit",
        message:
          "O roteiro foi editado depois desta proposta e o trecho dela não está mais lá como foi escrito. Use o histórico de versões do agente para voltar a uma versão anterior.",
      };
    }
    criada = await criarVersaoAPartirDe(admin, {
      orgId,
      agentId,
      baseVersionId: noAr,
      userId,
      mudar: (c) => ({ ...c, system_prompt: semTrecho }),
    });
  }
  if (!criada.ok) return { ok: false, code: "internal_error", message: criada.message };

  const published = await publishAgentVersion(admin, { orgId, agentId, versionId: criada.id });
  if (!published.ok) {
    return { ok: false, code: "publish_failed", message: `Publicação vetada: ${published.code}. Nada foi desfeito.` };
  }
  if (!(await marcar())) {
    return { ok: false, code: "internal_error", message: "Versão publicada, mas falhou ao marcar a proposta como desfeita." };
  }
  return { ok: true, versionId: criada.id, versionNumber: criada.versionNumber, modo };
}

/** DISPENSAR uma proposta pendente: ela sai da lista e não volta a ser aplicável. Não apaga. */
export async function dismissProposal(
  admin: SupabaseClient,
  params: { orgId: string; proposalId: string; userId: string },
): Promise<{ ok: true } | { ok: false; code: "proposal_not_found" | "proposal_already_applied" | "internal_error"; message: string }> {
  const { data: proposal } = await admin
    .from("flywheel_distiller_proposals")
    .select("id, applied_at")
    .eq("id", params.proposalId)
    .eq("organization_id", params.orgId)
    .maybeSingle();
  if (!proposal) return { ok: false, code: "proposal_not_found", message: "Proposta não encontrada." };
  if (proposal.applied_at !== null) {
    return { ok: false, code: "proposal_already_applied", message: "Proposta aplicada não se dispensa: desfaça." };
  }
  const { error } = await admin
    .from("flywheel_distiller_proposals")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: params.userId })
    .eq("id", params.proposalId)
    .eq("organization_id", params.orgId)
    .is("applied_at", null);
  if (error) return { ok: false, code: "internal_error", message: "Falha ao dispensar a proposta." };
  return { ok: true };
}
