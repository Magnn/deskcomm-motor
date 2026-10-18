"use client";

/**
 * Conectar a Stripe para o Pix na conversa. Um campo: a chave. O endereço do aviso de pagamento é registrado
 * na Stripe pelo servidor ao salvar — a pessoa não copia segredo nenhum.
 *
 * O campo nasce vazio, como o do Asaas ao lado: a tela nunca recebe a chave gravada.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { conectarComStripe } from "@/app/actions/settings/conectarComStripe";
import { conectarStripe } from "@/app/actions/settings/conectarStripe";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export interface EstadoDaStripe {
  conectada: boolean;
  temChave: boolean;
  habilitada: boolean;
  /** O aviso de pagamento já foi registrado na Stripe (sem ele, o pagamento não é confirmado sozinho). */
  temAviso: boolean;
  /** "Conectar com Stripe" (Stripe Connect): a conta da empresa criada sob a plataforma da instalação. */
  connect: {
    /** A instalação tem a chave da Stripe dela — sem ela o botão não tem como funcionar e não aparece. */
    disponivel: boolean;
    temConta: boolean;
    /** A Stripe liberou a conta para receber. */
    pronta: boolean;
    /** `null` = não deu para perguntar à Stripe agora. */
    pixAtivo: boolean | null;
    /** Taxa da plataforma por venda, em centavos (0 = sem taxa). Dita na tela antes de conectar. */
    taxaCentavos: number;
  };
}

const ERRO_DO_CONNECT: Record<string, string> = {
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode conectar a Stripe.",
  mfa_required: "Confirme o segundo fator para conectar.",
  plataforma_sem_stripe:
    "Esta instalação ainda não tem a Stripe configurada. Fale com quem administra o sistema.",
  connect_desligado:
    "A Stripe desta instalação ainda não está liberada para conectar contas. Fale com quem administra o sistema.",
  endereco_sem_https: "O endereço público desta instalação precisa estar configurado com https. Fale com quem administra o sistema.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia. Fale com quem administra o sistema.",
  provedor_indisponivel: "Não consegui falar com a Stripe agora. Tente de novo em instantes.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** O botão "Conectar com Stripe" e a situação da conta conectada. */
function ContaConectada({ estado, idioma }: { estado: EstadoDaStripe["connect"]; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const [isPending, startTransition] = useTransition();

  function abrirCadastro() {
    startTransition(async () => {
      const r = await conectarComStripe();
      if (!r.ok) {
        toast.error(t(ERRO_DO_CONNECT[r.error] ?? "Não foi possível abrir o cadastro da Stripe."));
        return;
      }
      window.location.assign(r.url);
    });
  }

  const situacao = !estado.temConta
    ? t("Ainda não conectada.")
    : !estado.pronta
      ? t("Cadastro na Stripe pendente: termine de preencher para começar a receber.")
      : t("Conta Stripe conectada e pronta para receber.");

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4" data-testid="stripe-connect">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{t("Receber na sua conta Stripe (recomendado)")}</h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Você cria a sua conta Stripe por aqui, sem copiar chave nenhuma. As vendas caem no seu banco, e reembolsos e contestações ficam com a sua conta.",
          )}
        </p>
        {estado.taxaCentavos > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="stripe-connect-taxa">
            {t("Taxa da plataforma:")} {reais(estado.taxaCentavos)}{" "}
            {t(
              "por venda paga em reais, descontada pela Stripe na própria cobrança, além das tarifas da Stripe.",
            )}
          </p>
        )}
        <p className="text-xs font-medium" data-testid="stripe-connect-estado">
          {situacao}
        </p>
        {estado.pronta && estado.pixAtivo === false && (
          <p className="text-xs text-muted-foreground">
            {t(
              "O Pix ainda não está ativo na sua conta. Ative na sua Stripe em Configurações › Formas de pagamento.",
            )}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {!estado.pronta && (
          <Button type="button" onClick={abrirCadastro} disabled={isPending}>
            {isPending
              ? t("Abrindo a Stripe…")
              : estado.temConta
                ? t("Continuar cadastro na Stripe")
                : t("Conectar com Stripe")}
          </Button>
        )}
        {estado.temConta && (
          <a
            className="text-xs underline"
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
          >
            {t("Abrir minha Stripe")}
          </a>
        )}
      </div>
    </div>
  );
}

const ERRO: Record<string, string> = {
  validation_failed: "A chave não está no formato esperado. Ela começa por sk_ ou rk_.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  chave_recusada:
    "A Stripe recusou esta chave. Confira se copiou a chave secreta inteira e se ela tem permissão de escrita.",
  provedor_indisponivel: "Não consegui falar com a Stripe agora. Tente de novo em instantes.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e a chave não foi gravada.",
  endereco_sem_https:
    "A chave foi gravada, mas o aviso de pagamento não: a Stripe só avisa endereços https. Abra o sistema pelo domínio com cadeado e salve de novo.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export function ConexaoComAStripe({ estado, idioma }: { estado: EstadoDaStripe; idioma: Idioma }) {
  const t = (texto: string) => traduzir(texto, idioma);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [chave, setChave] = useState("");
  const [habilitada, setHabilitada] = useState(estado.conectada ? estado.habilitada : true);
  const podeSalvar = estado.temChave || estado.connect.temConta || chave.trim().length >= 20;

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await conectarStripe({
        enabled: habilitada,
        ...(chave.trim() ? { api_key: chave.trim() } : {}),
      });
      if (!r.ok) {
        toast.error(t(ERRO[r.error] ?? "Não foi possível salvar."));
        return;
      }
      setChave("");
      if (chave.trim() && !r.pixAtivo) {
        toast.warning(
          t(
            "Conectado, mas o Pix ainda não está ativo nesta conta da Stripe. Ative em Configurações › Formas de pagamento, na Stripe.",
          ),
        );
      } else toast.success(t("Conexão salva."));
      router.refresh();
    });
  }

  return (
    <Card className="p-6" data-testid="conexao-stripe">
      <form onSubmit={salvar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t("Pix na conversa (Stripe)")}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              "Quando o agente enviar o link de pagamento, a pessoa recebe também o Pix copia e cola no mesmo valor, sem cadastro. O pagamento é confirmado sozinho.",
            )}
          </p>
        </div>

        {estado.connect.disponivel && <ContaConectada estado={estado.connect} idioma={idioma} />}

        <div className="flex flex-col gap-1">
          {estado.connect.disponivel && (
            <h3 className="text-sm font-semibold">
              {t("Ou use a chave da sua própria conta Stripe")}
            </h3>
          )}
          <p className="text-xs text-muted-foreground" data-testid="estado-stripe">
            {!estado.temChave
              ? t("Ainda não conectado.")
              : !estado.temAviso
                ? t(
                    "Chave gravada, mas o aviso de pagamento não foi registrado. Salve a chave de novo.",
                  )
                : estado.habilitada
                  ? t("Conectado e ativo.")
                  : t("Conectado, mas pausado.")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="stripe_key">{t("Chave secreta da Stripe")}</Label>
          <Input
            id="stripe_key"
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={
              estado.temChave
                ? t("Gravada. Deixe em branco para manter.")
                : t("Cole a chave gerada na Stripe")
            }
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Na Stripe: Desenvolvedores › Chaves de API. Guardada criptografada; nunca volta para esta tela.",
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="stripe_enabled">
              {t("Enviar o Pix junto com o link de pagamento")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("Desligar volta a enviar só o link e mantém a chave gravada.")}
            </p>
          </div>
          <Switch id="stripe_enabled" checked={habilitada} onCheckedChange={setHabilitada} />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending || !podeSalvar}>
            {isPending ? t("Salvando…") : t("Salvar conexão")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
