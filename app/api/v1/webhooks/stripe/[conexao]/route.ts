/**
 * O AVISO DE PAGAMENTO DA STRIPE — o Pix gerado na conversa foi pago.
 *
 * Autenticação: o `[conexao]` do endereço escolhe a conexão (e, por ela, a organização — nunca o corpo), e a
 * assinatura `Stripe-Signature` é conferida com o segredo guardado daquela conexão. Sem assinatura válida,
 * nada é lido do corpo.
 *
 * O efeito é o MESMO de uma compra aprovada no checkout (`aplicarEventoDaCakto`): marca o contato como pago,
 * grava o valor no negócio, tira a pessoa das retomadas e inicia o fluxo de entrega do produto. A diferença é
 * só quem é a pessoa: aqui ela vem do `metadata.contact_id` que o turno gravou ao criar a cobrança, e não de um
 * telefone digitado num checkout.
 *
 * Moeda: a cobrança de quem escreve de fora do país é em euro ou dólar (`lib/preco/preco-internacional.ts`). O
 * negócio, a receita e a conversão enviada ao anúncio são na moeda da conta, então o valor que entra é o que a
 * Stripe converteu (`lerValorConvertido`). Se a conversão não puder ser lida, a compra é aplicada do mesmo jeito
 * — a entrega não espera câmbio — e a receita fica registrada na moeda original, sem valor no negócio.
 *
 * Cobrança avulsa (`lib/preco/extras.ts`): a cobrança que traz `metadata.extra` NÃO é a compra do produto
 * principal. Ela só entra no livro de receita, com o nome do extra, e marca o contato com `extra:<nome>` — sem
 * `pago`, sem valor no negócio e sem fluxo de entrega. É o turno seguinte do agente que lê esse pagamento.
 *
 * Idempotência: a Stripe reentrega. A marca `compra:<id da cobrança>` no contato e a chave única do ledger
 * fazem a segunda entrega não repetir nada.
 */
import { type NextRequest, type NextResponse } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { aplicarAvisoDePagamentoDaStripe, eventoDaStripeSchema } from "@/lib/pagamentos/aviso-de-pagamento-da-stripe";
import { lerConexaoStripePorId } from "@/lib/pagamentos/conexao-stripe";
import { assinaturaDaStripeConfere } from "@/lib/pagamentos/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ conexao: string }> }): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const { conexao: conexaoId } = await ctx.params;
  if (!UUID.test(conexaoId)) return fail("not_found", "Endereço desconhecido.", 404, { requestId }) as NextResponse;

  const corpoCru = await req.text();
  const admin = createAdminClient();
  const conexao = await lerConexaoStripePorId(admin, conexaoId);
  if (!conexao?.segredoDoAviso) return fail("not_found", "Endereço desconhecido.", 404, { requestId }) as NextResponse;
  if (!assinaturaDaStripeConfere(corpoCru, req.headers.get("stripe-signature"), conexao.segredoDoAviso, new Date())) {
    return fail("unauthorized", "Assinatura inválida.", 401, { requestId }) as NextResponse;
  }

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;
  }
  const parsed = eventoDaStripeSchema.safeParse(corpo);
  if (!parsed.success) return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;
  return aplicarAvisoDePagamentoDaStripe(admin, conexao, parsed.data, requestId);
}
