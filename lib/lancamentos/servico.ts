/**
 * LANÇAMENTOS EM GRUPOS — o que conversa com o banco e com o WhatsApp.
 *
 * As decisões (qual grupo, quando abrir outro, como nomear) são de `regras.ts`,
 * puras. Aqui fica a orquestração: criar o lançamento com o primeiro grupo, abrir
 * o próximo, manter a contagem em dia e resolver o link público.
 *
 * Tudo roda com o cliente de serviço e filtra `organization_id` à mão — as
 * tabelas são deny-all (migration 0909). O WhatsApp entra por uma interface
 * mínima (`WhatsappDeGrupos`), para a orquestração ser testável sem rede.
 */
import { randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { lerSessaoDeGrupos } from "@/lib/channels/numeros-para-grupos";
import { logger } from "@/lib/logger";

import {
  grupoComVaga,
  linkDoConvite,
  nomeDoGrupo,
  precisaAbrirOutroGrupo,
  slugDoNome,
  statusPelaContagem,
  telefoneSoDigitos,
  type GrupoParaVaga,
  type StatusDoGrupo,
  type StatusDoLancamento,
} from "./regras";
import type { CriarLancamentoInput } from "./schemas";

type Admin = SupabaseClient;

/** O pedaço do cliente do WhatsApp que os grupos usam. */
export interface WhatsappDeGrupos {
  createGroup(session: string, nome: string, participantes: string[]): Promise<{ id: string }>;
  getGroupInfo(session: string, groupId: string): Promise<{ membros: number; nome: string | null }>;
  getGroupInviteCode(session: string, groupId: string): Promise<string>;
  setGroupDescription(session: string, groupId: string, descricao: string): Promise<void>;
  setGroupAdminsOnly(session: string, groupId: string, somenteAdmins: boolean): Promise<void>;
}

export interface Lancamento {
  id: string;
  organization_id: string;
  channel_session_id: string;
  name: string;
  slug: string;
  group_name_template: string;
  group_description: string | null;
  group_capacity: number;
  admins_only: boolean;
  seed_participant: string;
  status: StatusDoLancamento;
  created_at: string;
}

export interface GrupoDoLancamento {
  id: string;
  launch_id: string;
  position: number;
  wa_group_id: string;
  name: string;
  invite_url: string | null;
  members_count: number;
  members_checked_at: string | null;
  status: StatusDoGrupo;
}

const COLUNAS_DO_LANCAMENTO =
  "id, organization_id, channel_session_id, name, slug, group_name_template, group_description, group_capacity, admins_only, seed_participant, status, created_at";
const COLUNAS_DO_GRUPO =
  "id, launch_id, position, wa_group_id, name, invite_url, members_count, members_checked_at, status";

/** Grupo que ainda está NASCENDO: a linha reserva a posição antes de o WhatsApp criar o grupo. */
const PREFIXO_DE_RESERVA = "reserva:";
export const grupoEhReserva = (g: Pick<GrupoDoLancamento, "wa_group_id">) => g.wa_group_id.startsWith(PREFIXO_DE_RESERVA);

/** Depois de quanto tempo uma reserva sem grupo é considerada esquecida. Criar um grupo leva segundos. */
const RESERVA_ESQUECIDA_MS = 5 * 60_000;

/** De quanto em quanto tempo a contagem de um grupo é relida no caminho do link. */
export const VALIDADE_DA_CONTAGEM_MS = 45_000;

export class LancamentoError extends Error {
  constructor(
    public readonly code:
      | "numero_invalido"
      | "numero_desconectado"
      | "participante_invalido"
      | "grupo_nao_criado"
      | "nao_encontrado",
    message: string,
  ) {
    super(message);
  }
}

const paraVaga = (g: GrupoDoLancamento): GrupoParaVaga => ({
  id: g.id,
  position: g.position,
  status: g.status,
  membersCount: g.members_count,
  inviteUrl: grupoEhReserva(g) ? null : g.invite_url,
});

export async function listarGrupos(admin: Admin, organizationId: string, launchId: string): Promise<GrupoDoLancamento[]> {
  const { data, error } = await admin
    .from("group_launch_groups")
    .select(COLUNAS_DO_GRUPO)
    .eq("organization_id", organizationId)
    .eq("launch_id", launchId)
    .order("position", { ascending: true });
  if (error) throw new Error(`lançamentos: leitura dos grupos falhou: ${error.message}`);
  return (data ?? []) as GrupoDoLancamento[];
}

export async function lerLancamento(admin: Admin, organizationId: string, id: string): Promise<Lancamento | null> {
  const { data, error } = await admin
    .from("group_launches")
    .select(COLUNAS_DO_LANCAMENTO)
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`lançamentos: leitura do lançamento falhou: ${error.message}`);
  return (data as Lancamento | null) ?? null;
}

export async function listarLancamentos(admin: Admin, organizationId: string): Promise<Lancamento[]> {
  const { data, error } = await admin
    .from("group_launches")
    .select(COLUNAS_DO_LANCAMENTO)
    .eq("organization_id", organizationId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`lançamentos: listagem falhou: ${error.message}`);
  return (data ?? []) as Lancamento[];
}

/**
 * Abre o PRÓXIMO grupo do lançamento. `null` = outra chamada já está abrindo esta
 * posição (o link de um lançamento cheio é clicado por muita gente no mesmo
 * segundo, e cada clique tentaria criar um grupo).
 *
 * A posição é reservada ANTES de falar com o WhatsApp: o índice único
 * (lançamento, posição) escolhe um vencedor, e só ele cria o grupo. Sem a reserva,
 * dois cliques simultâneos criariam dois grupos de verdade e um deles ficaria
 * órfão no WhatsApp, fora do link.
 */
export async function abrirProximoGrupo(
  admin: Admin,
  whatsapp: WhatsappDeGrupos,
  lancamento: Lancamento,
): Promise<GrupoDoLancamento | null> {
  const sessao = await lerSessaoDeGrupos(admin, lancamento.organization_id, lancamento.channel_session_id);
  if (!sessao) throw new LancamentoError("numero_invalido", "O número deste lançamento não existe mais ou não faz grupos.");
  if (!sessao.conectado) throw new LancamentoError("numero_desconectado", "O número deste lançamento está desconectado.");

  const grupos = await listarGrupos(admin, lancamento.organization_id, lancamento.id);
  const posicao = grupos.reduce((maior, g) => Math.max(maior, g.position), 0) + 1;
  const nome = nomeDoGrupo(lancamento.group_name_template, posicao);

  const { data: reserva, error: erroDaReserva } = await admin
    .from("group_launch_groups")
    .insert({
      organization_id: lancamento.organization_id,
      launch_id: lancamento.id,
      position: posicao,
      wa_group_id: `${PREFIXO_DE_RESERVA}${randomBytes(8).toString("hex")}`,
      name: nome,
      status: "closed",
    })
    .select("id")
    .single();
  if (erroDaReserva) {
    if (erroDaReserva.code === "23505") return null;
    throw new Error(`lançamentos: reserva do grupo falhou: ${erroDaReserva.message}`);
  }
  const grupoId = (reserva as { id: string }).id;

  let waGroupId: string;
  try {
    ({ id: waGroupId } = await whatsapp.createGroup(sessao.sessionName, nome, [lancamento.seed_participant]));
  } catch (err) {
    await admin.from("group_launch_groups").delete().eq("organization_id", lancamento.organization_id).eq("id", grupoId);
    throw new LancamentoError(
      "grupo_nao_criado",
      `O WhatsApp não criou o grupo (${err instanceof Error ? err.message : String(err)}). Confira se o número de apoio tem WhatsApp e aceita ser adicionado a grupos.`,
    );
  }

  // O grupo EXISTE no WhatsApp daqui em diante: nada abaixo pode apagar a linha.
  // Descrição e "só admin fala" são acabamento — falha vira log, e o grupo segue.
  if (lancamento.group_description) {
    await whatsapp.setGroupDescription(sessao.sessionName, waGroupId, lancamento.group_description).catch((err) =>
      logger.warn("[lançamentos] descrição do grupo não foi gravada", { grupo: grupoId, erro: String(err) }),
    );
  }
  if (lancamento.admins_only) {
    await whatsapp.setGroupAdminsOnly(sessao.sessionName, waGroupId, true).catch((err) =>
      logger.warn("[lançamentos] 'só admin fala' não foi ligado", { grupo: grupoId, erro: String(err) }),
    );
  }
  const convite = await whatsapp
    .getGroupInviteCode(sessao.sessionName, waGroupId)
    .then(linkDoConvite)
    .catch((err) => {
      logger.warn("[lançamentos] convite do grupo não veio — a rodada do relógio tenta de novo", { grupo: grupoId, erro: String(err) });
      return null;
    });
  const membros = await whatsapp
    .getGroupInfo(sessao.sessionName, waGroupId)
    .then((i) => i.membros)
    .catch(() => 0);

  const { data, error } = await admin
    .from("group_launch_groups")
    .update({
      wa_group_id: waGroupId,
      invite_url: convite,
      members_count: membros,
      members_checked_at: new Date().toISOString(),
      status: "open",
    })
    .eq("organization_id", lancamento.organization_id)
    .eq("id", grupoId)
    .select(COLUNAS_DO_GRUPO)
    .single();
  if (error) throw new Error(`lançamentos: gravação do grupo falhou: ${error.message}`);
  return data as GrupoDoLancamento;
}

/** Relê do WhatsApp a contagem (e o convite, se faltava) de um grupo e grava. Devolve o grupo atualizado. */
export async function atualizarGrupo(
  admin: Admin,
  whatsapp: WhatsappDeGrupos,
  lancamento: Lancamento,
  sessionName: string,
  grupo: GrupoDoLancamento,
): Promise<GrupoDoLancamento> {
  if (grupoEhReserva(grupo)) return grupo;
  const { membros } = await whatsapp.getGroupInfo(sessionName, grupo.wa_group_id);
  const convite =
    grupo.invite_url ?? (await whatsapp.getGroupInviteCode(sessionName, grupo.wa_group_id).then(linkDoConvite).catch(() => null));
  const patch = {
    members_count: membros,
    members_checked_at: new Date().toISOString(),
    status: statusPelaContagem(grupo.status, membros, lancamento.group_capacity),
    invite_url: convite,
  };
  const { error } = await admin
    .from("group_launch_groups")
    .update(patch)
    .eq("organization_id", lancamento.organization_id)
    .eq("id", grupo.id);
  if (error) throw new Error(`lançamentos: gravação da contagem falhou: ${error.message}`);
  return { ...grupo, ...patch };
}

/** Slug livre a partir do nome: o do nome, e com um sufixo curto se já houver um igual. */
async function slugLivre(admin: Admin, nome: string): Promise<string> {
  const base = slugDoNome(nome).padEnd(3, "0") || "grupo";
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const slug = tentativa === 0 ? base : `${base.slice(0, 34)}-${randomBytes(3).toString("hex")}`;
    const { data, error } = await admin.from("group_launches").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(`lançamentos: conferência do link falhou: ${error.message}`);
    if (!data) return slug;
  }
  return `grupo-${randomBytes(6).toString("hex")}`;
}

/**
 * Cria o lançamento JÁ com o primeiro grupo. Se o WhatsApp recusar o grupo, o
 * lançamento não fica: um lançamento sem grupo nenhum é um link que não leva a
 * lugar algum, e o erro do WhatsApp é a informação que a pessoa precisa ver.
 */
export async function criarLancamento(
  admin: Admin,
  whatsapp: WhatsappDeGrupos,
  p: { organizationId: string; userId: string; input: CriarLancamentoInput },
): Promise<{ lancamento: Lancamento; grupo: GrupoDoLancamento }> {
  const sessao = await lerSessaoDeGrupos(admin, p.organizationId, p.input.channel_session_id);
  if (!sessao) throw new LancamentoError("numero_invalido", "Escolha um número conectado por QR code — a API oficial não faz grupos.");
  if (!sessao.conectado) throw new LancamentoError("numero_desconectado", "Esse número está desconectado. Reconecte em Conexões e tente de novo.");
  const apoio = telefoneSoDigitos(p.input.seed_participant);
  if (apoio === null) throw new LancamentoError("participante_invalido", "Informe o número de apoio com DDI e DDD (ex.: 5511999990000).");

  const { data, error } = await admin
    .from("group_launches")
    .insert({
      organization_id: p.organizationId,
      channel_session_id: sessao.channelSessionId,
      name: p.input.name,
      slug: await slugLivre(admin, p.input.name),
      group_name_template: p.input.group_name_template,
      group_description: p.input.group_description || null,
      group_capacity: p.input.group_capacity,
      admins_only: p.input.admins_only,
      seed_participant: apoio,
      created_by: p.userId,
    })
    .select(COLUNAS_DO_LANCAMENTO)
    .single();
  if (error) throw new Error(`lançamentos: criação falhou: ${error.message}`);
  const lancamento = data as Lancamento;

  try {
    const grupo = await abrirProximoGrupo(admin, whatsapp, lancamento);
    if (grupo === null) throw new LancamentoError("grupo_nao_criado", "O primeiro grupo não foi criado. Tente de novo.");
    return { lancamento, grupo };
  } catch (err) {
    await admin.from("group_launches").delete().eq("organization_id", p.organizationId).eq("id", lancamento.id);
    throw err;
  }
}

export type DestinoDoLink =
  | { tipo: "grupo"; url: string }
  | { tipo: "indisponivel"; motivo: "nao_existe" | "pausado" | "sem_vaga" };

/**
 * Para onde o link público manda quem clicou AGORA.
 *
 * Sem sessão: quem clica é um desconhecido vindo do anúncio. O que sai daqui é só
 * o convite de UM grupo — o slug não dá acesso a mais nada do lançamento.
 */
export async function resolverLinkPublico(
  admin: Admin,
  whatsapp: WhatsappDeGrupos | null,
  slug: string,
  agoraMs: number = Date.now(),
): Promise<DestinoDoLink> {
  const { data, error } = await admin.from("group_launches").select(COLUNAS_DO_LANCAMENTO).eq("slug", slug).maybeSingle();
  if (error) throw new Error(`lançamentos: leitura do link falhou: ${error.message}`);
  const lancamento = data as Lancamento | null;
  if (!lancamento || lancamento.status === "archived") return { tipo: "indisponivel", motivo: "nao_existe" };
  if (lancamento.status === "paused") return { tipo: "indisponivel", motivo: "pausado" };

  let grupos = await listarGrupos(admin, lancamento.organization_id, lancamento.id);
  const sessao = whatsapp ? await lerSessaoDeGrupos(admin, lancamento.organization_id, lancamento.channel_session_id) : null;
  const podeFalar = whatsapp !== null && sessao !== null && sessao.conectado;

  // A contagem do candidato é relida quando está velha: é ela que decide se o
  // convite ainda vale. Falha de leitura não derruba o link — vale a última contagem.
  const candidato = grupoComVaga(grupos.map(paraVaga), lancamento.group_capacity);
  if (candidato && podeFalar) {
    const linha = grupos.find((g) => g.id === candidato.id)!;
    const velha = !linha.members_checked_at || agoraMs - Date.parse(linha.members_checked_at) > VALIDADE_DA_CONTAGEM_MS;
    if (velha) {
      try {
        const atual = await atualizarGrupo(admin, whatsapp!, lancamento, sessao!.sessionName, linha);
        grupos = grupos.map((g) => (g.id === atual.id ? atual : g));
      } catch (err) {
        logger.warn("[lançamentos] contagem não pôde ser relida no clique", { lancamento: lancamento.id, erro: String(err) });
      }
    }
  }

  if (podeFalar && precisaAbrirOutroGrupo(grupos.map(paraVaga), lancamento.group_capacity)) {
    try {
      const novo = await abrirProximoGrupo(admin, whatsapp!, lancamento);
      if (novo) grupos = [...grupos, novo];
    } catch (err) {
      logger.error("[lançamentos] o próximo grupo não pôde ser aberto", { lancamento: lancamento.id, erro: String(err) });
    }
  }

  const escolhido = grupoComVaga(grupos.map(paraVaga), lancamento.group_capacity);
  // Registro do clique: uma linha por clique. Falha aqui não pode custar o redirecionamento.
  const { error: erroDoClique } = await admin.from("group_launch_clicks").insert({
    organization_id: lancamento.organization_id,
    launch_id: lancamento.id,
    group_id: escolhido?.id ?? null,
  });
  if (erroDoClique) logger.warn("[lançamentos] clique não registrado", { lancamento: lancamento.id, erro: erroDoClique.message });

  if (!escolhido?.inviteUrl) return { tipo: "indisponivel", motivo: "sem_vaga" };
  return { tipo: "grupo", url: escolhido.inviteUrl };
}

/**
 * A manutenção de UM lançamento ativo, feita pela rodada do relógio: relê a
 * contagem de cada grupo e abre o próximo quando as vagas estão no fim. É a rede
 * de segurança do link — se ninguém clicar por um tempo, o grupo seguinte já
 * estará pronto quando o anúncio voltar a rodar.
 */
export async function manterLancamento(
  admin: Admin,
  whatsapp: WhatsappDeGrupos,
  lancamento: Lancamento,
): Promise<{ atualizados: number; abriu: boolean }> {
  const sessao = await lerSessaoDeGrupos(admin, lancamento.organization_id, lancamento.channel_session_id);
  if (!sessao?.conectado) return { atualizados: 0, abriu: false };

  // RESERVA ESQUECIDA: uma posição reservada cuja criação morreu no meio (o
  // processo caiu entre reservar e o WhatsApp responder). Ela não atrapalha o
  // link, mas ocupa um número na sequência para sempre. Passado o prazo em que
  // uma criação de verdade já teria terminado, a reserva sai.
  const { error: erroDaLimpeza } = await admin
    .from("group_launch_groups")
    .delete()
    .eq("organization_id", lancamento.organization_id)
    .eq("launch_id", lancamento.id)
    .like("wa_group_id", `${PREFIXO_DE_RESERVA}%`)
    .lt("created_at", new Date(Date.now() - RESERVA_ESQUECIDA_MS).toISOString());
  if (erroDaLimpeza) logger.warn("[lançamentos] reservas esquecidas não foram limpas", { lancamento: lancamento.id, erro: erroDaLimpeza.message });

  let grupos = await listarGrupos(admin, lancamento.organization_id, lancamento.id);
  let atualizados = 0;
  for (const g of grupos) {
    if (g.status === "closed" || grupoEhReserva(g)) continue;
    try {
      const atual = await atualizarGrupo(admin, whatsapp, lancamento, sessao.sessionName, g);
      grupos = grupos.map((x) => (x.id === atual.id ? atual : x));
      atualizados++;
    } catch (err) {
      logger.warn("[lançamentos] contagem não pôde ser relida na rodada", { grupo: g.id, erro: String(err) });
    }
  }
  let abriu = false;
  if (precisaAbrirOutroGrupo(grupos.map(paraVaga), lancamento.group_capacity)) {
    try {
      abriu = (await abrirProximoGrupo(admin, whatsapp, lancamento)) !== null;
    } catch (err) {
      logger.error("[lançamentos] o próximo grupo não pôde ser aberto na rodada", { lancamento: lancamento.id, erro: String(err) });
    }
  }
  return { atualizados, abriu };
}
