/**
 * ENTRAR NA ÁREA PELA COMPRA — quem pagou um quiz (prosperidade, caminhos, par) ou a sinastria cai DENTRO da área,
 * já logada, sem pedir código por e-mail (pedido do dono em 02/11/2026, no molde dos apps do setor: pagou, está
 * dentro). Quem prova o direito é o segredo do pedido, que só o navegador que fez o pedido tem — o mesmo que já libera
 * a leitura paga. Sem pagamento confirmado, nada abre.
 *
 * A sessão é a da área (`area_sessoes`, origem "quiz", prevista desde a 0942) e o rastro é o evento "entrou".
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { registrarEvento } from "./eventos";
import { criarSessao, type OrgDaArea, type SessaoCriada } from "./sessao";
import { hashDoToken } from "./token";
import { caminhoPublicoDaArea } from "./vocabulario";

/** As tabelas de pedido pago que abrem a área: os quizzes de uma pessoa (0943), a sinastria (0942) e a entrada do plano (0955). */
export type PedidoQueAbreAArea =
  | { tabela: "area_quiz_pedidos"; tipo: string }
  | { tabela: "area_sinastrias" }
  | { tabela: "area_entradas" };

export type EntradaPelaCompra =
  | { ok: true; sessao: SessaoCriada; caminho: string }
  | { ok: false; motivo: "nao_encontrado" | "nao_pago" };

export async function entrarPelaCompra(
  admin: SupabaseClient,
  org: OrgDaArea,
  pedido: PedidoQueAbreAArea,
  id: string,
  segredo: string,
): Promise<EntradaPelaCompra> {
  let consulta = admin
    .from(pedido.tabela)
    .select("contact_id, pago_at")
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("segredo_hash", hashDoToken(segredo));
  if (pedido.tabela === "area_quiz_pedidos") consulta = consulta.eq("tipo", pedido.tipo);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw new Error(error.message);
  const achado = data as { contact_id: string; pago_at: string | null } | null;
  if (!achado) return { ok: false, motivo: "nao_encontrado" };
  if (!achado.pago_at) return { ok: false, motivo: "nao_pago" };

  const sessao = await criarSessao(admin, org, achado.contact_id, "quiz");
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: achado.contact_id,
    tipo: "entrou",
    sessaoId: sessao.sessaoId,
    props:
      pedido.tabela === "area_entradas"
        ? { origem: "entrada", pedido: "entrada" }
        : { origem: "quiz", pedido: pedido.tabela === "area_quiz_pedidos" ? pedido.tipo : "sinastria" },
  });
  return { ok: true, sessao, caminho: caminhoPublicoDaArea(org.slug, org.config.apelido) };
}
