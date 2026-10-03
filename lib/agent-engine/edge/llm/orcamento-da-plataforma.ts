/**
 * O TETO DE QUEM USA A IA DA PLATAFORMA — puro, sem banco e sem env.
 *
 * Quando a empresa não cadastrou a própria chave, a IA dela roda na CHAVE DA
 * INSTALAÇÃO: quem paga é quem vende o serviço. Aí o teto que vale não é o que
 * a empresa escolheu na tela (ela poderia desligá-lo, ou nunca ter armado — o
 * modo nasce `off`), é o que o PLANO dela cobre. Sem isso, um cliente de R$ 97
 * gasta US$ 300 de IA no mês e quem vende descobre na fatura.
 *
 * Por isso, e só nesse caso, o teto vira:
 *   - `bloquear`, efetivo desde sempre (sem a carência que a tela dá a quem arma
 *     o próprio teto — aqui não há quem arme);
 *   - o valor do plano (`iaMensalCentavosUsd`);
 *   - plano ausente, inativo, ou que não inclui IA → o PISO do teto: a conversa
 *     que já começou é avisada e passada para uma pessoa, em vez de a plataforma
 *     pagar IA sem limite para quem não assinou.
 *
 * Quem cadastra a PRÓPRIA chave paga a própria IA: o teto dele é o da tela,
 * como sempre foi. Com os planos desligados (`PLANS_ENFORCED` ausente — quem usa
 * o sistema para a própria empresa), nada aqui tem efeito.
 */
import { lerCatalogoDeclarado, planoPorId, PLANOS_PADRAO, type Plano } from '@/lib/planos/catalogo';

import { LIMIAR_PADRAO_PCT, PISO_DE_TETO_CENTS, type ModoDeOrcamento } from './orcamento';

export interface PlanosDaCamada {
  /** `PLANS_ENFORCED=true`. */
  ativos: boolean;
  /** `PLANS_CATALOG` cru; vazio ou malformado = o catálogo padrão. */
  catalogoDeclarado: string;
}

export interface AssinaturaParaIa {
  planoId: string | null;
  /** `organization_subscriptions.status` — só `ativa` libera a IA do plano. */
  status: string | null;
}

export interface TetoDaPlataforma {
  modo: ModoDeOrcamento;
  tetoCents: number;
  efetivoEm: Date;
  limiarPct: number;
  /** Para log e para a tela: de onde veio o número. */
  plano: string | null;
}

/** Desde sempre: o teto da plataforma não tem carência. */
const EFETIVO_DESDE_SEMPRE = new Date(0);

export function catalogoDaCamada(planos: PlanosDaCamada): readonly Plano[] {
  return lerCatalogoDeclarado(planos.catalogoDeclarado.trim()) ?? PLANOS_PADRAO;
}

export function tetoDaPlataforma(planos: PlanosDaCamada, assinatura: AssinaturaParaIa | null): TetoDaPlataforma {
  const plano = assinatura?.status === 'ativa' ? planoPorId(catalogoDaCamada(planos), assinatura.planoId) : null;
  const doPlano = plano?.iaMensalCentavosUsd ?? 0;
  return {
    modo: 'bloquear',
    // Abaixo do piso o decisor trata o teto como "sem teto" e deixa passar —
    // exatamente o contrário do que se quer para quem não tem IA no plano.
    tetoCents: Math.max(doPlano, PISO_DE_TETO_CENTS),
    efetivoEm: EFETIVO_DESDE_SEMPRE,
    limiarPct: LIMIAR_PADRAO_PCT,
    plano: plano?.id ?? null,
  };
}
