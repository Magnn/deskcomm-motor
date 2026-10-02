"use client";

/**
 * O plano de UMA empresa, no painel do dono da instalação.
 *
 * É aqui que se dá um plano por fora do pagamento — a conta da própria casa, uma
 * cortesia, um acerto feito à mão. Plano posto aqui tem origem "manual" e não cai
 * por aviso de pagamento; "Sem plano" remove a assinatura.
 *
 * Lê e grava por `/api/v1/admin/tenants/[id]/plan`. Com a cobrança DESLIGADA na
 * instalação o cartão diz isso — o plano fica gravado, mas nada é limitado.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { precoLegivel } from "@/lib/planos/catalogo";

interface RetratoDoPlano {
  cobrando: boolean;
  planos: Array<{ id: string; nome: string; preco_mensal_centavos: number; numeros: number }>;
  assinatura: {
    plano_id: string;
    status: "ativa" | "inativa";
    origem: "cakto" | "manual";
    referencia: string | null;
    motivo: string | null;
    atualizada_em: string;
  } | null;
}

const SEM_PLANO = "__sem_plano__";

export function PlanoDaEmpresa({ organizationId }: { organizationId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const chave = ["admin-tenant-plano", organizationId];
  const caminho = `/api/v1/admin/tenants/${organizationId}/plan`;

  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => apiClient.get<{ data: RetratoDoPlano }>(caminho),
  });

  const gravar = useMutation({
    mutationFn: (planoId: string | null) => apiClient.put<{ data: RetratoDoPlano }>(caminho, { plan_id: planoId }),
    onSuccess: (res) => {
      qc.setQueryData(chave, res);
      toast.success(t("Plano atualizado."));
    },
    onError: (err) => showApiError(err),
  });

  const retrato = consulta.data?.data;
  const assinatura = retrato?.assinatura ?? null;

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3" data-testid="plano-da-empresa">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("Plano")}</h2>

      {consulta.isError ? (
        <p className="text-sm text-destructive">{t("Não foi possível carregar o plano desta empresa.")}</p>
      ) : !retrato ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : (
        <>
          <Select
            value={assinatura?.plano_id ?? SEM_PLANO}
            disabled={gravar.isPending}
            onValueChange={(v) => gravar.mutate(v === SEM_PLANO ? null : v)}
          >
            <SelectTrigger aria-label={t("Plano desta empresa")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_PLANO}>{t("Sem plano")}</SelectItem>
              {retrato.planos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {`${p.nome} — ${precoLegivel(p.preco_mensal_centavos)} · ${p.numeros} ${p.numeros === 1 ? t("número") : t("números")}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {assinatura && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={assinatura.status === "ativa" ? "success" : "error"}>
                {assinatura.status === "ativa" ? t("Em dia") : t("Inativo")}
              </Badge>
              <span>{assinatura.origem === "manual" ? t("Definido à mão") : t("Pago pela Cakto")}</span>
              {assinatura.referencia && <span>{assinatura.referencia}</span>}
            </div>
          )}
          {assinatura?.status === "inativa" && assinatura.motivo && (
            <p className="text-xs text-muted-foreground">{assinatura.motivo}</p>
          )}

          <p className="text-xs text-muted-foreground">
            {retrato.cobrando
              ? t("Plano definido aqui não cai por falta de pagamento. Sem plano, a empresa não conecta número.")
              : t("A cobrança de plano está desligada nesta instalação: o plano fica gravado, mas nada é limitado.")}
          </p>
        </>
      )}
    </div>
  );
}
