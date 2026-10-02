"use client";

/**
 * O formulário da conexão com a conta de cobrança (Asaas).
 *
 * O campo da chave nasce VAZIO e isso não é bug: a tela nunca recebe a chave (`lerEstadoDaCobranca` devolve só um
 * booleano). Vazio = "mantenha a gravada". Pré-preencher poria o segredo no HTML de uma página que o browser
 * cacheia. O switch pausa e preserva a chave; trocar de ambiente exige a chave daquele ambiente (a de sandbox
 * não vale em produção), e a tela avisa.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updatePaymentGatewayConnection } from "@/app/actions/settings/updatePaymentGatewayConnection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import type { EstadoDaCobranca } from "@/lib/pagamentos/estado-da-conexao";

const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Confira os campos: algum valor não está no formato esperado.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  chave_recusada: "O Asaas recusou esta chave de API. Confira se ela é do ambiente escolhido (produção ou sandbox).",
  provedor_indisponivel: "Não consegui falar com o Asaas agora para conferir a chave. Tente de novo em instantes.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e a chave não foi gravada. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export function FormularioDeCobranca({ estado, idioma }: { estado: EstadoDaCobranca; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [chave, setChave] = useState("");
  const [ambiente, setAmbiente] = useState<"production" | "sandbox">(estado.ambiente);
  const [habilitada, setHabilitada] = useState(estado.conectada ? estado.habilitada : true);

  // Primeira conexão exige a chave; depois, vazio mantém a gravada.
  const podeSalvar = estado.temChave || chave.trim().length >= 20;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await updatePaymentGatewayConnection({
        provider: "asaas",
        environment: ambiente,
        enabled: habilitada,
        ...(chave.trim() ? { api_key: chave.trim() } : {}),
      });
      if (r.ok) {
        toast.success(t("Conexão salva."));
        setChave("");
        router.refresh();
      } else {
        toast.error(t(ERRO_EM_PORTUGUES[r.error] ?? "Não foi possível salvar."));
      }
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={salvar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label htmlFor="ambiente">{t("Ambiente")}</Label>
          <select
            id="ambiente"
            value={ambiente}
            onChange={(e) => setAmbiente(e.target.value as "production" | "sandbox")}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="sandbox">{t("Sandbox (testes — não cobra de verdade)")}</option>
            <option value="production">{t("Produção")}</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {t("Comece pelo sandbox. A chave de um ambiente não vale no outro.")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="api_key">{t("Chave de API do Asaas")}</Label>
          <Input
            id="api_key"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={estado.temChave ? t("Gravada. Deixe em branco para manter.") : t("Cole a chave gerada no Asaas")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Guardada criptografada. Ela nunca volta para esta tela depois de salva.")}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="enabled">{t("Criar cobranças pelos fluxos")}</Label>
            <p className="text-xs text-muted-foreground">
              {t("Desligar pausa as cobranças e mantém a chave gravada.")}
            </p>
          </div>
          <Switch id="enabled" checked={habilitada} onCheckedChange={setHabilitada} />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending || !podeSalvar}>
            {isPending ? t("Salvando…") : t("Salvar conexão")}
          </Button>
          {!podeSalvar && (
            <span className="text-xs text-muted-foreground">{t("Cole a chave de API para poder salvar.")}</span>
          )}
        </div>
      </form>
    </Card>
  );
}
