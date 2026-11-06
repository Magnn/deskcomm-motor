/**
 * A RODADA QUE RENOVA O PLANO DA SEMANA no cartão guardado (migration 0954), de hora em hora (`/api/v1/cron/area-planos`).
 *
 * Quem entra: `renova` ligado, cartão guardado, vencimento nas próximas 12 horas (ou vencido há menos de 3 dias — a
 * nova tentativa depois de uma recusa) e `proxima_tentativa` já passada. A empresa precisa estar com o plano ligado:
 * plano desligado no painel não cobra ninguém.
 *
 * Como cobra: um pagamento fora da sessão no cartão guardado, com os MESMOS metadados da área (`extra=plano-semanal`).
 * Quem estende os 7 dias é o aviso `payment_intent.succeeded` de sempre — a rodada nunca mexe em `valido_ate`.
 *
 * Contra a cobrança em dobro: a linha é "reservada" (`proxima_tentativa` = agora + 6 h, só se ainda estava livre)
 * antes de chamar a Stripe, e a chamada leva a chave de idempotência `renova-plano-<id>-<vencimento>` — a mesma
 * semana nunca vira duas cobranças, nem com duas rodadas ao mesmo tempo.
 *
 * Recusa do cartão: conta uma falha e tenta de novo em 24 h; na 3ª recusa seguida a renovação desliga (a pessoa
 * continua podendo pagar a semana pela área). Stripe fora do ar não conta como recusa.
 *
 * O aviso antes (migration 0958): `avisarRenovacoes` manda o e-mail 48 h antes do vencimento — valor, dia e como
 * cancelar — e grava a semana avisada (`aviso_para`). A cobrança só sai para a semana avisada há 24 h ou mais:
 * sem e-mail no contato, sem e-mail configurado ou com o envio falhando, ninguém é cobrado (a pessoa ainda pode
 * pagar a semana pela área).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { emailDoAvisoDeRenovacao } from "@/lib/area-do-cliente/email-da-area";
import { caminhoDaArea, origemDaArea } from "@/lib/area-do-cliente/vocabulario";
import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import { precoDaOferta } from "@/lib/area-do-cliente/moeda-do-visitante";
import { EXTRA_DO_PLANO_SEMANAL, configDoPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";

export const HORAS_ANTES_DE_RENOVAR = 12;
export const RECUSAS_ATE_DESLIGAR = 3;
/** O aviso sai quando faltam 48 h; a cobrança espera o aviso ter saído há 24 h. */
export const HORAS_ANTES_DE_AVISAR = 48;
export const HORAS_ENTRE_AVISO_E_COBRANCA = 24;
const HORA = 3_600_000;
const POR_RODADA = 100;
const COLUNAS = "id, organization_id, contact_id, valido_ate, moeda, stripe_cliente, stripe_cartao, falhas, aviso_para, aviso_em";

export interface LinhaDeRenovacao {
  id: string;
  organization_id: string;
  contact_id: string;
  valido_ate: string;
  moeda: "BRL" | "USD" | "EUR";
  stripe_cliente: string | null;
  stripe_cartao: string | null;
  falhas: number;
  aviso_para: string | null;
  aviso_em: string | null;
}

export interface RodadaDeRenovacao {
  cobradas: number;
  recusadas: number;
  desligadas: number;
  adiadas: number;
  /** Na janela de cobrança, mas a semana ainda não foi avisada (ou foi há menos de 24 h). */
  sem_aviso: number;
}

/** Pura: a semana pode ser cobrada — o aviso foi DESTA semana e saiu há 24 h ou mais. */
export function avisoPermiteCobrar(l: Pick<LinhaDeRenovacao, "valido_ate" | "aviso_para" | "aviso_em">, agora: Date): boolean {
  if (!l.aviso_para || !l.aviso_em) return false;
  if (new Date(l.aviso_para).getTime() !== new Date(l.valido_ate).getTime()) return false;
  return new Date(l.aviso_em).getTime() <= agora.getTime() - HORAS_ENTRE_AVISO_E_COBRANCA * HORA;
}

/** Pura: depois de uma recusa, o que muda na linha. */
export function depoisDaRecusa(falhas: number, agora: Date): { falhas: number; renova: boolean; proxima_tentativa: string } {
  const novas = falhas + 1;
  return { falhas: novas, renova: novas < RECUSAS_ATE_DESLIGAR, proxima_tentativa: new Date(agora.getTime() + 24 * HORA).toISOString() };
}

/** Pura: a chave que impede a mesma semana de virar duas cobranças. */
export function referenciaDaRenovacao(planoId: string, validoAte: string): string {
  return `renova-plano-${planoId}-${new Date(validoAte).getTime()}`;
}

type Cobrar = (
  admin: SupabaseClient,
  orgId: string,
  pedido: Parameters<ReturnType<typeof criarClienteStripe>["cobrarCartaoGuardado"]>[0],
) => Promise<{ status: string }>;

const cobrarDeVerdade: Cobrar = async (admin, orgId, pedido) => {
  const conexao = await lerConexaoStripe(admin, orgId);
  if (!conexao) throw new ErroDaStripe("indisponivel", "organização sem Stripe conectada");
  return criarClienteStripe(conexao).cobrarCartaoGuardado(pedido);
};

export async function renovarPlanosSemanais(admin: SupabaseClient, agora: Date, cobrar: Cobrar = cobrarDeVerdade): Promise<RodadaDeRenovacao> {
  const rodada: RodadaDeRenovacao = { cobradas: 0, recusadas: 0, desligadas: 0, adiadas: 0, sem_aviso: 0 };
  const { data, error } = await admin
    .from("area_planos")
    .select(COLUNAS)
    .eq("plano", "semanal")
    .eq("renova", true)
    .not("stripe_cartao", "is", null)
    .lte("valido_ate", new Date(agora.getTime() + HORAS_ANTES_DE_RENOVAR * HORA).toISOString())
    .gte("valido_ate", new Date(agora.getTime() - 72 * HORA).toISOString())
    .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agora.toISOString()}`)
    .order("valido_ate", { ascending: true })
    .limit(POR_RODADA);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as LinhaDeRenovacao[];
  if (linhas.length === 0) return rodada;

  // A configuração de cada empresa, uma vez por rodada.
  const orgIds = [...new Set(linhas.map((l) => l.organization_id))];
  const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id, settings").in("id", orgIds);
  if (erroOrgs) throw new Error(erroOrgs.message);
  const planoDaOrg = new Map(
    ((orgs ?? []) as Array<{ id: string; settings: unknown }>).map((o) => [o.id, configDoPlanoSemanal(lerConfigDaArea(o.settings).plano_semanal)]),
  );

  for (const l of linhas) {
    const cfg = planoDaOrg.get(l.organization_id);
    const valor = cfg ? precoDaOferta(cfg, l.moeda) : null;
    if (!cfg?.ativo || valor === null || !l.stripe_cliente || !l.stripe_cartao) {
      rodada.adiadas++;
      continue;
    }
    if (!avisoPermiteCobrar(l, agora)) {
      rodada.sem_aviso++;
      continue;
    }
    // Reserva a linha: só quem a pegou livre segue (duas rodadas ao mesmo tempo não cobram duas vezes).
    const { data: reservada, error: erroReserva } = await admin
      .from("area_planos")
      .update({ proxima_tentativa: new Date(agora.getTime() + 6 * HORA).toISOString() })
      .eq("id", l.id)
      .eq("valido_ate", l.valido_ate)
      .or(`proxima_tentativa.is.null,proxima_tentativa.lte.${agora.toISOString()}`)
      .select("id");
    if (erroReserva) throw new Error(erroReserva.message);
    if (!reservada || reservada.length === 0) continue;

    try {
      const r = await cobrar(admin, l.organization_id, {
        valorCentavos: valor,
        moeda: l.moeda,
        descricao: `${cfg.nome} — 7 dias (renovação)`,
        cliente: l.stripe_cliente,
        cartao: l.stripe_cartao,
        referencia: referenciaDaRenovacao(l.id, l.valido_ate),
        metadados: {
          organization_id: l.organization_id,
          contact_id: l.contact_id,
          produto: cfg.nome,
          extra: EXTRA_DO_PLANO_SEMANAL,
          moeda: l.moeda,
          renovacao: "1",
        },
      });
      if (r.status === "succeeded" || r.status === "processing") {
        rodada.cobradas++;
        continue;
      }
      // `requires_action` (o banco pediu autenticação) ou `requires_payment_method`: conta como recusa.
      throw new ErroDaStripe("recusada", `status ${r.status}`);
    } catch (err) {
      if (!(err instanceof ErroDaStripe) || err.codigo === "indisponivel") {
        // Stripe fora do ar: a reserva de 6 h já espaça a próxima tentativa, sem contar recusa.
        rodada.adiadas++;
        continue;
      }
      const depois = depoisDaRecusa(l.falhas, agora);
      const { error: erroFalha } = await admin.from("area_planos").update({ ...depois, updated_at: agora.toISOString() }).eq("id", l.id);
      if (erroFalha) throw new Error(erroFalha.message);
      rodada.recusadas++;
      if (!depois.renova) rodada.desligadas++;
    }
  }
  return rodada;
}

export interface RodadaDosAvisosDeRenovacao {
  avisados: number;
  sem_email: number;
  avisos_falhos: number;
}

type MandarEmail = (args: Parameters<typeof sendEmail>[0]) => Promise<{ ok: boolean }>;

const formatoDoValor = (centavos: number, moeda: LinhaDeRenovacao["moeda"], pt: boolean) =>
  new Intl.NumberFormat(pt ? "pt-BR" : "en-US", { style: "currency", currency: moeda }).format(centavos / 100);

function diaDaCobranca(validoAte: string, fuso: string | null, pt: boolean): string {
  // A cobrança sai 12 h antes do vencimento; o dia é o do relógio da empresa.
  const cobranca = new Date(new Date(validoAte).getTime() - HORAS_ANTES_DE_RENOVAR * HORA);
  const formatar = (tz: string) => new Intl.DateTimeFormat(pt ? "pt-BR" : "en-US", { day: "numeric", month: "long", timeZone: tz }).format(cobranca);
  try {
    return formatar(fuso ?? "America/Sao_Paulo");
  } catch {
    return formatar("America/Sao_Paulo"); // fuso inválido numa empresa não derruba o aviso
  }
}

/**
 * A rodada do aviso: quem renova nas próximas 48 h e ainda não foi avisado desta semana recebe o e-mail. A linha é
 * marcada antes de mandar (duas rodadas ao mesmo tempo não mandam dois e-mails) e desmarcada se o envio falhar.
 */
export async function avisarRenovacoes(admin: SupabaseClient, agora: Date, mandar: MandarEmail = sendEmail): Promise<RodadaDosAvisosDeRenovacao> {
  const r: RodadaDosAvisosDeRenovacao = { avisados: 0, sem_email: 0, avisos_falhos: 0 };
  // O aviso da semana anterior é de um vencimento 7 dias mais cedo (antes de agora - 96 h); o desta semana fica
  // entre agora - 72 h e agora + 48 h. O corte em 96 h separa os dois.
  const naoAvisada = `aviso_para.is.null,aviso_para.lt.${new Date(agora.getTime() - 96 * HORA).toISOString()}`;
  const { data, error } = await admin
    .from("area_planos")
    .select(COLUNAS)
    .eq("plano", "semanal")
    .eq("renova", true)
    .not("stripe_cartao", "is", null)
    .lte("valido_ate", new Date(agora.getTime() + HORAS_ANTES_DE_AVISAR * HORA).toISOString())
    .gte("valido_ate", new Date(agora.getTime() - 72 * HORA).toISOString())
    .or(naoAvisada)
    .order("valido_ate", { ascending: true })
    .limit(POR_RODADA);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as LinhaDeRenovacao[];
  if (linhas.length === 0) return r;

  const orgIds = [...new Set(linhas.map((l) => l.organization_id))];
  const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id, slug, timezone, settings").in("id", orgIds);
  if (erroOrgs) throw new Error(erroOrgs.message);
  const orgPorId = new Map(((orgs ?? []) as Array<{ id: string; slug: string; timezone: string | null; settings: unknown }>).map((o) => [o.id, o]));
  const { data: contatos, error: erroContatos } = await admin
    .from("contacts")
    .select("id, organization_id, name, display_name, email")
    .in("organization_id", orgIds)
    .in("id", [...new Set(linhas.map((l) => l.contact_id))]);
  if (erroContatos) throw new Error(erroContatos.message);
  type Contato = { id: string; organization_id: string; name: string | null; display_name: string | null; email: string | null };
  const contatoPorId = new Map(((contatos ?? []) as Contato[]).map((c) => [c.id, c]));

  for (const l of linhas) {
    const org = orgPorId.get(l.organization_id);
    if (!org) continue;
    const area = lerConfigDaArea(org.settings);
    const cfg = configDoPlanoSemanal(area.plano_semanal);
    const valor = precoDaOferta(cfg, l.moeda);
    if (!cfg.ativo || valor === null) continue; // plano desligado não cobra: não há o que avisar
    const contato = contatoPorId.get(l.contact_id);
    // O contato tem de ser da MESMA empresa da linha (o cliente admin não filtra sozinho).
    const email = contato && contato.organization_id === l.organization_id ? contato.email?.trim() : null;
    if (!email) {
      r.sem_email++;
      continue;
    }
    const { data: marcada, error: erroMarca } = await admin
      .from("area_planos")
      .update({ aviso_para: l.valido_ate, aviso_em: agora.toISOString() })
      .eq("id", l.id)
      .eq("valido_ate", l.valido_ate)
      .or(naoAvisada)
      .select("id");
    if (erroMarca) throw new Error(erroMarca.message);
    if (!marcada || marcada.length === 0) continue;

    const pt = l.moeda === "BRL";
    const marca = await marcaDaSaida(l.organization_id);
    const msg = emailDoAvisoDeRenovacao({
      titulo: area.titulo,
      marcaDaOrganizacao: marca.nome,
      nomeDoPlano: cfg.nome,
      nomeDaPessoa: contato?.display_name ?? contato?.name ?? null,
      valor: formatoDoValor(valor, l.moeda, pt),
      dia: diaDaCobranca(l.valido_ate, org.timezone, pt),
      link: `${origemDaArea(area.dominio, env.NEXT_PUBLIC_APP_URL ?? "")}${caminhoDaArea(org.slug)}?aba=explorar`,
      emPortugues: pt,
    });
    const envio = await mandar({
      to: email,
      subject: msg.subject,
      fromName: msg.fromName,
      text: msg.text,
      html: msg.html,
      tags: [{ name: "tipo", value: "area_aviso_renovacao" }],
    });
    if (envio.ok) {
      r.avisados++;
      continue;
    }
    // Não saiu: desmarca, para a próxima rodada tentar de novo (e a cobrança segue travada até lá).
    r.avisos_falhos++;
    const { error: erroVolta } = await admin.from("area_planos").update({ aviso_para: null, aviso_em: null }).eq("id", l.id).eq("valido_ate", l.valido_ate);
    if (erroVolta) throw new Error(erroVolta.message);
  }
  return r;
}
