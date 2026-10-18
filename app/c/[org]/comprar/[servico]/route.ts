/**
 * GET /c/[org]/comprar/[servico] — o clique em "Comprar" da vitrine.
 *
 * Registra o clique (é a etapa "clicou em comprar" do funil) e manda para o pagamento.
 *
 * Com a Stripe conectada, a compra é DIRETA: cria aqui o link de pagamento da pessoa, com quem ela é e o
 * nome do serviço nos metadados, e o aviso de pagamento da Stripe faz o resto como numa compra da conversa —
 * marca como pago, registra a receita e inicia o fluxo de entrega cujo produto tem o mesmo nome do serviço
 * (`escolherFluxoDeEntrega`). Pedido do dono em 18/10/2026: quem está na área compra ali mesmo e só fala com
 * a agente quando quiser. Antes disso o botão levava ao `link_checkout`, que na prática era o WhatsApp — toda
 * compra virava conversa.
 *
 * Sem Stripe conectada, ou se a Stripe falhar, segue para o `link_checkout` como sempre: o botão nunca morre.
 */
import { NextResponse, type NextRequest } from "next/server";

import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea, irPara } from "@/lib/area-do-cliente/http";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { logger } from "@/lib/logger";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { criarClienteStripe } from "@/lib/pagamentos/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; servico: string }> };

type Servico = { id: string; nome: string; preco_cents: number; currency: string; link_checkout: string };

function ir(url: string): Response {
  const resposta = NextResponse.redirect(url, 303);
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, servico } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  const voltar = irPara(caminhoDaArea(org.slug));
  if (!sessao || !UUID.test(servico)) return voltar;

  const { data } = await admin
    .from("area_servicos")
    .select("id, nome, preco_cents, currency, link_checkout")
    .eq("id", servico)
    .eq("organization_id", org.id)
    .eq("ativo", true)
    .maybeSingle();
  const s = data as Servico | null;
  if (!s) return voltar;

  const conexao = await lerConexaoStripe(admin, org.id);
  let destino = s.link_checkout;
  let via: "stripe" | "link" = "link";
  if (conexao) {
    try {
      // A referência repete dentro da mesma hora: tocar duas vezes devolve o MESMO link, não dois.
      const hora = `${diaNoFuso(new Date().toISOString(), org.fuso)}-${new Date().getUTCHours()}`;
      const link = await criarClienteStripe(conexao).criarLinkDePagamento({
        valorCentavos: s.preco_cents,
        moeda: s.currency,
        descricao: s.nome,
        referencia: `area-servico-${sessao.contactId}-${s.id}-${hora}`,
        // `produto` é o que escolhe o fluxo de entrega e liga a compra ao serviço no painel; sem `extra`, é
        // tratada como compra principal.
        metadados: { organization_id: org.id, contact_id: sessao.contactId, produto: s.nome, origem: "area" },
        mensagemDepoisDePagar: "Pagamento confirmado! O seu trabalho já foi recebido e começa em seguida. Volte para a sua área para acompanhar.",
      });
      destino = link.url;
      via = "stripe";
    } catch (err) {
      logger.error("[area.comprar] link de pagamento não criado; seguindo para o link do serviço", {
        organization_id: org.id,
        servico_id: s.id,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }

  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "checkout_clicado",
    sessaoId: sessao.sessaoId,
    servicoId: s.id,
    props: { via },
  });
  return ir(destino);
}
