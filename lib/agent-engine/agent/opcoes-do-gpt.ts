/**
 * As opções do nó «GPT» (`ai_generic`) que o construtor já oferece — o que cada uma
 * FAZ no turno. Puro de propósito: sem banco, sem modelo, testável linha a linha.
 *
 * Até aqui a tela salvava modelo, temperatura, tokens, contexto, leitura de mídia,
 * personalidade, base de informações, restrições e «enviar resultado», e o turno só
 * lia o `prompt`. O nó respondia igual com qualquer ajuste, e ninguém via.
 *
 * O formato do payload é IDÊNTICO ao `generic_ai_opcoes` de `lib/followup/engine.ts`
 * (o agent-engine não importa `followup/*`, só o contrato do payload).
 */
import type { LeadContext, LeadContextMessage } from '../edge/crm/get-lead-context';

export interface OpcoesDoGpt {
  modelo_gpt?: string;
  max_tokens?: number;
  temperature?: number;
  enviar_resultado_texto?: boolean;
  manter_contexto?: boolean;
  leitura_imagem_pdf?: boolean;
  ativar_personalidade?: boolean;
  ativar_base_informacoes?: boolean;
  ativar_restricoes?: boolean;
  salvar_em_campo?: boolean;
}

// ─── modelo ────────────────────────────────────────────────────────────────

export interface ConfigDeModeloDaOrg {
  provider: string;
  enabledModels: readonly string[];
}

export type MotivoDoModelo = 'nao_escolhido' | 'aplicado' | 'provedor_sem_openai' | 'nao_habilitado';

/**
 * O seletor do construtor lista modelos da OpenAI. O provedor da organização manda:
 * mandar «gpt-4o» para uma organização que só tem Anthropic falharia a chamada
 * inteira. Então o modelo escolhido só vale onde ele existe — na OpenAI (id cru) e
 * na OpenRouter (prefixo `openai/`); em qualquer outro provedor o nó usa o modelo
 * padrão da organização, e o motivo volta para o registro do passo (nunca silêncio).
 */
export function modeloEfetivo(
  org: ConfigDeModeloDaOrg,
  modeloGpt: string | undefined,
): { model: string | undefined; motivo: MotivoDoModelo } {
  const escolhido = modeloGpt?.trim();
  if (!escolhido) return { model: undefined, motivo: 'nao_escolhido' };
  let id: string;
  if (org.provider === 'openai') id = escolhido;
  else if (org.provider === 'openrouter') id = escolhido.includes('/') ? escolhido : `openai/${escolhido}`;
  else return { model: undefined, motivo: 'provedor_sem_openai' };
  if (org.enabledModels.length > 0 && !org.enabledModels.includes(id)) {
    return { model: undefined, motivo: 'nao_habilitado' };
  }
  return { model: id, motivo: 'aplicado' };
}

export function temperaturaValida(t: number | undefined): number | undefined {
  if (t === undefined || !Number.isFinite(t)) return undefined;
  return Math.min(2, Math.max(0, t));
}

// ─── contexto ──────────────────────────────────────────────────────────────

function ehMidia(m: LeadContextMessage): boolean {
  return m.type !== undefined && m.type !== 'text' && (m.media_mime ?? null) !== null;
}

/**
 * `manter_contexto: false` tira o histórico (o modelo vê só o contato);
 * `leitura_imagem_pdf: false` troca o texto derivado de mídia (transcrição, visão,
 * PDF) pelo marcador do tipo. `undefined` mantém o comportamento de sempre.
 */
export function contextoDoNo(context: LeadContext, opcoes: OpcoesDoGpt): LeadContext {
  if (opcoes.manter_contexto === false) return { ...context, messages: [] };
  if (opcoes.leitura_imagem_pdf === false) {
    return {
      ...context,
      messages: context.messages.map((m) => (ehMidia(m) ? { ...m, body: `[${m.type}]` } : m)),
    };
  }
  return context;
}

// ─── variáveis do prompt ───────────────────────────────────────────────────

export interface VariaveisDoPrompt {
  primeiro_nome: string;
  nome: string;
  telefone: string;
  email: string;
  resposta_anterior: string;
  historico_conversa: string;
  etapa_funil: string;
  /** Campos personalizados do lead (`crm_leads.custom_fields`), só os de texto/número. */
  campos: Record<string, string>;
}

export function variaveisDoPrompt(
  context: LeadContext,
  extras: { etapa_funil?: string | null; campos?: Record<string, unknown> | null },
): VariaveisDoPrompt {
  const nome = (context.contact.name ?? '').trim();
  const ultimaDoCliente = [...context.messages].reverse().find((m) => m.direction === 'inbound');
  const campos: Record<string, string> = {};
  for (const [k, v] of Object.entries(extras.campos ?? {})) {
    if (typeof v === 'string' || typeof v === 'number') campos[k] = String(v);
  }
  return {
    primeiro_nome: nome.split(/\s+/)[0] ?? '',
    nome,
    telefone: context.contact.phone ?? '',
    email: context.contact.email ?? '',
    resposta_anterior: ultimaDoCliente?.body ?? '',
    historico_conversa: context.messages
      .map((m) => `${m.direction === 'inbound' ? 'Cliente' : 'Atendente'}: ${m.body}`)
      .join('\n'),
    etapa_funil: extras.etapa_funil ?? '',
    campos,
  };
}

const PADRAO_DE_VARIAVEL = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Troca `{{variavel}}` pelo valor do lead. O que o construtor insere na tela («Inserir
 * variável no cursor») são exatamente estes nomes. Variável sem valor vira texto vazio:
 * deixar `{{etapa_funil}}` cru no prompt faria o modelo ler a chave como se fosse fato.
 */
export function interpolarVariaveis(prompt: string, vars: VariaveisDoPrompt): string {
  return prompt.replace(PADRAO_DE_VARIAVEL, (_m, chave: string) => {
    switch (chave) {
      case 'primeiro_nome':
      case 'nome':
      case 'telefone':
      case 'email':
      case 'resposta_anterior':
      case 'historico_conversa':
      case 'etapa_funil':
        return vars[chave];
      default:
        return vars.campos[chave] ?? '';
    }
  });
}
