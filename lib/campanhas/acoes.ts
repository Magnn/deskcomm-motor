/**
 * As AÇÕES da campanha — preparar, iniciar, agendar, pausar, retomar, cancelar,
 * duplicar e testar.
 *
 * Moram aqui, e não em oito rotas, porque as oito fazem a mesma coisa em volta:
 * carregar a campanha da organização certa, perguntar à máquina de estados se a
 * transição vale, escrever, auditar. Espalhado, esse "em volta" diverge — e o
 * dia em que uma rota esquecer de conferir o estado é o dia em que uma campanha
 * cancelada volta a enviar.
 *
 * Cada função devolve `{ ok: false, codigo, mensagem, status }` em vez de lançar:
 * a rota traduz para `fail()` sem interpretar exceção, e o motivo chega ao
 * operador com o texto real (Regra nº 1).
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ApiErrorCode } from "@/lib/api/errors";
import { beginServiceAtOrigin } from "@/lib/atendimento/origem";
import { capabilitiesOf, transportaMensagem, type ChannelProvider } from "@/lib/channels/capabilities";

import { enderecoDoCanal } from "@/lib/channels/endereco-de-campanha";
import { baseLegalValida, motivoParaExcluir, POR_TELEFONE, recusouMarketing, type ModoDeEndereco } from "./elegibilidade";
import { FILTRO_VAZIO } from "./audiencia";
import { ehStatusDaCampanha, podeTransitar } from "./maquina-de-estados";
import { prepararCampanha } from "./preparacao";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { renderizar } from "./renderizador";
import { COLUNAS_DE_CONTEUDO, lerConteudo, textoComVariaveis, tipoDoConteudo } from "./conteudo";
import { despacharConteudo } from "./despacho";
import { lerPoolExtra } from "./pool-de-numeros";
import { poolDaCampanha } from "./rodizio";
import type { StatusDaCampanha } from "./tipos";

export interface CampanhaCarregada {
  id: string;
  organization_id: string;
  name: string;
  status: StatusDaCampanha;
  channel_session_id: string;
  message_body: string | null;
  content_kind: string | null;
  template_name: string | null;
  template_language: string | null;
  template_values: unknown;
  flow_pointer_id: string | null;
  base_legal: string;
  lia_ref: string | null;
  audience_filter: unknown;
  audience_version: number;
  content_version: number;
  scheduled_at: string | null;
  intervalo_segundos: number | null;
  janela_inicio_hora: number | null;
  janela_fim_hora: number | null;
  teto_diario: number | null;
  teto_horario: number | null;
  description: string | null;
}

export type Recusa = { ok: false; codigo: ApiErrorCode; mensagem: string; status: number };
export type Desfecho<T = unknown> = ({ ok: true } & T) | Recusa;

const COLUNAS =
  "id, organization_id, name, status, channel_session_id, message_body, base_legal, lia_ref, " +
  "audience_filter, audience_version, content_version, scheduled_at, description, " +
  `${COLUNAS_DE_CONTEUDO}, ` +
  "intervalo_segundos, janela_inicio_hora, janela_fim_hora, teto_diario, teto_horario";

export async function carregarCampanha(
  admin: SupabaseClient,
  organizationId: string,
  campanhaId: string,
): Promise<Desfecho<{ campanha: CampanhaCarregada }>> {
  const { data } = await admin
    .from("campaigns")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("id", campanhaId)
    .maybeSingle();
  if (!data) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Campanha não encontrada.",
      status: 404,
    };
  }
  const campanha = data as unknown as CampanhaCarregada;
  if (!ehStatusDaCampanha(campanha.status)) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: `A campanha está num estado que este sistema não conhece ("${campanha.status}").`,
      status: 409,
    };
  }
  return { ok: true, campanha };
}

function recusaDeTransicao(de: StatusDaCampanha, para: StatusDaCampanha): Recusa | null {
  const r = podeTransitar(de, para);
  return r.pode ? null : { ok: false, codigo: "campanha_estado_invalido", mensagem: r.motivo, status: 409 };
}

/** O que toda campanha precisa ter antes de qualquer envio — inclusive o de teste. */
function faltaParaEnviar(c: CampanhaCarregada): Recusa | null {
  const conteudo = lerConteudo(c);
  if (!conteudo.ok) {
    return { ok: false, codigo: "campanha_conteudo_invalido", mensagem: conteudo.falta, status: 422 };
  }
  if (!baseLegalValida({ baseLegal: c.base_legal, liaRef: c.lia_ref })) {
    return {
      ok: false,
      codigo: "campanha_base_legal_invalida",
      mensagem:
        "Interesse legítimo exige a referência da avaliação (LIA). Sem ela não há como responder " +
        "a quem perguntar com base em quê recebeu a mensagem.",
      status: 422,
    };
  }
  return null;
}

function textoDoConteudo(c: CampanhaCarregada): string {
  const lido = lerConteudo(c);
  return lido.ok ? textoComVariaveis(lido.conteudo) : "";
}

/**
 * Como o número principal desta campanha acha as pessoas — pelo telefone, ou
 * pela conversa que cada uma começou (canal por conversa).
 *
 * Canal por conversa que só deixa responder dentro da janela de 24h da
 * plataforma é RECUSADO: uma campanha ali alcançaria só quem escreveu no último
 * dia e falharia em todo o resto, pessoa por pessoa, depois de já ter começado.
 */
async function modoDaCampanha(admin: SupabaseClient, c: CampanhaCarregada): Promise<{ ok: true; modo: ModoDeEndereco } | Recusa> {
  const endereco = await enderecoDoCanal(admin, c.organization_id, c.channel_session_id);
  if (!endereco) {
    return { ok: false, codigo: "campanha_canal_indisponivel", mensagem: "O canal escolhido para esta campanha não está disponível.", status: 409 };
  }
  if (endereco.tipo === "telefone") return { ok: true, modo: POR_TELEFONE };
  if (!endereco.semJanela) {
    return {
      ok: false,
      codigo: "campanha_canal_indisponivel",
      mensagem:
        "Este canal só deixa responder até 24 horas depois da última mensagem da pessoa, então não serve para campanha. " +
        "Use um número de WhatsApp ou um bot do Telegram.",
      status: 422,
    };
  }
  return { ok: true, modo: { tipo: "conversa", prefixo: endereco.prefixo } };
}

/**
 * O número escolhido sabe mandar ESTE conteúdo? Modelo aprovado só existe em
 * canal que trabalha com modelo (o oficial); mandá-lo por um número de QR code
 * falharia destinatário por destinatário, depois de a campanha já ter começado.
 * A pergunta é feita à CAPACIDADE do canal, nunca ao nome do provedor.
 */
async function canalNaoServeAoConteudo(admin: SupabaseClient, c: CampanhaCarregada): Promise<Recusa | null> {
  if (tipoDoConteudo(c) !== "template") return null;
  const numeros = poolDaCampanha(c.channel_session_id, await lerPoolExtra(admin, c.organization_id, c.id));
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, provider, display_name")
    .eq("organization_id", c.organization_id)
    .in("id", numeros);
  if (error) {
    return { ok: false, codigo: "campanha_canal_indisponivel", mensagem: "Não foi possível conferir os números desta campanha.", status: 500 };
  }
  const semModelo = ((data ?? []) as { id: string; provider: string | null; display_name: string | null }[]).filter(
    (n) => !transportaMensagem(n.provider) || !capabilitiesOf(n.provider as ChannelProvider).requiresTemplates,
  );
  if (semModelo.length === 0) return null;
  // O apelido é o da CONEXÃO (`channel_sessions`), não o de um contato.
  const apelidos = semModelo.map((n) => apelidoDoNumero(n.display_name));
  return {
    ok: false,
    codigo: "campanha_conteudo_invalido",
    mensagem:
      "Modelo aprovado só é enviado por número da API oficial do WhatsApp. " +
      `Tire da campanha: ${apelidos.join(", ")} — ou troque o conteúdo para texto ou fluxo.`,
    status: 422,
  };
}

function apelidoDoNumero(apelido: string | null): string {
  return apelido?.trim() ? apelido.trim() : "número sem nome";
}

/** Já saiu alguma mensagem desta campanha? Reconstruir snapshot depois disso é proibido. */
async function jaEnviou(admin: SupabaseClient, campanhaId: string): Promise<boolean> {
  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campanhaId)
    .not("sent_at", "is", null);
  return (count ?? 0) > 0;
}

export async function prepararAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ resumo: { total: number; elegiveis: number; excluidos: number } }>> {
  const recusa = recusaDeTransicao(c.status, "preparing") ?? faltaParaEnviar(c) ?? (await canalNaoServeAoConteudo(admin, c));
  if (recusa) return recusa;
  const endereco = await modoDaCampanha(admin, c);
  if (!endereco.ok) return endereco;
  if (await jaEnviou(admin, c.id)) {
    return {
      ok: false,
      codigo: "campanha_nao_editavel",
      mensagem: "Esta campanha já enviou mensagens; refazer a lista mudaria o que já foi dito.",
      status: 409,
    };
  }

  // Compare-and-set: dois cliques simultâneos, e só um entra em `preparing`.
  const { data: entrou } = await admin
    .from("campaigns")
    .update({ status: "preparing" })
    .eq("id", c.id)
    .eq("status", "draft")
    .select("id");
  if ((entrou ?? []).length === 0) {
    return {
      ok: false,
      codigo: "campanha_preparando",
      mensagem: "A preparação desta campanha já está em andamento.",
      status: 409,
    };
  }

  try {
    const resumo = await prepararCampanha(admin, {
      campanhaId: c.id,
      organizationId: c.organization_id,
      filtro: c.audience_filter,
      // O texto em que as variáveis aparecem: o corpo, ou os valores do modelo.
      // No fluxo não há variável da campanha — ninguém é excluído por "falta o nome".
      corpo: textoDoConteudo(c),
      contentVersion: c.content_version,
      agora,
      modo: endereco.modo,
    });
    if (resumo.total === 0) {
      await voltarAoRascunho(admin, c.id, "audiencia_vazia");
      return {
        ok: false,
        codigo: "campanha_sem_audiencia",
        mensagem: "O recorte não encontrou nenhum contato. Ajuste o filtro.",
        status: 422,
      };
    }
    if (resumo.elegiveis === 0) {
      await voltarAoRascunho(admin, c.id, "sem_elegiveis");
      return {
        ok: false,
        codigo: "campanha_sem_elegiveis",
        mensagem:
          "O recorte encontrou contatos, mas nenhum pode receber — veja os motivos na prévia.",
        status: 422,
      };
    }

    await admin
      .from("campaigns")
      .update({
        status: "ready",
        prepared_at: agora.toISOString(),
        snapshot_total: resumo.total,
        snapshot_eligible: resumo.elegiveis,
        snapshot_excluded: resumo.excluidos,
        audience_version: c.audience_version + 1,
      })
      .eq("id", c.id)
      .eq("status", "preparing");

    return { ok: true, resumo };
  } catch (err) {
    // A campanha não pode ficar presa em `preparing`: quem tentou preparar
    // precisa poder corrigir o filtro e tentar de novo.
    await voltarAoRascunho(admin, c.id, "erro_na_preparacao");
    return {
      ok: false,
      codigo: "campanha_sem_audiencia",
      mensagem: err instanceof Error ? err.message : String(err),
      status: 422,
    };
  }
}

async function voltarAoRascunho(admin: SupabaseClient, id: string, codigo: string): Promise<void> {
  await admin
    .from("campaigns")
    .update({ status: "draft", failure_code: codigo })
    .eq("id", id)
    .eq("status", "preparing");
}

export async function iniciarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ retomada: boolean }>> {
  const recusa = recusaDeTransicao(c.status, "running") ?? faltaParaEnviar(c);
  if (recusa) return recusa;

  const { count } = await admin
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", c.id)
    .eq("eligibility_status", "eligible");
  if ((count ?? 0) === 0) {
    return {
      ok: false,
      codigo: "campanha_sem_elegiveis",
      mensagem: "Nenhum destinatário elegível. Prepare a campanha antes de iniciar.",
      status: 422,
    };
  }

  const retomada = c.status === "paused";
  const { data } = await admin
    .from("campaigns")
    .update({
      status: "running",
      started_at: agora.toISOString(),
      paused_at: null,
      scheduled_at: null,
    })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true, retomada };
}

export async function agendarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  quando: Date,
  agora: Date,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "scheduled") ?? faltaParaEnviar(c);
  if (recusa) return recusa;
  if (quando.getTime() <= agora.getTime()) {
    return {
      ok: false,
      codigo: "campanha_agenda_invalida",
      mensagem: "Escolha uma data no futuro — para enviar agora, use Iniciar.",
      status: 422,
    };
  }
  const { data } = await admin
    .from("campaigns")
    .update({ status: "scheduled", scheduled_at: quando.toISOString(), paused_at: null })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  return { ok: true };
}

export async function pausarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho> {
  const recusa = recusaDeTransicao(c.status, "paused");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    .update({ status: "paused", paused_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();
  // Quem já estava `sending` NÃO é desfeito: a mensagem pode estar na borda
  // externa neste instante, e prometer cancelamento do que já saiu é mentir.
  return { ok: true };
}

export async function cancelarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  agora: Date,
): Promise<Desfecho<{ cancelados: number }>> {
  const recusa = recusaDeTransicao(c.status, "cancelled");
  if (recusa) return recusa;
  const { data } = await admin
    .from("campaigns")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("id", c.id)
    .eq("status", c.status)
    .select("id");
  if ((data ?? []).length === 0) return conflitoDeCorrida();

  // A campanha já está cancelada quando esta linha roda: a rodada não escolhe
  // mais esta campanha, então não há corrida com o worker por estes pendentes.
  const { data: cancelados } = await admin
    .from("campaign_recipients")
    .update({ status: "cancelled", cancelled_at: agora.toISOString() })
    .eq("campaign_id", c.id)
    .in("status", ["pending", "queued"])
    .select("id");
  return { ok: true, cancelados: (cancelados ?? []).length };
}

export async function duplicarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
): Promise<Desfecho<{ id: string }>> {
  return copiarCampanha(admin, c, autorId, { nome: `${c.name} (cópia)`, filtro: c.audience_filter });
}

/** Quantas pessoas um reenvio leva de uma vez — o teto de "incluir à mão" do filtro. */
export const TETO_DO_REENVIO = 5000;

/**
 * REENVIAR PARA QUEM FALHOU: um RASCUNHO novo, com o mesmo conteúdo, só para as
 * pessoas em que o envio desta campanha falhou.
 *
 * Rascunho, e não disparo imediato: a pessoa confere a lista, prepara e inicia
 * como em qualquer campanha — e os vetos (opt-out, recusa de marketing, lista de
 * exclusão) são revalidados na preparação. Quem falhou porque pediu para parar
 * nesse meio-tempo não recebe.
 *
 * Só `failed`: "pulado" e "pediu para parar" não são falha de envio, e mandar
 * de novo para eles seria furar justamente o que os tirou da lista.
 */
export async function reenviarFalhasAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
): Promise<Desfecho<{ id: string; pessoas: number }>> {
  const { data, error } = await admin
    .from("campaign_recipients")
    .select("contact_id")
    .eq("organization_id", c.organization_id)
    .eq("campaign_id", c.id)
    .eq("status", "failed")
    .limit(TETO_DO_REENVIO);
  if (error) {
    return { ok: false, codigo: "campanha_estado_invalido", mensagem: "Não foi possível ler quem falhou nesta campanha.", status: 500 };
  }
  const contatos = [...new Set(((data ?? []) as { contact_id: string | null }[]).map((l) => l.contact_id).filter((id): id is string => !!id))];
  if (contatos.length === 0) {
    return { ok: false, codigo: "campanha_sem_audiencia", mensagem: "Nenhum envio desta campanha falhou — não há a quem reenviar.", status: 422 };
  }
  const copia = await copiarCampanha(admin, c, autorId, {
    nome: `${c.name} (reenvio)`,
    // Só a lista: sem recorte, a consulta de público não traz mais ninguém.
    filtro: { ...FILTRO_VAZIO, incluir_contatos: contatos, limite: Math.max(1, contatos.length) },
  });
  return copia.ok ? { ok: true, id: copia.id, pessoas: contatos.length } : copia;
}

async function copiarCampanha(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  autorId: string,
  nova: { nome: string; filtro: unknown },
): Promise<Desfecho<{ id: string }>> {
  const { data, error } = await admin
    .from("campaigns")
    .insert({
      organization_id: c.organization_id,
      name: nova.nome.slice(0, 160),
      description: c.description,
      channel_session_id: c.channel_session_id,
      message_body: c.message_body,
      content_kind: tipoDoConteudo(c),
      template_name: c.template_name,
      template_language: c.template_language,
      template_values: c.template_values ?? {},
      flow_pointer_id: c.flow_pointer_id,
      base_legal: c.base_legal,
      lia_ref: c.lia_ref,
      audience_filter: nova.filtro,
      intervalo_segundos: c.intervalo_segundos,
      janela_inicio_hora: c.janela_inicio_hora,
      janela_fim_hora: c.janela_fim_hora,
      teto_diario: c.teto_diario,
      teto_horario: c.teto_horario,
      created_by: autorId,
      // Nada de destinatário, resultado, agenda ou carimbo de execução: a cópia
      // é uma INTENÇÃO nova, e herdar números faria a tela mostrar entrega de
      // mensagem que esta campanha nunca mandou.
    })
    .select("id")
    .single();
  if (error || !data) {
    return {
      ok: false,
      codigo: "campanha_estado_invalido",
      mensagem: error?.message ?? "Não foi possível duplicar a campanha.",
      status: 422,
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * O teste: a MESMA conexão, o MESMO renderizador, a MESMA camada de envio.
 *
 * Um teste que passasse por outro caminho provaria o outro caminho. E ele não
 * toca nos contadores da execução oficial — não cria destinatário, não gasta
 * fila —, mas gasta o ritmo do número, porque para o WhatsApp é uma mensagem
 * como qualquer outra.
 */
export async function testarAcao(
  admin: SupabaseClient,
  c: CampanhaCarregada,
  contactId: string,
  agora: Date,
  fuso: string,
): Promise<Desfecho<{ status: string }>> {
  const recusa = faltaParaEnviar(c) ?? (await canalNaoServeAoConteudo(admin, c));
  if (recusa) return recusa;
  const endereco = await modoDaCampanha(admin, c);
  if (!endereco.ok) return endereco;

  const { data: contato } = await admin
    .from("contacts")
    .select("id, name, display_name, phone_number, social_identity, is_blocked, is_anonymized, consent")
    .eq("organization_id", c.organization_id)
    .eq("id", contactId)
    .maybeSingle();
  if (!contato) {
    return {
      ok: false,
      codigo: "campanha_nao_encontrada",
      mensagem: "Contato de teste não encontrado nesta organização.",
      status: 404,
    };
  }
  const linha = contato as {
    id: string;
    name: string | null;
    display_name: string | null;
    phone_number: string | null;
    social_identity: string | null;
    is_blocked: boolean;
    is_anonymized: boolean;
    consent: unknown;
  };

  // O teste respeita os MESMOS vetos: mandar teste para quem pediu para parar
  // seria furar o opt-out pela porta dos fundos.
  const motivo = motivoParaExcluir({
    contactId: linha.id,
    telefone: linha.phone_number,
    identidadeSocial: linha.social_identity,
    bloqueado: linha.is_blocked,
    anonimizado: linha.is_anonymized,
    recusouMarketing: recusouMarketing(linha.consent),
  }, endereco.modo);
  if (motivo) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: `Este contato não pode receber: ${motivo}.`,
      status: 422,
    };
  }

  const render = renderizar(
    textoDoConteudo(c),
    { nome: nomeDoContato(linha) },
    { agora, fuso },
  );
  if (render.faltando.length > 0) {
    return {
      ok: false,
      codigo: "campanha_conteudo_invalido",
      mensagem: `Falta ${render.faltando.join(", ")} no cadastro deste contato — escolha outro para o teste.`,
      status: 422,
    };
  }

  const boundary = await beginServiceAtOrigin(admin, c.organization_id, linha.id, c.channel_session_id);
  const lido = lerConteudo(c);
  if (!lido.ok) return { ok: false, codigo: "campanha_conteudo_invalido", mensagem: lido.falta, status: 422 };
  // O MESMO despacho da rodada: o teste que sai por outro caminho é o que passa
  // e deixa o disparo falhar.
  const desfecho = await despacharConteudo(admin, {
    organizationId: c.organization_id,
    contactId: linha.id,
    boundary,
    conteudo: lido.conteudo,
    renderizar: (texto) => renderizar(texto, { nome: nomeDoContato(linha) }, { agora, fuso }).texto,
    previaDoModelo: c.message_body,
    ator: `campaign-test:${c.id}`,
    requestId: `campaign-test:${c.id}:${randomUUID()}`,
    metadata: { source: "campaign_test", campaign_id: c.id },
  });

  if (desfecho.via === "fluxo") {
    if (desfecho.falhou) {
      return {
        ok: false,
        codigo: "campanha_conteudo_invalido",
        mensagem: `O fluxo não aceitou este contato: ${desfecho.motivo ?? "motivo não informado"}.`,
        status: 422,
      };
    }
    return { ok: true, status: "fluxo_iniciado" };
  }

  const status = desfecho.status;
  if (desfecho.falhou) {
    return {
      ok: false,
      codigo: "campanha_canal_indisponivel",
      mensagem: "O envio de teste falhou no canal. Verifique a conexão antes de iniciar a campanha.",
      status: 409,
    };
  }
  return { ok: true, status };
}

function conflitoDeCorrida(): Recusa {
  return {
    ok: false,
    codigo: "campanha_estado_invalido",
    mensagem: "O estado da campanha mudou enquanto esta ação era processada. Recarregue a tela.",
    status: 409,
  };
}
