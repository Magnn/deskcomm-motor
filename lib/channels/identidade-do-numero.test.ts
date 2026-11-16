import { describe, expect, it } from 'vitest';

import { interpolarVariaveisDoContato } from '@/lib/agent-engine/agent/variaveis-do-contato';
import { nomeNoPerfil } from '@/lib/agent-engine/edge/crm/session-reconciler';

import { blocoDoNomeNoNumero, telefoneParaExibir } from './identidade-do-numero';

describe('identidade do número', () => {
  it('o bloco põe o nome do perfil e o telefone deste número', () => {
    const bloco = blocoDoNomeNoNumero({ nome: 'Estela', telefone: '556981084871' });
    expect(bloco).toContain('SEU NOME NESTE WHATSAPP: Estela.');
    expect(bloco).toContain('+556981084871');
    // "Está escrito [nome]" é o nome no perfil do número, não o da pessoa (16/11/2026).
    expect(bloco).toContain('"está escrito"');
    expect(bloco).toContain('nunca chame a pessoa por esse nome');
    expect(blocoDoNomeNoNumero({ nome: '  ', telefone: '556981084871' })).toBe('');
    expect(blocoDoNomeNoNumero({ nome: null, telefone: null })).toBe('');
  });

  it('telefone sai com + e só dígitos; curto demais some', () => {
    expect(telefoneParaExibir('556981087471')).toBe('+556981087471');
    expect(telefoneParaExibir('+55 69 8108-7471')).toBe('+556981087471');
    expect(telefoneParaExibir('123')).toBe('');
    expect(telefoneParaExibir(null)).toBe('');
  });

  it('o cartão do fluxo resolve {{meu_nome}} e {{meu_numero}} pelo número da conversa', () => {
    const dados = { nome: 'Ana', telefone: '+5511999', email: null, etapa: null, meuNome: 'Suzana', meuNumero: '+556981105076' };
    expect(interpolarVariaveisDoContato('{{meu_nome}}', dados)).toBe('Suzana');
    expect(interpolarVariaveisDoContato('{{meu_numero}}', dados)).toBe('+556981105076');
    // Sem o número conhecido, a variável some (e o cartão sem telefone é pulado por quem chama).
    expect(interpolarVariaveisDoContato('{{meu_numero}}', { ...dados, meuNumero: null })).toBe('');
  });

  it('o nome do perfil vem do me.pushName do transporte', () => {
    expect(nomeNoPerfil({ me: { pushName: ' Estela ' } })).toBe('Estela');
    expect(nomeNoPerfil({ me: null })).toBeNull();
    expect(nomeNoPerfil({ me: { pushName: 42 } })).toBeNull();
  });
});

describe('{{meu_nome}} no roteiro', () => {
  it('troca no molde literal pelo nome do perfil', async () => {
    const { trocarMeuNome } = await import('./identidade-do-numero');
    expect(trocarMeuNome('Me chamo Cigana {{meu_nome}} e vou cuidar de você. {{ meu_nome }}', 'Estela')).toBe(
      'Me chamo Cigana Estela e vou cuidar de você. Estela',
    );
    expect(trocarMeuNome('sem variável', 'Estela')).toBe('sem variável');
  });
});
