/**
 * Configurações → Pagamentos. Onde a empresa conecta a conta de cobrança (Asaas) que o nó "Cobrança" dos
 * fluxos usa para gerar o link e o PIX copia-e-cola.
 *
 * Nasce JUNTO com o mecanismo (invariante 6 da doutrina de restrição de canal): estado configurável precisa de
 * tela para ver e tela para mudar. Lê pelo ADMIN CLIENT — a tabela tem RLS sem policies e grants revogados de
 * anon/authenticated — e o gate de papel abaixo é o que autoriza. `admin`, não `manager`: a chave emite
 * cobranças em nome da empresa.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { lerEstadoDaCobranca } from "@/lib/pagamentos/estado-da-conexao";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDeCobranca } from "./_form";

export const metadata = { title: "Pagamentos" };
export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const estado = await lerEstadoDaCobranca(createAdminClient(), activeOrg.orgId);
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{t("Pagamentos")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Conecte sua conta do Asaas. A caixa Cobrança dos fluxos usa esta conexão para gerar o link de pagamento e o PIX copia e cola.")}
        </p>
        <p className="text-xs text-muted-foreground">
          {estado.conectada && estado.temChave
            ? estado.habilitada
              ? t("Conectado e ativo.")
              : t("Conectado, mas pausado.")
            : t("Ainda não conectado.")}
        </p>
      </header>
      <FormularioDeCobranca estado={estado} idioma={user.idioma} />
    </div>
  );
}
