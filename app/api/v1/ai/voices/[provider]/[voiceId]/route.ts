/**
 * DELETE /api/v1/ai/voices/:provider/:voiceId — apaga uma voz CLONADA (admin).
 *
 * Só apaga o que foi clonado: uma voz do catálogo do provedor não é nossa para
 * apagar, e a checagem lê a lista do provedor em vez de confiar no que a tela
 * mandou. E não apaga voz em uso: um agente configurado com ela ficaria mudo
 * (cairia para texto) sem ninguém ver — a resposta 409 nomeia quais agentes.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { ErroDeVoz, explicarErroDeVoz } from "@/lib/voz/erros";
import { implementacaoDeVoz } from "@/lib/voz/provedores";
import { ehProvedorDeVoz } from "@/lib/voz/tipos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string; voiceId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { provider, voiceId } = await ctx.params;
  const authz = await requireRole("admin", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  if (!ehProvedorDeVoz(provider) || voiceId.length < 1 || voiceId.length > 120) {
    return fail("invalid_request", t("Voz inválida."), 400, { requestId });
  }
  const impl = implementacaoDeVoz(provider);
  if (!impl.apagarVoz) {
    return fail("voice_delete_unsupported", t("Este provedor não tem vozes para apagar."), 422, { requestId });
  }

  const apiKey = await resolverChaveDeVoz(org.orgId, provider);
  if (!apiKey) {
    return fail("voice_key_missing", t(explicarErroDeVoz(new ErroDeVoz("sem_chave"))), 409, { requestId });
  }

  try {
    const vozes = await impl.listarVozes(apiKey);
    const voz = vozes.find((v) => v.id === voiceId);
    if (voz && voz.categoria !== "clonada") {
      return fail("voice_not_deletable", t("Só é possível apagar vozes clonadas."), 403, { requestId });
    }

    // Voz em uso por algum agente da organização (config.voice_reply.voice_id).
    const { data: agentes } = await createAdminClient()
      .from("ai_agents")
      .select("id, name, config")
      .eq("organization_id", org.orgId)
      .is("archived_at", null);
    const emUso = (agentes ?? [])
      .filter((a) => {
        const vr = (a.config as { voice_reply?: { voice_id?: string; provider?: string } } | null)?.voice_reply;
        return vr?.voice_id === voiceId && vr?.provider === provider;
      })
      .map((a) => a.name as string);
    if (emUso.length > 0) {
      return fail(
        "voice_in_use",
        t("Esta voz está em uso pelos agentes: ") + emUso.join(", ") + ".",
        409,
        { requestId },
      );
    }

    await impl.apagarVoz(apiKey, voiceId);
  } catch (err) {
    return fail("voice_delete_failed", t(explicarErroDeVoz(err)), 502, { requestId });
  }

  await audit({
    action: "ai.voice_deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_voice",
    resourceId: voiceId,
    requestId,
    metadata: { provider },
  });

  return ok({ deleted: true }, { requestId });
}
