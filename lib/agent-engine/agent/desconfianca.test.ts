import { describe, expect, it } from 'vitest';

import { blocoDaDesconfianca, ehDesconfianca, rodadaComDesconfianca } from './desconfianca';

describe('ehDesconfianca', () => {
  // Falas reais de leads (produção, 10–13/10/2026), sem nome.
  it.each([
    'Pois é golpe',
    'Rapaz aí e golpe',
    'Será que isso não é golpe gente?',
    'Golpista',
    'Tu é uma daquelas golpistas das internet Que quer dinheiro',
    'Não, e eu também tô com medo de ser golpe, porque eu já caí muito de golpe também',
    'Tenho medo esta cheio de golpe, isso é golpe',
    'não é golpe né?',
    'isso tá com cara de golpe',
    'parece golpe',
    'vou te denunciar',
    'vou bloquear esse numero',
    'isso é spam',
    'sua picareta',
    'charlatã',
  ])('desconfiança: %s', (frase) => {
    expect(ehDesconfianca(frase)).toBe(true);
  });

  // A história da pessoa não é acusação: num atendimento sobre a vida dela, é o assunto.
  it.each([
    'Sim levei um golpe',
    'Não o golpe foi de uma pessoa que falou que ia trazer ele de volta pra mim 😔',
    'Porque uma vez eu sofri um golpe muito grande muito grande e vivia sendo ameaçada',
    'Na saúde tive um AVC, no financeiro cai em um golpe do banco',
    'Eu denunciei a irmã dele',
    'ele me bloqueou no whatsapp',
    'quero desbloquear meus caminhos',
    'ok, pode mandar o pix',
    'sim',
    '',
  ])('não é desconfiança: %s', (frase) => {
    expect(ehDesconfianca(frase)).toBe(false);
  });

  it('aceita corpo nulo', () => {
    expect(ehDesconfianca(null)).toBe(false);
    expect(ehDesconfianca(undefined)).toBe(false);
  });
});

describe('rodadaComDesconfianca', () => {
  const agente = (body: string) => ({ direction: 'outbound', body });
  const pessoa = (body: string) => ({ direction: 'inbound', body });

  it('olha só o que a pessoa escreveu depois da última fala do agente', () => {
    expect(rodadaComDesconfianca([agente('o trabalho custa R$ 60'), pessoa('hum'), pessoa('isso é golpe')])).toBe(true);
    // Desconfiou antes e depois seguiu: a fala mais recente manda.
    expect(rodadaComDesconfianca([pessoa('isso é golpe?'), agente('entendo o seu receio'), pessoa('tá, me manda o pix')])).toBe(
      false,
    );
    expect(rodadaComDesconfianca([])).toBe(false);
  });
});

describe('blocoDaDesconfianca', () => {
  it('vazio quando não houve desconfiança', () => {
    expect(blocoDaDesconfianca(false)).toBe('');
  });

  it('proíbe valor, link, pagamento e pressão neste turno', () => {
    const bloco = blocoDaDesconfianca(true);
    expect(bloco).toContain('UMA mensagem');
    expect(bloco).toMatch(/valor, mandar link, Pix/);
    expect(bloco).toMatch(/urgência, vaga ou prazo/);
  });
});
