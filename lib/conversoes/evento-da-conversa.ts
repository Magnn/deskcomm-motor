/**
 * EVENTO DA CONVERSA — reportar à plataforma de anúncio um passo que a conversa deu ANTES da venda.
 *
 * Por que existe: a venda fechada (`envio.handler.ts`) é o evento certo e é raro. Medido numa
 * operação em 10/10/2026 — 33 vendas em 7 dias espalhadas por 4 contas de anúncio, contra 137
 * links de pagamento enviados num único dia. Com um punhado de compras por semana o otimizador da
 * plataforma não sai do aprendizado; o passo anterior acontece dezenas de vezes mais e é sinal
 * honesto de intenção: a pessoa ouviu a oferta e recebeu por onde pagar.
 *
 * Quem dispara é o marco que o sistema já grava sozinho (`lib/resultado/marcos.ts`): link de
 * pagamento enviado → `InitiateCheckout`. Nada de configurar nó, nada de colar id.
 *
 * As mesmas travas da venda, porque o risco é o mesmo (evento em dobro envenena o otimizador sem
 * sintoma): uma vez por (organização, negócio, evento) no livro-razão; o interruptor é a tela de
 * Conversões; o destino na Meta é o conjunto de dados do próprio canal. Sem anúncio de origem não há
 * o que reportar — e isso NÃO vira linha no livro-razão: a maioria das conversas sem anúncio encheria
 * a tela de pendências que ninguém tem como resolver.
 *
 * Sem valor, de propósito: o preço da oferta muda na negociação, e um valor errado aqui ensinaria
 * mais errado que valor nenhum. Quem carrega valor é a compra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { lerCredencial } from "@/lib/plataformas-de-anuncio/credenciais";
import { transporteDe } from "@/lib/plataformas-de-anuncio/registry";
import type { ConversaoOffline, NomeDoEvento } from "@/lib/plataformas-de-anuncio/types";

import { lerDestinoDeMensageria } from "./destino-de-mensageria";
import { lerAtribuicao } from "./leitura-da-atribuicao";
import { jaFoiEnviada, registraEnvio, type StatusDeEnvio } from "./registro-de-envio";

/** O evento que o link de pagamento enviado reporta. */
export const EVENTO_DO_LINK_DE_PAGAMENTO: NomeDoEvento = "InitiateCheckout";

/** Passo mais velho que isto não é reportado: seria backlog virando atribuição de hoje. */
export const IDADE_MAXIMA_DO_PASSO_MS = 24 * 60 * 60 * 1000;

export interface PassoDaConversa {
  organizationId: string;
  contactId: string;
  evento: NomeDoEvento;
  /** Quando o passo aconteceu (a mensagem saiu), nunca quando a rotina acordou. */
  ocorridoEm: Date;
}

export interface DesfechoDoPasso {
  status: StatusDeEnvio;
  motivo: string | null;
}

export async function reportarEventoDaConversa(
  admin: SupabaseClient,
  passo: PassoDaConversa,
  agora: Date = new Date(),
): Promise<DesfechoDoPasso> {
  const { organizationId: org, contactId, evento } = passo;
  if (agora.getTime() - passo.ocorridoEm.getTime() > IDADE_MAXIMA_DO_PASSO_MS) {
    return { status: "skipped", motivo: "passo_antigo" };
  }

  // Sem anúncio de origem, nada a reportar — e nada a registrar (ver o cabeçalho).
  const leitura = await lerAtribuicao(admin, org, contactId);
  if (!leitura.temAtribuicao) return { status: "skipped", motivo: leitura.motivo };
  const { plataforma, cliqueDeOrigem, telefone } = leitura.atribuicao;

  // O interruptor: organização que não ligou o envio de conversões não reporta passo nenhum, em silêncio.
  const credencial = await lerCredencial(admin, org, plataforma);
  if (!credencial.ok) return { status: "skipped", motivo: credencial.motivo };

  // ⚠️ Filtro de organização junto do contato: o client é service-role e ignora RLS.
  const { data: lead } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", org)
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const leadId = (lead as { id: string } | null)?.id;
  // O livro-razão é por negócio. Sem negócio não há onde registrar, e o que não se registra não se audita.
  if (!leadId) return { status: "skipped", motivo: "sem_lead" };

  if (await jaFoiEnviada(admin, org, leadId, evento)) return { status: "skipped", motivo: "ja_enviada" };

  const registra = async (status: StatusDeEnvio, motivo: string | null, detalhe?: string): Promise<DesfechoDoPasso> => {
    await registraEnvio(admin, {
      organizationId: org,
      leadId,
      plataforma,
      evento,
      status,
      motivo,
      eventoId: `${leadId}:${evento}`,
      valorCentavos: null,
      moeda: null,
      detalhe: detalhe ?? null,
    });
    return { status, motivo };
  };

  const transporte = transporteDe(plataforma);
  if (!transporte) return { status: "skipped", motivo: "plataforma_sem_transporte" };

  let contaDoWhatsApp: string | null = null;
  let credencialDoEnvio = credencial.credencial;
  if (plataforma === "meta_ads") {
    const destino = await lerDestinoDeMensageria(admin, org, contactId);
    // Conversa fora de canal oficial não tem destino na Meta. É o caso comum de quem atende por QR:
    // não é pendência a mostrar por conversa.
    if (!destino.ok) return { status: "skipped", motivo: destino.motivo };
    contaDoWhatsApp = destino.destino.contaDoWhatsApp;
    credencialDoEnvio = {
      ...credencial.credencial,
      datasetId: destino.destino.datasetId,
      accessToken: destino.destino.accessToken,
    };
  }

  const conversao: ConversaoOffline = {
    organizationId: org,
    leadId,
    evento,
    eventoId: `${leadId}:${evento}`,
    ocorridoEm: passo.ocorridoEm,
    cliqueDeOrigem,
    telefone,
    contaDoWhatsApp,
    moeda: "BRL",
    valorCentavos: null,
  };

  const resultado = await transporte.enviar(credencialDoEnvio, conversao);
  if (resultado.tipo === "ok") return registra("sent", null, resultado.detalhe);
  if (resultado.tipo === "transitorio") {
    // Nada no livro-razão: o próximo link desta conversa tenta de novo. Fica o log.
    logger.warn("[conversoes.passo] envio adiado pela plataforma", { evento, detalhe: resultado.detalhe });
    return { status: "skipped", motivo: "transitorio" };
  }
  return registra("error", "recusado_pela_plataforma", resultado.detalhe);
}
