/**
 * O QUE O WHATSAPP OFICIAL ESTÁ COBRANDO, NÚMERO A NÚMERO, NO MÊS.
 *
 * Desde 1º/10/2026 a Meta dá 1.000 mensagens de atendimento grátis por número oficial por mês e cobra cada uma
 * depois disso (medido em 20/11/2026: 7336 com R$ 78, 5617 com R$ 39 e 5416 com R$ 16, sem nenhum modelo enviado).
 * O CRM recebia o veredito por mensagem (`messages.billing_*`, migration 0917) e não mostrava em lugar nenhum.
 *
 * A conta é do que o PROVEDOR disse por mensagem. Número cujo provedor não informa (nada em `billing_billable`) entra
 * pela franquia: o que passou de 1.000 no mês conta como pago — e a linha diz que é estimativa.
 */
import type pg from "pg";

import { CHANNEL_CAPABILITIES } from "@/lib/channels/capabilities";

/** Franquia mensal de mensagens de atendimento grátis por número (Meta, desde 1º/10/2026). */
export const FRANQUIA_MENSAL = 1000;

/**
 * Preço médio de uma mensagem de atendimento paga para o Brasil, medido no painel da Meta em 20/11/2026
 * (R$ 78,46 por 2.235 pagas = R$ 0,0351). shortcut: valor fixo; trocar pela tabela da Meta se ela mudar o preço.
 */
export const CENTAVOS_POR_MENSAGEM_PAGA = 3.51;

export interface CobrancaDoNumero {
  canalId: string;
  telefone: string;
  nome: string | null;
  enviadas: number;
  gratis: number;
  pagas: number;
  /** `true` quando o provedor não disse por mensagem e as pagas saíram da franquia. */
  estimada: boolean;
  custoCentavos: number;
}

export interface CobrancaDoMes {
  inicio: string;
  numeros: CobrancaDoNumero[];
  totalCentavos: number;
  franquia: number;
}

interface Linha {
  canal_id: string;
  telefone: string;
  nome: string | null;
  enviadas: string | number;
  gratis: string | number;
  pagas: string | number;
  informadas: string | number;
}

/** Pura: linhas do banco → números do painel, com a franquia para quem o provedor não informa. */
export function montarCobranca(linhas: readonly Linha[], inicio: Date): CobrancaDoMes {
  const numeros = linhas
    .map((l): CobrancaDoNumero => {
      const enviadas = Number(l.enviadas);
      const informadas = Number(l.informadas);
      const estimada = informadas === 0;
      const pagas = estimada ? Math.max(0, enviadas - FRANQUIA_MENSAL) : Number(l.pagas);
      const gratis = estimada ? enviadas - pagas : Number(l.gratis);
      return {
        canalId: l.canal_id,
        telefone: l.telefone,
        nome: l.nome,
        enviadas,
        gratis,
        pagas,
        estimada,
        custoCentavos: Math.round(pagas * CENTAVOS_POR_MENSAGEM_PAGA),
      };
    })
    .sort((a, b) => b.custoCentavos - a.custoCentavos || b.enviadas - a.enviadas);
  return {
    inicio: inicio.toISOString(),
    numeros,
    totalCentavos: numeros.reduce((s, n) => s + n.custoCentavos, 0),
    franquia: FRANQUIA_MENSAL,
  };
}

/** Canais da API oficial do WhatsApp — os que a Meta cobra: exigem modelo fora da janela e custam por mensagem. */
const PROVEDORES_OFICIAIS = Object.entries(CHANNEL_CAPABILITIES)
  .filter(([, c]) => c.requiresTemplates && c.costPerMessage)
  .map(([provedor]) => provedor);

export async function lerCobrancaDoWhatsapp(pool: pg.Pool, organizationId: string, agora = new Date()): Promise<CobrancaDoMes> {
  // O mês da Meta é o do calendário em UTC.
  const inicio = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const { rows } = await pool.query<Linha>(
    `select s.id as canal_id, s.phone_number as telefone, s.display_name as nome,
            count(*) as enviadas,
            count(*) filter (where m.billing_billable is false) as gratis,
            count(*) filter (where m.billing_billable is true) as pagas,
            count(m.billing_billable) as informadas
       from public.messages m
       join public.channel_sessions s on s.id = m.channel_session_id and s.organization_id = m.organization_id
      where m.organization_id = $1
        and m.direction = 'outbound'
        and m.status <> 'failed'
        and m.created_at >= $2
        and s.provider = any($3)
        and s.phone_number is not null
      group by s.id, s.phone_number, s.display_name`,
    [organizationId, inicio.toISOString(), PROVEDORES_OFICIAIS],
  );
  return montarCobranca(rows, inicio);
}
