/**
 * Configurações → Meta Ads. Onde o token de LEITURA da conta de anúncios é
 * conectado.
 *
 * ─── Por que uma tela separada de Configurações › Conversões ────────────────
 *
 * As duas conectam "a Meta", e juntá-las é tentador. São credenciais
 * diferentes, com escopos diferentes na plataforma (uma escreve conversões, a
 * outra lê `ads_read`), guardadas em tabelas diferentes pelas razões no
 * cabeçalho da migration 0214 — e com consequências diferentes quando falham:
 * um token de leitura vencido deixa uma tela vazia; o de conversões vencido faz
 * a empresa parar de reportar vendas sem ninguém perceber.
 *
 * Uma tela só, com dois campos de token que se parecem, é como alguém cola o
 * token errado no campo errado e passa uma semana achando que a integração
 * quebrou.
 *
 * ─── Por que ADMIN CLIENT para ler ──────────────────────────────────────────
 *
 * `ad_insights_connections` tem RLS ligada com ZERO policies e grants revogados
 * de anon/authenticated (0214). Pelo client de sessão esta página mostraria
 * "não conectado" para todo mundo — o gate de papel abaixo é o que autoriza, e a
 * leitura privilegiada acontece no servidor.
 *
 * O token NÃO é lido aqui, nem decifrado: `existeConexaoDeLeitura` responde
 * apenas se a linha existe. A tela nunca mostra o token de volta.
 */
import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { existeConexaoDeLeitura } from "@/lib/plataformas-de-anuncio/credenciais-de-leitura";
import { appDoMetaAds } from "@/lib/plataformas-de-anuncio/meta/login";
import { createAdminClient } from "@/lib/supabase/admin";

import { FormularioDeMetaAds } from "./_form";

export const metadata = { title: "Meta Ads" };
export const dynamic = "force-dynamic";

/**
 * O desfecho da volta do Facebook (`…/meta/callback`), em frase que diz O QUE
 * FAZER. Código desconhecido cai na frase genérica — a URL é editável.
 */
const ERRO_DA_VOLTA: Record<string, string> = {
  nao_configurado:
    "O login do Facebook não está configurado nesta instalação. Quem instalou o sistema precisa cadastrar o app da Meta.",
  estado_invalido: "Não consegui iniciar a conexão. Tente de novo em instantes.",
  sessao_expirada: "A conexão demorou demais e expirou. Clique em Conectar com Facebook de novo.",
  recusado: "A autorização foi cancelada no Facebook. Nada foi alterado.",
  sem_codigo: "O Facebook não concluiu a autorização. Tente de novo.",
  falha_na_meta: "O Facebook recusou a conexão. Tente de novo em instantes.",
  sem_permissao:
    "A permissão de leitura dos anúncios não foi concedida. Conecte de novo e mantenha a permissão marcada.",
  nenhuma_conta:
    "Este login do Facebook não tem acesso a nenhuma conta de anúncios. Entre com quem administra a conta.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export default async function MetaAdsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; conectado?: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  // Mesmo gate de `settings/conversoes`: o objeto é uma credencial da conta de
  // anúncios da empresa, ao lado de billing e API tokens na mesma prancheta.
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const admin = createAdminClient();
  const conexao = await existeConexaoDeLeitura(admin, activeOrg.orgId, "meta_ads");
  const loginDisponivel = (await appDoMetaAds()) !== null;
  const { erro, conectado } = await searchParams;

  const idioma = user.idioma;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Meta Ads")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "Conecte a sua conta de anúncios para o sistema ler o desempenho das suas campanhas e mostrá-lo em Análise › Meta Ads. É uma conexão só de leitura: nada é criado, pausado ou alterado na sua conta de anúncios.",
          )}
        </p>
      </header>

      {erro && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {t(ERRO_DA_VOLTA[erro] ?? "Não consegui conectar agora. Tente de novo.")}
        </div>
      )}
      {conectado && !erro && (
        <div role="status" className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
          {conectado === "escolher"
            ? t("Conta conectada. Escolha abaixo qual conta de anúncios a tela de Meta Ads abre.")
            : t("Conta conectada. O desempenho das campanhas já está em Análise › Meta Ads.")}
        </div>
      )}

      {!loginDisponivel && (
        <div className="rounded-md border border-sky-500/40 bg-sky-500/10 p-4 text-sm">
          {/*
            A permissão exata está escrita aqui porque é o erro nº 1 desta
            integração: um token gerado sem `ads_read` conecta, salva, e só falha
            na hora de abrir a tabela — longe daqui, com uma mensagem que parece
            problema de outra coisa.
          */}
          {t(
            "O token precisa da permissão ads_read. Gere-o no Meta for Developers, na sua conta de aplicativo, e cole abaixo — ele fica guardado criptografado e nunca é mostrado de volta.",
          )}
        </div>
      )}

      <FormularioDeMetaAds
        conectada={conexao.conectada}
        contaPadrao={conexao.contaPadrao}
        loginDisponivel={loginDisponivel}
        idioma={idioma}
      />

    </div>
  );
}
