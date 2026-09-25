/**
 * Ação `set_lead_custom_field` — grava um valor FIXO da regra num campo
 * customizado do lead (`crm_leads.custom_fields`), reusando a mesma escrita
 * que o follow-up já usa para persistir resposta do lead (`persistir-resposta.ts`
 * `save_to: {kind:'lead_custom'}`) — mesmo destino, fonte diferente: aqui o
 * valor vem da CONFIG da regra (ex.: a variante que o ramo que disparou já
 * decidiu), não do texto que a pessoa digitou.
 *
 * NÃO emite evento em `event_log`: nenhum consumidor ouve um "campo gravado" (o
 * gatilho de automação é vocabulário fechado), e evento-fato sem consumidor e
 * fora de `fn_event_log_e_registro` (migration 0239) nasce `pending` e nunca
 * sai (issue #753, cobrado por `tests/unit/evento-de-fato-nao-fica-pendente.test.ts`).
 * O rastro do que a regra gravou é o `detail` devolvido abaixo, que o log de
 * execução da automação já guarda.
 */
import { registerAction } from "@/lib/automation/actions";
import type { ActionCtx, ActionResultDetail } from "@/lib/automation/types";
import { persistirRespostaFollowupSupabase } from "@/lib/followup/persistir-resposta";

const TYPE = "set_lead_custom_field";

function contactIdFromCtx(ctx: ActionCtx): string | null {
  const contact = ctx.context.contact as { id?: string } | undefined;
  if (typeof contact?.id === "string" && contact.id) return contact.id;
  const lead = ctx.context.lead as { contact_id?: string | null } | undefined;
  if (typeof lead?.contact_id === "string" && lead.contact_id) return lead.contact_id;
  return null;
}

async function execute(ctx: ActionCtx, config: Record<string, unknown>): Promise<ActionResultDetail> {
  const key = typeof config.key === "string" ? config.key : null;
  const value = typeof config.value === "string" ? config.value : null;
  if (!key || !value) return { type: TYPE, status: "failed", error: "missing_config" };

  const contactId = contactIdFromCtx(ctx);
  if (!contactId) return { type: TYPE, status: "skipped", detail: { reason: "no_contact" } };

  const resultado = await persistirRespostaFollowupSupabase(ctx.admin, {
    organization_id: ctx.organizationId,
    contact_id: contactId,
    save_to: { kind: "lead_custom", key },
    value,
  });
  if (!resultado.applied) return { type: TYPE, status: "skipped", detail: { reason: "no_lead" } };

  return { type: TYPE, status: "success", detail: { key, value, lead_id: resultado.leadId } };
}

registerAction({ type: TYPE, execute });
