/**
 * O PAGAMENTO DE UM PLANO — pagou, o plano entra; deixou de pagar, o plano cai.
 *
 * Diferente de `lib/tenants/assinatura.ts` (que cria e SUSPENDE a empresa
 * inteira), aqui o cliente já pode ter conta: ele se cadastrou de graça, montou
 * os fluxos, e agora pagou para conectar número. Então:
 *
 *   pagou   → acha a empresa de quem pagou e grava o plano em dia. A empresa é
 *             a que esta mesma compra criou antes (marcador do provisionamento)
 *             ou, senão, aquela em que o e-mail do comprador é ADMINISTRADOR.
 *             Sem nenhuma das duas, a empresa é criada — e o link de acesso
 *             volta para quem chamou mandar por e-mail.
 *   caiu    → o plano fica inativo e os fluxos em andamento param. A conta NÃO
 *             é suspensa: a pessoa entra, vê as conversas e regulariza.
 *
 * Um plano posto à mão pelo dono da instalação (cortesia, conta própria) não
 * cai por aviso de pagamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { EmailJaTemContaError } from "@/lib/auth/provision";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { acharEmpresa, ativarAssinatura, encerrarFluxosDaEmpresa } from "@/lib/tenants/assinatura";

import { ativarPlano, inativarPlano } from "./assinatura-da-organizacao";

type Admin = SupabaseClient;

export interface PagamentoDoPlano {
  integration: string;
  /** E-mail do comprador, em minúsculas — a chave que liga o pagamento à empresa. */
  email: string;
  nome: string;
  planoId: string;
  requestId: string;
}

export type ResultadoDoPagamento =
  | { ok: true; organizationId: string; criada: boolean; linkDeAcesso: string | null }
  | { ok: false; motivo: "email_sem_empresa_propria" | "dados_do_dono_faltando" | "empresa_nao_encontrada" };

const CONTAS_POR_PAGINA = 200;
const PAGINAS_DO_DIRETORIO = 50;

/**
 * A conta com este e-mail, ou `null`. Varre o diretório paginado porque o
 * servidor de autenticação não filtra por e-mail (mesma razão e mesmo teto de
 * `lib/auth/provision.ts`). Erro LANÇA: "não consegui procurar" não é "não existe"
 * — tratado como ausência, um cliente que já tem conta ganharia uma segunda empresa.
 */
async function contaPorEmail(admin: Admin, email: string): Promise<string | null> {
  for (let pagina = 1; pagina <= PAGINAS_DO_DIRETORIO; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: CONTAS_POR_PAGINA });
    if (error) throw new Error(`planos: busca da conta do comprador falhou: ${error.message}`);
    if (data.users.length === 0) return null;
    const achada = data.users.find((u) => u.email?.toLowerCase() === email);
    if (achada) return achada.id;
  }
  return null;
}

/**
 * A empresa em que esta pessoa é ADMINISTRADORA — a mais antiga, se houver mais
 * de uma. Só admin: o pagamento de um atendente não dá plano à empresa do patrão
 * sem o patrão saber, e nem um convidado de fora "paga" pela empresa de outro.
 */
async function empresaAdministradaPor(admin: Admin, userId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("user_organizations")
    .select("organization_id, accepted_at")
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null)
    .order("accepted_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`planos: busca da empresa do comprador falhou: ${error.message}`);
  return (data?.[0] as { organization_id: string } | undefined)?.organization_id ?? null;
}

async function empresaDoComprador(admin: Admin, p: { integration: string; email: string }): Promise<string | null> {
  const criadaPorEstaCompra = await acharEmpresa(admin, p.integration, p.email);
  if (criadaPorEstaCompra) return criadaPorEstaCompra.id;
  const conta = await contaPorEmail(admin, p.email);
  return conta ? await empresaAdministradaPor(admin, conta) : null;
}

/** Pagou (ou renovou): o plano fica em dia. Idempotente. */
export async function aplicarPagamentoDoPlano(p: PagamentoDoPlano): Promise<ResultadoDoPagamento> {
  const admin = createAdminClient();
  let organizationId = await empresaDoComprador(admin, p);
  let criada = false;
  let linkDeAcesso: string | null = null;

  if (organizationId === null) {
    // Comprou sem ter conta: a empresa nasce agora, pelo mesmo caminho da assinatura.
    try {
      const r = await ativarAssinatura({
        integration: p.integration,
        externalId: p.email,
        organizationName: p.nome,
        ownerEmail: p.email,
        ownerName: p.nome,
        requestId: p.requestId,
      });
      if (!r.ok) return { ok: false, motivo: "dados_do_dono_faltando" };
      organizationId = r.organizationId;
      criada = r.criada;
      linkDeAcesso = r.linkDeAcesso;
    } catch (err) {
      // A conta existe, mas não administra empresa nenhuma (é convidada na de
      // outra pessoa): não há empresa DELA para receber o plano. Fica para uma pessoa.
      if (err instanceof EmailJaTemContaError) return { ok: false, motivo: "email_sem_empresa_propria" };
      throw err;
    }
  }

  await ativarPlano(admin, { organizationId, planoId: p.planoId, origem: "cakto", referencia: p.email });
  void audit({
    action: "tenant.plano_ativado",
    organizationId,
    resourceType: "organization",
    resourceId: organizationId,
    requestId: p.requestId,
    metadata: { plano: p.planoId, origem: p.integration, criada },
  });
  return { ok: true, organizationId, criada, linkDeAcesso };
}

/** Cancelou, atrasou, reembolsou: o plano cai e os fluxos em andamento param. Idempotente. */
export async function aplicarQuedaDoPlano(p: {
  integration: string;
  email: string;
  motivo: string;
  requestId: string;
}): Promise<{ ok: true; organizationId: string; fluxosEncerrados: number } | { ok: false; motivo: "empresa_nao_encontrada" }> {
  const admin = createAdminClient();
  const organizationId = await empresaDoComprador(admin, p);
  if (organizationId === null) return { ok: false, motivo: "empresa_nao_encontrada" };

  const caiu = await inativarPlano(admin, { organizationId, motivo: p.motivo, soDaOrigem: "cakto" });
  if (!caiu) {
    // Sem assinatura, ou com plano posto à mão: o aviso não derruba nada.
    logger.info("[planos] aviso de queda sem plano pago para derrubar", { requestId: p.requestId, organizationId });
    return { ok: false, motivo: "empresa_nao_encontrada" };
  }
  const fluxosEncerrados = await encerrarFluxosDaEmpresa(admin, organizationId, "Assinatura inativa: os fluxos foram encerrados.");
  void audit({
    action: "tenant.plano_inativado",
    organizationId,
    resourceType: "organization",
    resourceId: organizationId,
    requestId: p.requestId,
    metadata: { origem: p.integration, reason: p.motivo, fluxos_encerrados: fluxosEncerrados },
  });
  return { ok: true, organizationId, fluxosEncerrados };
}
