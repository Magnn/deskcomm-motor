import { describe, expect, it } from "vitest";

import { ehNarracaoDoProprioAgente, falaEmTextoSolto } from "./fala-em-texto-solto";

describe("falaEmTextoSolto", () => {
  it("o modelo escreveu a resposta e não acionou ferramenta nenhuma: o texto sai (o caso medido em produção)", () => {
    expect(falaEmTextoSolto({ text: "  Esperança, meu bem.  ", steps: [{ toolCalls: [] }] }, 0)).toBe("Esperança, meu bem.");
    expect(falaEmTextoSolto({ text: "Oi", steps: null }, 0)).toBe("Oi");
  });

  it("se alguma mensagem já saiu no turno, o texto final não é enviado de novo", () => {
    expect(falaEmTextoSolto({ text: "resumo do que eu disse", steps: [{ toolCalls: [] }] }, 2)).toBeNull();
  });

  it("quem acionou ferramenta e não falou escolheu o silêncio — é respeitado", () => {
    const turno = { text: "passei para a equipe", steps: [{ toolCalls: [{ toolName: "request_human_handoff" }] }, { toolCalls: [] }] };
    expect(falaEmTextoSolto(turno, 0)).toBeNull();
  });

  it("sem texto, nada a enviar", () => {
    expect(falaEmTextoSolto({ text: "   ", steps: [] }, 0)).toBeNull();
    expect(falaEmTextoSolto({ text: null }, 0)).toBeNull();
    expect(falaEmTextoSolto({}, 0)).toBeNull();
  });
});

describe("a narração do próprio agente não é fala", () => {
  // Textos que SAÍRAM para clientes em produção entre 07 e 09/10/2026 (nomes trocados).
  it.each([
    'Não envio nada. O lead encerrou cordialmente ("Amém" à despedida do Motor 19), já está marcado como lost e registrado "não procurar".',
    "O toque de silêncio 1/3 que dispararia agora não se aplica: não é silêncio a resgatar, é um encerramento a respeitar. Reabrir a cadência aqui seria insistir com quem já disse não. Nenhuma ação neste turno.",
    'Não vou enviar nada. O lead encerrou a conversa com "Adeus!" logo depois de saber que o atendimento é feito por IA, e a memória já está marcada como "não procurar".',
    "Nenhuma ação de envio, nenhum avanço de funil (permanece `lost`) e nenhuma nota nova — o registro de \"não procurar\" já cobre este caso.",
    "Não vou enviar nada agora — o motivo: O lead está em silêncio desde 08/10 17:56, e às 13:07 de hoje já caiu a chamada de retomada 1/3.",
    'Não envio nada. Maria pediu explicitamente "Deixa pra lá", o atendimento foi encerrado com dignidade (Motor 19) e há nota registrada como "NÃO PROCURAR".',
    "A conduta correta é não reabrir a cadência agora: aguardar o intervalo previsto antes do próximo toque. Se o lead responder por iniciativa própria, retomo do ponto combinado.",
  ])("⭐ não sai para a pessoa: %s", (texto) => {
    expect(ehNarracaoDoProprioAgente(texto)).toBe(true);
    expect(falaEmTextoSolto({ text: texto, steps: [{ toolCalls: [] }] }, 0)).toBeNull();
  });

  it.each([
    "Esperança, meu bem.",
    "O trabalho está firme no meu altar com o seu nome e o dele. O seu papel agora é só confiar e não procurar ele.",
    "Oi, Juliana, meu bem. Passando só pra lembrar que sigo com o seu caso aqui no coração. Como ficou aquele empréstimo?",
    "Não vou te enviar nada que você não pediu, fica tranquila. Quer que eu te explique como funciona?",
    "Nosso funil de atendimento funciona assim: você agenda, a gente confirma e pronto.",
    "O lead que você recebeu ontem já foi atendido pela nossa equipe, pode ficar tranquilo.",
    "Seu pedido foi marcado como enviado e chega em até 3 dias úteis.",
  ])("fala de verdade continua saindo: %s", (texto) => {
    expect(ehNarracaoDoProprioAgente(texto)).toBe(false);
    expect(falaEmTextoSolto({ text: texto, steps: [{ toolCalls: [] }] }, 0)).toBe(texto);
  });

  // Textos que SAÍRAM para clientes em produção em 10 e 11/10/2026, depois da primeira lista (nomes trocados).
  it.each([
    "Nenhuma mensagem enviada: a conversa já estava encerrada e a lead pediu, na prática, que o contato fosse respeitado.",
    "Nenhum avanço de funil (segue lost, sem evidência nova) e nenhum aprendizado durável novo a registrar. Encerro o turno sem enviar mensagem.",
    'Não vou enviar toque agora: a Maria se despediu há 4 minutos ("Boa noite, amiga") e a conversa já tinha encerrado com a porta aberta.',
    'A mensagem mais recente veio vazia (sem texto). O histórico mostra que a atendente pediu "Pode ser?" e o lead respondeu com mensagem vazia.',
    "Nenhuma mensagem enviada: a última interação não contém texto utilizável e o histórico já indica encerramento cordial.",
    "Um follow-up automático de silêncio não se aplica a uma recusa explícita — insistir seria pressão e queimaria a porta que ficou aberta.",
    "O checkpoint anterior é explícito: recusa final registrada, não reengajar, não reabrir leitura.",
    "Não vou reengajar aqui. O contexto é claro: Maria recusou o trabalho e se despediu.",
    "Nada a marcar no funil (segue em objeção financeira). Nada durável novo para salvar.",
  ])("⭐ também não sai para a pessoa: %s", (texto) => {
    expect(ehNarracaoDoProprioAgente(texto)).toBe(true);
    expect(falaEmTextoSolto({ text: texto, steps: [{ toolCalls: [] }] }, 0)).toBeNull();
  });

  it.each([
    "Meu bem, a sua última mensagem chegou aqui sem texto, não consegui ler o que você quis me mandar. Se quiser me escrever de novo, é só mandar.",
    "Seu pedido passou para o estágio de separação e você recebe o código de rastreio ainda hoje.",
    "Te mando um toque amanhã cedo pra gente fechar isso, combinado?",
  ])("um sinal fraco dito À pessoa continua sendo fala: %s", (texto) => {
    expect(ehNarracaoDoProprioAgente(texto)).toBe(false);
  });
});

describe("turno que o sistema abriu não usa o texto solto", () => {
  const fala = { text: "Oi, meu bem, passando pra saber como você está.", steps: [{ toolCalls: [] }] };

  it("respondendo a uma mensagem da pessoa, a fala sai", () => {
    expect(falaEmTextoSolto(fala, 0, true)).toBe(fala.text);
  });

  it("⭐ em retomada de silêncio ou retorno agendado, o silêncio é respeitado", () => {
    expect(falaEmTextoSolto(fala, 0, false)).toBeNull();
  });
});
