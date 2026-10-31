/**
 * O RETORNO COMBINADO SOBREVIVE À PASSAGEM PARA UMA PESSOA.
 *
 * A passagem desliga os retornos do contato, e isso está certo: enquanto há gente na conversa, nada
 * automático fala com o cliente. O defeito era o que vinha depois. Medido em 31/10/2026: retornos de
 * restante com data futura foram desligados sem motivo gravado, a conversa voltou ao agente, e o combinado
 * tinha sumido. Agora o desligamento grava `cancel_reason`, e devolver o atendimento religa o que ainda
 * tem data pela frente.
 *
 * Quem falou em tirar a própria vida nunca volta a ser cobrado por automático. Se a leitura das passagens
 * falhar, nada é religado: a dúvida fica do lado de não cobrar.
 *
 * Religar não dá licença para falar com quem sumiu: o retorno religado só sai se a pessoa escreveu nas
 * últimas 24 h. Fora disso ele é descartado na hora marcada, e ela é atendida quando escrever. O restante
 * continua valendo nesse atendimento, porque `buscaRestanteCombinado` lê o retorno que não foi cancelado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { passagemDeRisco, type PassagemEmAberto } from "@/lib/escalacao/alerta-de-risco";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export const MOTIVO_DA_PASSAGEM = "passagem_para_humano";

/** Só os três campos de texto importam para reconhecer o risco. */
export type TextoDaPassagem = Pick<PassagemEmAberto, "content" | "title" | "notes">;

export const temPassagemDeRisco = (passagens: readonly TextoDaPassagem[]): boolean =>
  passagens.some((p) => passagemDeRisco(p));

export async function religarRetornosDaPassagem(
  admin: SupabaseClient,
  organizationId: string,
  contactId: string,
  agora: Date = new Date(),
): Promise<number> {
  const { data: passagens, error } = await admin
    .from("passagens_de_atendimento")
    .select("content, title, notes")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId);
  if (error) throw new Error(error.message);
  if (temPassagemDeRisco((passagens ?? []) as TextoDaPassagem[])) return 0;

  const { data: desligados, error: erroDaLeitura } = await admin
    .from("cron_jobs")
    .select("id, payload")
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .eq("kind", "at")
    .eq("job_kind", "followup_turn")
    .eq("cancel_reason", MOTIVO_DA_PASSAGEM)
    .gt("next_run_at", agora.toISOString());
  if (erroDaLeitura) throw new Error(erroDaLeitura.message);

  let religados = 0;
  for (const r of (desligados ?? []) as { id: string; payload: Record<string, unknown> | null }[]) {
    const { error: erroDoUpdate } = await admin
      .from("cron_jobs")
      .update({
        enabled: true,
        cancelled_at: null,
        cancel_reason: null,
        payload: { ...(r.payload ?? {}), so_dentro_da_janela: true },
        updated_at: agora.toISOString(),
      })
      .eq("organization_id", organizationId)
      .eq("id", r.id);
    if (erroDoUpdate) throw new Error(erroDoUpdate.message);
    religados++;
  }
  return religados;
}

const JANELA_MS = 24 * 60 * 60 * 1000;

/** A pessoa escreveu nas últimas 24 h? Sem nenhuma mensagem dela, não. */
export function dentroDaJanela(ultimaEntrada: Date | null, agora: Date): boolean {
  return ultimaEntrada !== null && agora.getTime() - ultimaEntrada.getTime() < JANELA_MS;
}

/** A linha que conta à pessoa que assume o que estava combinado. Só algarismos na data: não depende de idioma. */
export function linhaDoRetornoNaPassagem(promessa: string, quandoIso: string, idioma: Idioma): string {
  const [ano, mes, dia] = quandoIso.slice(0, 10).split("-");
  const texto = promessa.replace(/\s+/g, " ").trim().slice(0, 200);
  return `${traduzir("Retorno que estava marcado", idioma)} (${dia}/${mes}/${ano}): ${texto}`;
}
