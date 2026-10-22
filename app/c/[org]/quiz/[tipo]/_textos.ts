/**
 * Os textos dos quizzes de uma pessoa, passados pelo dicionário no servidor (`page.tsx`) e entregues prontos ao
 * navegador (`_quiz.tsx`). O que é igual ao quiz da sinastria usa a mesma frase do dicionário.
 */
export function textosDoQuizDePessoa(t: (texto: string) => string, tipo: "prosperidade" | "caminhos") {
  const prosperidade = tipo === "prosperidade";
  return {
    titulo: prosperidade ? t("Qual é o seu número da prosperidade?") : t("O que abre os seus caminhos?"),
    chamada: prosperidade
      ? t("A numerologia soma os algarismos da data de nascimento até um único número. Veja a conta feita na hora e o que o seu número diz sobre como você prospera.")
      : t("Quatro toques e uma carta-chave do tarô para o momento: o que ele pede para os caminhos se abrirem."),
    tempoDoQuiz: prosperidade ? t("Grátis · cerca de 2 minutos · conta feita à vista") : t("Grátis · cerca de 1 minuto · resultado na hora"),
    mecanismo: prosperidade
      ? t("Na numerologia, a data de nascimento se reduz a um único número, somando os algarismos até sobrar um de 1 a 9. O 11 e o 22 são números mestres e não se reduzem. Cada número descreve um jeito de lidar com escolhas, trabalho e dinheiro.")
      : t("Cada resposta aponta um de quatro perfis: Recomeço, Clareza, Coragem ou Paz interior. O perfil que aparecer mais vezes é o seu, e cada perfil tem uma carta-chave do tarô. Você vai ver a conta na próxima tela."),
    frases: prosperidade
      ? [t("Dinheiro é um dos lugares onde a gente mais se repete. A numerologia ajuda a ver o padrão."), t("Agora, a sua data. É dela que sai o seu número.")]
      : [t("Caminho travado quase sempre é uma decisão parada. Vamos ver qual."), t("Mais uma, e a sua carta aparece.")],
    comoFunciona: t("Como a leitura funciona"),
    assinatura: t("A Cigana"),
    voltar: t("Voltar"),
    quandoVoceNasceu: t("Quando você nasceu?"),
    dataMes: t("Primeiro, o mês"),
    dataDia: t("Agora, o dia"),
    dataDecada: t("A década"),
    dataAno: t("E o ano"),
    meses: [t("Jan"), t("Fev"), t("Mar"), t("Abr"), t("Mai"), t("Jun"), t("Jul"), t("Ago"), t("Set"), t("Out"), t("Nov"), t("Dez")],
    calculando: prosperidade ? t("Fazendo a conta") : t("Lendo as suas respostas"),
    somando: t("Somando os algarismos"),
    reduzindo: t("Reduzindo"),
    numeroDoDestino: t("Número do destino"),
    anoPessoalDe: t("Ano pessoal de"),
    maioria: t("O perfil que apareceu mais"),
    cartaChave: t("Carta-chave"),
    vezes: t("de"),
    seuAnoPessoal: t("O seu ano pessoal de"),
    oQueEleAnoPede: t("O que esse ano pede, e como usar o seu número nele, está na leitura completa."),
    voceContou: t("Você contou que"),
    comDinheiroE: t("Você contou que, com dinheiro, é mais de"),
    eQuePesa: t("e que o que mais pesa é"),
    quePrecisaDe: t("o que mais precisa agora é"),
    ponte: prosperidade
      ? t("O número explica o padrão. O que fazer com ele nas próximas semanas está no mapa completo.")
      : t("A carta diz qual porta. O ritual diz como passar por ela, um passo por dia, durante 7 dias."),
    garantia: t("Se não fizer sentido para você, peça o reembolso em até 7 dias. Basta uma mensagem."),
    produto: prosperidade ? t("Seu Mapa da Prosperidade") : t("Seu Ritual de Abertura de Caminhos"),
    itens: prosperidade
      ? [t("O que o seu número diz sobre como você prospera"), t("Os talentos que você pode usar"), t("O padrão que costuma atrapalhar"), t("O que o seu ano pessoal pede, com três atitudes práticas"), t("Uma intenção para escrever e guardar")]
      : [t("O que o seu perfil e a sua carta-chave mostram sobre o momento"), t("O que separar em casa"), t("O ritual de 7 dias, um passo por dia"), t("Como encerrar e o que observar depois")],
    soOComeco: prosperidade
      ? t("Isso é só o começo. O mapa completo mostra os seus talentos e três atitudes práticas para as próximas semanas.")
      : t("Isso é só o começo. O ritual completo traz um passo por dia, durante 7 dias, para você fazer em casa."),
    rodape: t("Orientação espiritual e de autoconhecimento. Não substitui ajuda médica, psicológica ou jurídica, e não há promessa de resultado."),
    sobreVoce: t("Sobre você"),
    seuNome: t("Seu primeiro nome"),
    continuar: t("Continuar"),
    paraOnde: t("Para onde mando o seu resultado?"),
    seuEmail: t("Seu melhor e-mail"),
    semSpam: t("Guardamos o seu e-mail para mandar o seu resultado e, de vez em quando, conteúdos nossos. Nada de spam: você sai quando quiser."),
    verResultado: t("Ver o meu resultado"),
    pagamentoUnico: t("Pagamento único. Você lê aqui mesmo, logo depois de pagar."),
    pagarPix: t("Pagar com Pix"),
    pagarCartao: t("Pagar com cartão"),
    gerando: t("Gerando…"),
    prefiroCartao: t("Prefiro pagar com cartão"),
    noBanco: t("No banco aparece Stripe Brasil, a empresa de pagamentos."),
    quaseLa: t("Quase lá"),
    pagueComPix: t("Pague com Pix Copia e Cola"),
    pixPasso1: t("Toque em “Copiar código”."),
    pixPasso2: t("No app do seu banco, entre em Pix e escolha Pix Copia e Cola."),
    pixPasso3: t("Cole, confira o valor e confirme."),
    copiado: t("Código copiado ✓"),
    copiar: t("Copiar código"),
    pagueNoCartao: t("Pague no cartão"),
    abrirPagamento: t("Abrir o pagamento"),
    esperando: t("Esperando a confirmação do pagamento"),
    assimQueCair: t("Assim que o pagamento cair, a sua leitura aparece aqui. Pode deixar esta página aberta."),
    confirmado: t("Pagamento confirmado"),
    escrevendo: t("Escrevendo a sua leitura…"),
    menosDeUmMinuto: t("Leva menos de um minuto. Não feche a página."),
    guarde: t("Guarde esta página: o endereço abre a sua leitura neste aparelho."),
    seuResultado: t("O seu resultado"),
    naoFoiPossivel: t("Não foi possível continuar agora. Tente de novo."),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
  };
}

export type TextosDoQuizDePessoa = ReturnType<typeof textosDoQuizDePessoa>;
