/**
 * A LEITURA PAGA DO QUIZ (`area_quiz_pedidos`, 0943) — escrita pela IA uma vez e entregue em dois lugares: na página
 * do quiz (pelo segredo do pedido) e DENTRO da área, em "Suas leituras" (pela sessão de quem pagou). Os dois caminhos
 * chamam `escreverLeituraDoQuiz`, então a leitura é a mesma onde quer que ela abra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { gerarQuiz } from "@/lib/area-do-cliente/circulo-ia";
import { previaDoQuiz, type TipoDeQuiz } from "@/lib/area-do-cliente/quizzes";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { idiomaDaAreaOuPortugues } from "@/lib/i18n/area-servidor";

/** O nome do produto (o mesmo do link de pagamento e do recibo). */
export const NOME_DO_QUIZ: Record<TipoDeQuiz, string> = {
  prosperidade: "Seu Mapa da Prosperidade",
  caminhos: "Seu Ritual de Abertura de Caminhos",
  par: "O Retrato do Par",
  sombra: "O Código da Sombra",
};

export interface PedidoDoQuiz {
  id: string;
  contact_id: string;
  tipo: TipoDeQuiz;
  nome: string;
  nascimento: string | null;
  respostas: Record<string, string> | null;
  pago_at: string | null;
  texto: string | null;
}

export const CAMPOS_DO_PEDIDO = "id, contact_id, tipo, nome, nascimento, respostas, pago_at, texto";

/** Escreve e grava a leitura de um pedido pago e ainda sem texto. `null` = a IA não respondeu (tente de novo). */
export async function escreverLeituraDoQuiz(admin: SupabaseClient, org: { id: string; titulo: string }, pedido: PedidoDoQuiz): Promise<string | null> {
  const previa = previaDoQuiz(pedido.tipo, { nascimento: pedido.nascimento, respostas: pedido.respostas ?? {}, nome: pedido.nome });
  if (!previa) return null;
  try {
    const gerado = await gerarQuiz(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: pedido.contact_id,
      empresa: org.titulo,
      idioma: await idiomaDaAreaOuPortugues(),
      tipo: pedido.tipo,
      nome: pedido.nome,
      titulo: previa.titulo,
      detalhe: previa.detalhe,
      fato: previa.fato,
      respostas: pedido.respostas ?? {},
    });
    if (!gerado) return null;
    const { data: gravado, error } = await admin
      .from("area_quiz_pedidos")
      .update({ texto: gerado.texto, modelo: gerado.modelo })
      .eq("id", pedido.id)
      .eq("organization_id", org.id)
      .is("texto", null)
      .select("texto");
    if (error) throw new Error(error.message);
    if ((gravado ?? []).length > 0) return gerado.texto;
    // Outra aba escreveu primeiro: vale o texto que ficou gravado, para as duas mostrarem a mesma leitura.
    const { data: atual } = await admin.from("area_quiz_pedidos").select("texto").eq("id", pedido.id).eq("organization_id", org.id).maybeSingle();
    return (atual as { texto: string | null } | null)?.texto ?? gerado.texto;
  } catch (err) {
    logger.error("[area.quiz] leitura não gerada", {
      organization_id: org.id,
      quiz: pedido.tipo,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return null;
  }
}

export interface LeituraDoQuizNaArea {
  id: string;
  tipo: TipoDeQuiz;
  titulo: string;
  texto: string | null;
  quando: string;
}

/** As leituras de quiz que ela pagou, da mais nova para a mais antiga (para "Suas leituras" na área). */
export async function leiturasDosQuizzes(admin: SupabaseClient, organizationId: string, contactId: string): Promise<LeituraDoQuizNaArea[]> {
  const { data, error } = await admin
    .from("area_quiz_pedidos")
    .select("id, tipo, texto, pago_at")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .not("pago_at", "is", null)
    .order("pago_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; tipo: TipoDeQuiz; texto: string | null; pago_at: string }[])
    .filter((p) => p.tipo in NOME_DO_QUIZ)
    .map((p) => ({ id: p.id, tipo: p.tipo, titulo: NOME_DO_QUIZ[p.tipo], texto: p.texto, quando: p.pago_at }));
}
