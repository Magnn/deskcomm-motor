import { describe, expect, it } from 'vitest';

import type { LeadContext, LeadContextMessage } from '../edge/crm/get-lead-context';
import {
  contextoDoNo,
  interpolarVariaveis,
  modeloEfetivo,
  temperaturaValida,
  variaveisDoPrompt,
} from './opcoes-do-gpt';

function msg(over: Partial<LeadContextMessage>): LeadContextMessage {
  return { direction: 'inbound', body: 'oi', sent_at: '2026-09-30T10:00:00-03:00', ...over };
}

function ctx(messages: LeadContextMessage[]): LeadContext {
  return {
    lead_id: 'c1',
    contact: { name: 'Maria da Silva', phone: '+5511999990000', email: 'm@x.com', tags: [], is_blocked: false },
    conversation_id: 'v1',
    last_human_decision: null,
    messages,
  };
}

describe('modeloEfetivo — o seletor é da OpenAI, o provedor é da organização', () => {
  it('sem escolha, usa o padrão da organização', () => {
    expect(modeloEfetivo({ provider: 'openai', enabledModels: [] }, undefined)).toEqual({
      model: undefined,
      motivo: 'nao_escolhido',
    });
  });

  it('OpenAI: aplica o id cru', () => {
    expect(modeloEfetivo({ provider: 'openai', enabledModels: [] }, 'gpt-4o')).toEqual({
      model: 'gpt-4o',
      motivo: 'aplicado',
    });
  });

  it('OpenRouter: prefixa openai/', () => {
    expect(modeloEfetivo({ provider: 'openrouter', enabledModels: [] }, 'gpt-4o-mini').model).toBe('openai/gpt-4o-mini');
  });

  it('Anthropic: NÃO manda gpt-* (a chamada inteira falharia) e diz por quê', () => {
    expect(modeloEfetivo({ provider: 'anthropic', enabledModels: [] }, 'gpt-4o')).toEqual({
      model: undefined,
      motivo: 'provedor_sem_openai',
    });
  });

  it('respeita enabled_models da organização', () => {
    expect(modeloEfetivo({ provider: 'openai', enabledModels: ['gpt-4o-mini'] }, 'gpt-4o')).toEqual({
      model: undefined,
      motivo: 'nao_habilitado',
    });
  });
});

describe('temperaturaValida', () => {
  it('limita a 0–2 e descarta o que não é número', () => {
    expect(temperaturaValida(0.4)).toBe(0.4);
    expect(temperaturaValida(5)).toBe(2);
    expect(temperaturaValida(-1)).toBe(0);
    expect(temperaturaValida(undefined)).toBeUndefined();
    expect(temperaturaValida(Number.NaN)).toBeUndefined();
  });
});

describe('contextoDoNo', () => {
  const historico = [
    msg({ body: 'quero saber do ritual' }),
    msg({ direction: 'outbound', body: 'claro!' }),
    msg({ type: 'image', media_mime: 'image/jpeg', body: 'foto de uma casa com janelas' }),
  ];

  it('sem opção, não mexe em nada', () => {
    const c = ctx(historico);
    expect(contextoDoNo(c, {})).toBe(c);
  });

  it('manter_contexto=false tira o histórico', () => {
    expect(contextoDoNo(ctx(historico), { manter_contexto: false }).messages).toEqual([]);
  });

  it('leitura_imagem_pdf=false troca o texto derivado pelo marcador do tipo', () => {
    const out = contextoDoNo(ctx(historico), { leitura_imagem_pdf: false });
    expect(out.messages[2]!.body).toBe('[image]');
    expect(out.messages[0]!.body).toBe('quero saber do ritual');
  });

  it('leitura_imagem_pdf=true mantém o derivado', () => {
    expect(contextoDoNo(ctx(historico), { leitura_imagem_pdf: true }).messages[2]!.body).toContain('janelas');
  });
});

describe('interpolarVariaveis — as variáveis que a tela insere', () => {
  const c = ctx([msg({ body: 'pode ser amanhã?' }), msg({ direction: 'outbound', body: 'posso sim' })]);
  const vars = variaveisDoPrompt(c, { etapa_funil: 'Proposta', campos: { peso_altura_lead: '70kg', n: 3, x: { a: 1 } } });

  it('resolve as variáveis fixas', () => {
    expect(interpolarVariaveis('Oi {{primeiro_nome}} ({{nome}}) — {{telefone}} {{email}} em {{etapa_funil}}', vars)).toBe(
      'Oi Maria (Maria da Silva) — +5511999990000 m@x.com em Proposta',
    );
  });

  it('resposta anterior é a última do CLIENTE, e o histórico nomeia quem falou', () => {
    expect(interpolarVariaveis('{{resposta_anterior}}', vars)).toBe('pode ser amanhã?');
    expect(interpolarVariaveis('{{historico_conversa}}', vars)).toBe('Cliente: pode ser amanhã?\nAtendente: posso sim');
  });

  it('campo personalizado do lead (texto ou número); objeto é ignorado', () => {
    expect(interpolarVariaveis('{{peso_altura_lead}}/{{n}}/[{{x}}]', vars)).toBe('70kg/3/[]');
  });

  it('variável sem valor vira vazio, não chave crua para o modelo ler como fato', () => {
    expect(interpolarVariaveis('[{{inexistente}}]', vars)).toBe('[]');
  });
});
