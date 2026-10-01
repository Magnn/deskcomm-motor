import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { CustomFieldsSettingsClient } from "./_client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campos personalizados" };

export default async function CustomFieldsSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.manager) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data: pipelines } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, vocabulary, settings")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position")
    .limit(1);

  const defaultPipeline = pipelines?.[0];
  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  if (!defaultPipeline) {
    return (
      <div className="flex h-full flex-col gap-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Campos personalizados")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Defina informações adicionais que sua equipe e o agente coletam sobre os contatos.")}
          </p>
        </header>
        <div className="rounded-lg border border-warning/40 bg-warning-bg p-4 text-sm text-warning-fg">
          {t("Nenhum funil ativo encontrado para vincular campos personalizados.")}
        </div>
      </div>
    );
  }

  const campos = camposDoFunil(defaultPipeline.settings as Record<string, unknown> | null);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Campos personalizados")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Crie e organize os campos extras da sua empresa (ex: CPF, profissão, status de qualificação ou datas). Esses campos ficam visíveis no dossiê de contatos, no Inbox e podem ser lidos por automações e agentes."
          )}
        </p>
      </header>

      <CustomFieldsSettingsClient
        pipelineId={defaultPipeline.id}
        initialFields={campos}
        pipelineName={defaultPipeline.name}
      />
    </div>
  );
}
