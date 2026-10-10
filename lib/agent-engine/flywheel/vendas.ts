/**
 * APRENDER COM AS CONVERSAS QUE VIRARAM VENDA.
 *
 * O flywheel julgava uma dimensão só — a higiene das anotações do lead — e nunca olhava se o
 * atendimento VENDEU. O sinal já existia (`revenue_ledger`, gravado pelo aviso de compra do meio de
 * pagamento); faltava a peça que compara as conversas que fecharam com as que chegaram ao preço e
 * não fecharam, e transforma a diferença em proposta.
 *
 * ─── O que esta peça NÃO faz ──────────────────────────────────────────────────────────────────
 * Não muda o agente. Ela grava PROPOSTAS (`flywheel_distiller_proposals`), com a evidência ao lado,
 * e o dono aplica ou dispensa na tela — e desfaz depois, se a mudança piorar (`apply-proposal.ts`).
 * Com poucas vendas por dia a amostra é pequena, e um padrão tirado de poucas conversas pode ser
 * coincidência: quem decide é uma pessoa.
 *
 * ─── As travas, que são do código e não só do pedido ao modelo ────────────────────────────────
 *  - amostra mínima dos dois lados, senão não há comparação a fazer;
 *  - cada lição precisa apontar em QUAIS conversas ganhas ela apareceu, no mínimo três;
 *  - lição que manda baixar preço, prometer resultado, criar escassez ou afirmar coisa sobre
 *    terceiros é descartada aqui, antes de virar proposta (`licaoProibida`);
 *  - com três propostas de venda pendentes, a rodada não gera mais: fila que ninguém leu não cresce.
 */
import type pg from 'pg';

import { runModelCall, type LlmEdgeConfig } from '../edge/llm/run-model-call';
import type { Logger } from '../obs/logger';

export const DIMENSAO_DE_VENDAS = 'sales_outcome';
const DATASET = 'live';

/** Os números da comparação. Constantes aqui, e não espalhadas pelas consultas. */
export const REGRA_DE_VENDAS = {
  janelaDias: 14,
  /** Quem ouviu o preço há menos que isto ainda pode comprar: não conta como perdida. */
  horasParaContarComoPerdida: 36,
  minimoDeGanhas: 5,
  minimoDePerdidas: 5,
  amostraPorLado: 6,
  mensagensPorConversa: 30,
  caracteresPorMensagem: 280,
  apoioMinimoEmGanhas: 3,
  maximoDeLicoes: 3,
  pendentesQueSeguramARodada: 3,
} as const;

export interface MensagemDaConversa {
  direction: string;
  body: string | null;
}

const PRECO_DITO = /R\$\s?\d|\b\d+(?:[.,]\d+)?\s*reais?\b/i;

/**
 * O TRECHO DA NEGOCIAÇÃO: de pouco antes de o preço aparecer até o fim. O começo da conversa
 * (saudação, leitura) é igual em quem compra e em quem não compra, e só gastaria o contexto.
 * Sem preço dito, vale o fim da conversa. Pura.
 */
export function recorteDaNegociacao(mensagens: readonly MensagemDaConversa[]): MensagemDaConversa[] {
  const comTexto = mensagens.filter((m) => (m.body ?? '').trim() !== '');
  const preco = comTexto.findIndex((m) => m.direction === 'outbound' && PRECO_DITO.test(m.body ?? ''));
  const inicio = preco === -1 ? Math.max(0, comTexto.length - REGRA_DE_VENDAS.mensagensPorConversa) : Math.max(0, preco - 6);
  return comTexto.slice(inicio, inicio + REGRA_DE_VENDAS.mensagensPorConversa);
}

export function transcricao(mensagens: readonly MensagemDaConversa[]): string {
  return recorteDaNegociacao(mensagens)
    .map((m) => {
      const corpo = (m.body ?? '').replace(/\s+/g, ' ').trim().slice(0, REGRA_DE_VENDAS.caracteresPorMensagem);
      return `${m.direction === 'inbound' ? 'PESSOA' : 'AGENTE'}: ${corpo}`;
    })
    .join('\n');
}

export function promptDeComparacao(ganhas: readonly string[], perdidas: readonly string[]): string {
  const bloco = (rotulo: string, lista: readonly string[]) =>
    lista.map((t, i) => `--- ${rotulo} ${i + 1} ---\n${t}`).join('\n\n');
  return [
    'Você analisa atendimentos de venda por WhatsApp feitos por um agente de IA. Abaixo há conversas',
    'que TERMINARAM EM COMPRA (GANHA) e conversas em que a pessoa ouviu o preço e NÃO comprou (PERDIDA).',
    'Todas começam pouco antes de o preço ser dito.',
    '',
    'Tarefa: encontre até 3 coisas que o AGENTE fez nas GANHAS e que não fez (ou fez ao contrário) nas',
    'PERDIDAS. Só vale o que o agente controla: o que ele disse, em que ordem, como respondeu.',
    '',
    'Regras, sem exceção:',
    '- Cada lição precisa aparecer em pelo menos 3 conversas GANHAS. Cite os números delas.',
    '- Se a diferença for da PESSOA (tinha dinheiro, já queria) e não do agente, NÃO é lição.',
    '- NÃO proponha baixar o preço, dar desconto mais cedo ou valor menor.',
    '- NÃO proponha prometer resultado, garantir efeito, criar urgência, vaga limitada ou prazo.',
    '- NÃO proponha afirmar nada sobre outras pessoas (rival, traição) nem explorar medo.',
    '- Não cite nome, telefone nem dado de ninguém. Escreva a lição como instrução geral, em',
    '  português, no imperativo, em até 3 linhas.',
    '- Se não houver padrão que se sustente, devolva a lista vazia. Lista vazia é resposta certa.',
    '',
    'Responda SOMENTE JSON:',
    '{"licoes":[{"regra":"...","ganhas":[1,2,3],"perdidas":[1,4],"por_que":"uma frase com o que você viu"}]}',
    '',
    '=== GANHAS ===',
    bloco('GANHA', ganhas),
    '',
    '=== PERDIDAS ===',
    bloco('PERDIDA', perdidas),
  ].join('\n');
}

/**
 * A lição que NÃO vira proposta, diga o modelo o que disser. O pedido já proíbe; aqui é a rede.
 * Errar para este lado custa uma proposta a menos; errar para o outro põe na tela do dono, com
 * cara de "aprendido com vendas", uma instrução de pressionar gente ou de queimar margem.
 */
const PROIBIDO: readonly RegExp[] = [
  /\bdescont|\bvalor\s+menor\b|\bbaix\w+\s+(?:o\s+)?(?:valor|pre[çc]o)|\bmais\s+barat|\babat/i,
  /\bgarant|\bcerteza\s+de\b|\bresultado\s+(?:certo|garantido)|\bvai\s+(?:voltar|funcionar|dar\s+certo)\b|\bprometa\b/i,
  /[úu]ltima\s+vaga|\bs[óo]\s+hoje\b|vagas?\s+limitad|\burg[êe]ncia|\bprazo\s+(?:curto|final)|\bescassez/i,
  /\brival\b|\btrai[çc][ãa]o|\bamante\b|\boutra\s+(?:mulher|pessoa)\b|\bmedo\b|\bamea[çc]/i,
];

export function licaoProibida(regra: string): boolean {
  return PROIBIDO.some((re) => re.test(regra));
}

export interface LicaoDeVenda {
  regra: string;
  /** Índices (base 0) das conversas ganhas da amostra em que a lição apareceu. */
  ganhas: number[];
  perdidas: number[];
  porQue: string;
}

const indices = (v: unknown, total: number): number[] => {
  if (!Array.isArray(v)) return [];
  const vistos = new Set<number>();
  for (const x of v) {
    const n = typeof x === 'number' ? x : Number(x);
    if (Number.isInteger(n) && n >= 1 && n <= total) vistos.add(n - 1);
  }
  return [...vistos].sort((a, b) => a - b);
};

/** O que sobra da resposta do modelo depois das travas. Pura. */
export function licoesValidas(saida: unknown, nGanhas: number, nPerdidas: number): LicaoDeVenda[] {
  const lista = (saida as { licoes?: unknown } | null)?.licoes;
  if (!Array.isArray(lista)) return [];
  const validas: LicaoDeVenda[] = [];
  for (const bruta of lista) {
    const l = bruta as { regra?: unknown; ganhas?: unknown; perdidas?: unknown; por_que?: unknown };
    const regra = typeof l.regra === 'string' ? l.regra.trim() : '';
    if (regra.length < 20 || regra.length > 500) continue;
    if (licaoProibida(regra)) continue;
    const ganhas = indices(l.ganhas, nGanhas);
    if (ganhas.length < REGRA_DE_VENDAS.apoioMinimoEmGanhas) continue;
    validas.push({
      regra,
      ganhas,
      perdidas: indices(l.perdidas, nPerdidas),
      porQue: typeof l.por_que === 'string' ? l.por_que.trim().slice(0, 300) : '',
    });
    if (validas.length === REGRA_DE_VENDAS.maximoDeLicoes) break;
  }
  return validas;
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('saída do modelo sem JSON');
  return JSON.parse(text.slice(start, end + 1));
}

interface ContatoDaAmostra {
  contact_id: string;
  ate: Date;
}

async function conversa(pool: pg.Pool, orgId: string, c: ContatoDaAmostra): Promise<MensagemDaConversa[]> {
  const { rows } = await pool.query<MensagemDaConversa>(
    `select direction, body from (
       select direction, body, created_at from messages
       where organization_id = $1 and contact_id = $2 and body is not null and created_at <= $3
       order by created_at desc limit 80
     ) m order by created_at asc`,
    [orgId, c.contact_id, c.ate],
  );
  return rows;
}

export interface RodadaDeVendas {
  organization_id: string;
  ganhas: number;
  perdidas: number;
  propostas: number;
  motivo?: 'amostra_pequena' | 'fila_cheia' | 'sem_padrao';
}

async function rodarParaAOrganizacao(
  pool: pg.Pool,
  llmCfg: LlmEdgeConfig,
  orgId: string,
  runId: string,
  log: Logger,
): Promise<RodadaDeVendas> {
  const r = REGRA_DE_VENDAS;
  const { rows: fila } = await pool.query<{ n: string }>(
    `select count(*) as n from flywheel_distiller_proposals
     where organization_id = $1 and applied_at is null and dismissed_at is null
       and evidence->>'dimension' = $2`,
    [orgId, DIMENSAO_DE_VENDAS],
  );
  if (Number(fila[0]?.n ?? 0) >= r.pendentesQueSeguramARodada) {
    return { organization_id: orgId, ganhas: 0, perdidas: 0, propostas: 0, motivo: 'fila_cheia' };
  }

  // GANHAS: cobrança no período, sem estorno. `ate` = a hora da compra — o que veio depois é entrega.
  const { rows: ganhas } = await pool.query<{ contact_id: string; ate: Date; total: string }>(
    `select g.contact_id, g.ate, count(*) over () as total from (
       select r.contact_id, min(r.occurred_at) as ate
       from revenue_ledger r
       where r.organization_id = $1 and r.event_type = 'charge' and r.contact_id is not null
         and r.occurred_at > now() - make_interval(days => $2)
         and not exists (
           select 1 from revenue_ledger e
           where e.organization_id = r.organization_id and e.external_event_id = r.external_event_id
             and e.event_type in ('refund', 'chargeback'))
       group by r.contact_id
     ) g order by g.ate desc limit $3`,
    [orgId, r.janelaDias, r.amostraPorLado],
  );
  const totalDeGanhas = Number(ganhas[0]?.total ?? 0);

  // PERDIDAS: ouviu o preço dentro da janela, já passou o tempo de decidir, e nunca comprou.
  const { rows: perdidas } = await pool.query<{ contact_id: string; ate: Date; total: string }>(
    `select p.contact_id, now() as ate, count(*) over () as total from (
       select m.contact_id, min(m.created_at) as preco_em
       from messages m
       where m.organization_id = $1 and m.direction = 'outbound' and m.contact_id is not null
         and m.created_at > now() - make_interval(days => $2)
         and m.created_at < now() - make_interval(hours => $3)
         and m.body ~ 'R\\$ ?[0-9]'
         and not exists (
           select 1 from revenue_ledger r
           where r.organization_id = m.organization_id and r.contact_id = m.contact_id and r.event_type = 'charge')
       group by m.contact_id
     ) p order by p.preco_em desc limit $4`,
    [orgId, r.janelaDias, r.horasParaContarComoPerdida, r.amostraPorLado],
  );
  const totalDePerdidas = Number(perdidas[0]?.total ?? 0);

  if (totalDeGanhas < r.minimoDeGanhas || totalDePerdidas < r.minimoDePerdidas) {
    return { organization_id: orgId, ganhas: totalDeGanhas, perdidas: totalDePerdidas, propostas: 0, motivo: 'amostra_pequena' };
  }

  const textoDasGanhas: string[] = [];
  for (const c of ganhas) textoDasGanhas.push(transcricao(await conversa(pool, orgId, c)));
  const textoDasPerdidas: string[] = [];
  for (const c of perdidas) textoDasPerdidas.push(transcricao(await conversa(pool, orgId, c)));

  const chamada = await runModelCall(
    pool,
    llmCfg,
    {
      tenantId: orgId,
      purpose: 'flywheel_distiller',
      messages: [{ role: 'user', content: promptDeComparacao(textoDasGanhas, textoDasPerdidas) }],
    },
    { log },
  );
  const licoes = licoesValidas(parseJson(chamada.result.text), ganhas.length, perdidas.length);

  for (const l of licoes) {
    await pool.query(
      `insert into flywheel_distiller_proposals
         (organization_id, run_id, dataset, type, target, content, evidence)
       values ($1, $2, $3, 'playbook_bullet', 'tenant', $4, $5)`,
      [
        orgId,
        runId,
        DATASET,
        l.regra,
        JSON.stringify({
          dimension: DIMENSAO_DE_VENDAS,
          janela_dias: r.janelaDias,
          ganhas_no_periodo: totalDeGanhas,
          perdidas_no_periodo: totalDePerdidas,
          ganhas_lidas: ganhas.length,
          perdidas_lidas: perdidas.length,
          apareceu_em_ganhas: l.ganhas.length,
          apareceu_em_perdidas: l.perdidas.length,
          por_que: l.porQue,
          contatos_ganhos: l.ganhas.map((i) => ganhas[i]!.contact_id),
          contatos_perdidos: l.perdidas.map((i) => perdidas[i]!.contact_id),
        }),
      ],
    );
  }
  return {
    organization_id: orgId,
    ganhas: totalDeGanhas,
    perdidas: totalDePerdidas,
    propostas: licoes.length,
    ...(licoes.length === 0 ? { motivo: 'sem_padrao' as const } : {}),
  };
}

/**
 * Uma rodada: para cada organização que vendeu no período, compara e propõe. Uma organização que
 * falha não derruba as outras — o erro fica no log, com a organização, e a rodada segue.
 */
export async function runSalesLearningOnce(
  pool: pg.Pool,
  llmCfg: LlmEdgeConfig,
  opts: { log: Logger },
): Promise<RodadaDeVendas[]> {
  const runId = crypto.randomUUID();
  const { rows: orgs } = await pool.query<{ organization_id: string }>(
    `select distinct organization_id from revenue_ledger
     where event_type = 'charge' and contact_id is not null
       and occurred_at > now() - make_interval(days => $1)`,
    [REGRA_DE_VENDAS.janelaDias],
  );
  const rodadas: RodadaDeVendas[] = [];
  for (const { organization_id } of orgs) {
    try {
      const rodada = await rodarParaAOrganizacao(pool, llmCfg, organization_id, runId, opts.log);
      rodadas.push(rodada);
      opts.log.info('flywheel: aprendizado com vendas', { run_id: runId, ...rodada });
    } catch (err) {
      opts.log.error('flywheel: aprendizado com vendas falhou', {
        run_id: runId,
        organization_id,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  return rodadas;
}
