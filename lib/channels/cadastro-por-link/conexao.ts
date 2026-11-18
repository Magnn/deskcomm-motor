/**
 * Conexão do número oficial por LINK DE CADASTRO, pela chave da instalação.
 *
 *   iniciar  → cliente da organização no projeto (achado ou criado) + link de
 *              cadastro com volta para `/auth/link-return/<estado>`;
 *   concluir → a tela, autenticada, entrega o estado assinado e o
 *              `phone_number_id`; o servidor confere a assinatura, pergunta ao
 *              provedor de QUEM é o número (tem de ser do cliente desta
 *              organização), registra o webhook com segredo gerado aqui e grava.
 *
 * A volta NÃO é assinada pelo provedor: quem garante é o estado (HMAC nosso,
 * com org e usuário) somado à conferência do número na API. Um
 * `phone_number_id` colado à mão de outro cliente é recusado.
 */
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CODIGO_DE_PLANO_NECESSARIO } from "@/lib/planos/trava-de-numero";
import { mensagemDaRecusa, recusaParaNovoNumero } from "@/lib/planos/assinatura-da-organizacao";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

import { ErroDaConexaoUmClique, type ContextoDaConexao, type ConexaoConcluida } from "../conexao-um-clique";
import { emitirEstadoDaVolta, verificarEstadoDaVolta } from "../estado-da-volta";
import {
  KAPSO_LABEL,
  chaveDoKapso,
  criarLinkDeCadastro,
  garantirCliente,
  numeroDoKapso,
  registrarWebhookDoNumero,
} from "./api";
import { salvarSessaoKapso, sessoesKapso } from "./session";

/** Nomes neutros para quem está fora de `lib/channels/` (lint:channels). */
export const ROTULO_DO_LINK_DE_CADASTRO = KAPSO_LABEL;
export { sessoesKapso as numerosDoLinkDeCadastro };

/** A instalação configurou a chave? Liga a aba na tela. */
export async function linkDeCadastroDisponivel(): Promise<boolean> {
  return (await chaveDoKapso()) !== null;
}

async function chaveOuRecusa(): Promise<string> {
  const chave = await chaveDoKapso();
  if (!chave) {
    throw new ErroDaConexaoUmClique("Esta instalação não configurou a chave deste provedor.", 404, "not_found");
  }
  return chave;
}

async function conferirVaga(admin: SupabaseClient, organizationId: string): Promise<void> {
  const recusa = await recusaParaNovoNumero(admin, organizationId);
  if (recusa === null) return;
  throw new ErroDaConexaoUmClique(mensagemDaRecusa(recusa), 402, CODIGO_DE_PLANO_NECESSARIO, { ...recusa });
}

function idiomaDoLink(idioma: string): "pt" | "es" | "en" {
  if (idioma.startsWith("es")) return "es";
  if (idioma.startsWith("en")) return "en";
  return "pt";
}

export async function iniciarLinkDeCadastro(
  admin: SupabaseClient,
  ctx: ContextoDaConexao,
  opcoes: { coexistencia: boolean; cor: string | null },
): Promise<{ url: string }> {
  const chave = await chaveOuRecusa();
  // Conectar sempre é número novo aqui (reconectar o mesmo número ressuscita a
  // linha na volta, sem gastar vaga) — a trava vem antes de abrir o cadastro.
  await conferirVaga(admin, ctx.organizationId);
  const customerId = await garantirCliente(chave, { id: ctx.organizationId, nome: ctx.organizationNome });
  const estado = emitirEstadoDaVolta(
    { organizationId: ctx.organizationId, userId: ctx.userId, profileId: customerId },
    { segredo: ctx.segredo, agora: ctx.agora },
  );
  const volta = `${ctx.publicBase}/auth/link-return/${estado}`;
  const url = await criarLinkDeCadastro(chave, {
    customerId,
    sucesso: volta,
    falha: volta,
    coexistencia: opcoes.coexistencia,
    idioma: idiomaDoLink(ctx.idioma),
    cor: opcoes.cor,
  });
  return { url };
}

const ID_DA_META = /^[0-9]{5,30}$/;

export async function concluirLinkDeCadastro(
  admin: SupabaseClient,
  ctx: ContextoDaConexao & { requestId: string },
  volta: { estado: string; phoneNumberId?: string; erro?: string },
): Promise<ConexaoConcluida> {
  const estado = verificarEstadoDaVolta(volta.estado, { segredo: ctx.segredo, agora: ctx.agora });
  if (!estado || estado.organizationId !== ctx.organizationId || estado.userId !== ctx.userId) {
    throw new ErroDaConexaoUmClique("O link de volta expirou ou não é desta conta. Comece de novo.", 400, "invalid_request");
  }
  if (volta.erro) {
    throw new ErroDaConexaoUmClique(`O cadastro não foi concluído (${volta.erro}). Tente de novo.`, 422, "invalid_request", {
      motivo: volta.erro,
    });
  }
  if (!volta.phoneNumberId || !ID_DA_META.test(volta.phoneNumberId)) {
    throw new ErroDaConexaoUmClique("A volta do cadastro não trouxe o número. Tente de novo.", 400, "invalid_request");
  }

  const chave = await chaveOuRecusa();
  const numero = await numeroDoKapso(chave, volta.phoneNumberId);
  if (numero.customerId !== estado.profileId) {
    throw new ErroDaConexaoUmClique("Este número não foi conectado por esta empresa.", 403, "forbidden");
  }

  const sessoes = await sessoesKapso(admin, ctx.organizationId);
  const existente = sessoes.find((s) => s.phoneNumberId === numero.phoneNumberId) ?? null;
  if (!existente || existente.archivedAt) await conferirVaga(admin, ctx.organizationId);

  // O provedor aceita UM webhook no formato da Meta por número: reconectar o
  // mesmo número mantém o endereço e o segredo que já estão registrados lá.
  let webhook: { id: string; pathToken: string; segredoCifrado: string } | null = null;
  if (!existente?.webhookId) {
    const pathToken = randomBytes(16).toString("hex");
    const segredo = randomBytes(32).toString("hex");
    const segredoCifrado = await encryptWebhookSecret(admin, segredo);
    if (!segredoCifrado) throw new Error("kapso_segredo_nao_cifrado");
    const id = await registrarWebhookDoNumero(chave, {
      phoneNumberId: numero.phoneNumberId,
      url: `${ctx.publicBase}/api/v1/webhooks/channel/${pathToken}`,
      segredo,
    });
    webhook = { id, pathToken, segredoCifrado };
  }

  const displayName = numero.nome?.trim() || numero.telefone || KAPSO_LABEL;
  const salvo = await salvarSessaoKapso(admin, {
    organizationId: ctx.organizationId,
    existente,
    phoneNumberId: numero.phoneNumberId,
    wabaId: numero.wabaId,
    customerId: estado.profileId,
    webhook,
    phoneNumber: numero.telefone,
    displayName,
    userId: ctx.userId,
    requestId: ctx.requestId,
  });
  if (salvo.error || !salvo.channelSessionId) throw new Error(`kapso_sessao_nao_gravada: ${salvo.error}`);
  return {
    channelSessionId: salvo.channelSessionId,
    phoneNumber: numero.telefone,
    displayName,
    webhookRegistrado: true,
  };
}
