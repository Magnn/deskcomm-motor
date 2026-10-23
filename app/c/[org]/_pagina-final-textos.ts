/**
 * Os textos da página final (`_pagina-final.tsx`), passados pelo dicionário no servidor. O que é igual nos três
 * quizzes mora aqui; o título da oferta vem de cada quiz.
 */
import type { TextosDaPaginaFinal } from "./_pagina-final";

export function textosDaPaginaFinal(t: (texto: string) => string, ofertaSobretitulo: string, ofertaTitulo: string): TextosDaPaginaFinal {
  return {
    oQueTraz: t("O que a leitura completa traz"),
    naLeituraCompleta: t("Na leitura completa"),
    ofertaSobretitulo,
    ofertaTitulo,
    pagamentoUnico: t("Pagamento único. Você lê aqui mesmo, logo depois de pagar."),
    seguro: t("Pagamento seguro · Pix ou cartão · leitura pronta em menos de um minuto"),
    garantiaTitulo: t("7 dias para pedir o reembolso"),
    garantiaTexto: t("Se a leitura não fizer sentido para você, é só mandar uma mensagem em até 7 dias. Sem justificativa."),
    comoFunciona: t("Como funciona"),
    passos: [
      t("Você paga por Pix ou cartão, aqui mesmo."),
      t("A leitura completa aparece nesta página em menos de um minuto, escrita a partir da sua conta."),
      t("O endereço fica salvo neste aparelho: você volta e relê quando quiser."),
    ],
    perguntas: t("Perguntas que nos fazem"),
    depoimentosTitulo: t("Quem já fez a leitura"),
    faq: [
      {
        p: t("Isso é contra a minha fé?"),
        r: t("Não. A leitura é uma ferramenta de autoconhecimento: ela descreve tendências e convida à reflexão. Não pede que você troque de crença nem substitui a sua fé."),
      },
      {
        p: t("Preciso acreditar para funcionar?"),
        r: t("Não. Muita gente faz por curiosidade. O que a leitura entrega é um olhar organizado sobre o seu momento, e você decide o que faz sentido."),
      },
      {
        p: t("Quem escreve a leitura?"),
        r: t("A conta (signos, elementos, números ou perfil) é feita na hora pelas regras da tradição. O texto é escrito por inteligência artificial a partir dessa conta e das suas respostas, com as regras da casa: sem medo, sem promessa e sem dizer o que outra pessoa sente."),
      },
      {
        p: t("A leitura promete algum resultado?"),
        r: t("Não. Ela não garante acontecimento, dinheiro nem a volta de ninguém. É orientação e autoconhecimento, e não substitui ajuda médica, psicológica ou jurídica."),
      },
      {
        p: t("Quando eu recebo?"),
        r: t("Na hora. Assim que o pagamento é confirmado, a leitura aparece nesta mesma página. No Pix, a confirmação leva alguns segundos."),
      },
    ],
    fecharTitulo: t("“E se eu fechar a página agora?”"),
    fecharTexto: t("A prévia fica salva neste aparelho. Mas o que fazer com o seu resultado, nos próximos dias, está só na leitura completa."),
    pagarPix: t("Quero a leitura completa"),
    prefiroCartao: t("Prefiro pagar com cartão"),
    pagarCartao: t("Quero a leitura completa"),
    gerando: t("Gerando…"),
    noBanco: t("No banco aparece Stripe Brasil, a empresa de pagamentos."),
  };
}
