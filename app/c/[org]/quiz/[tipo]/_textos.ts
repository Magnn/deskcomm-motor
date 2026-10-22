/**
 * Os textos dos quizzes de uma pessoa, passados pelo dicionário no servidor (`page.tsx`) e entregues prontos ao
 * navegador (`_quiz.tsx`). O que é igual ao quiz da sinastria usa a mesma frase do dicionário.
 */
export function textosDoQuizDePessoa(t: (texto: string) => string, tipo: "prosperidade" | "caminhos") {
  const prosperidade = tipo === "prosperidade";
  return {
    titulo: prosperidade ? t("Qual é o seu número da prosperidade?") : t("O que abre os seus caminhos?"),
    chamada: prosperidade
      ? t("Descubra pela sua data de nascimento como você prospera e o que costuma atrapalhar.")
      : t("Responda 3 perguntas e descubra o que o seu momento pede para os caminhos se abrirem."),
    produto: prosperidade ? t("Seu Mapa da Prosperidade") : t("Seu Ritual de Abertura de Caminhos"),
    itens: prosperidade
      ? [t("O que o seu número diz sobre como você prospera"), t("Os talentos que você pode usar"), t("O padrão que costuma atrapalhar"), t("Três atitudes práticas para as próximas semanas")]
      : [t("O que o seu perfil mostra sobre o seu momento"), t("O que separar em casa"), t("O ritual de 7 dias, um passo por dia"), t("Como encerrar e o que observar depois")],
    soOComeco: prosperidade
      ? t("Isso é só o começo. O mapa completo mostra os seus talentos e três atitudes práticas para as próximas semanas.")
      : t("Isso é só o começo. O ritual completo traz um passo por dia, durante 7 dias, para você fazer em casa."),
    rodape: t("Orientação espiritual e de autoconhecimento. Não substitui ajuda médica, psicológica ou jurídica, e não há promessa de resultado."),
    passo1: t("Passo 1 de 3"),
    passo2: t("Passo 2 de 3"),
    passo3: t("Passo 3 de 3"),
    sobreVoce: t("Sobre você"),
    seuNome: t("Seu primeiro nome"),
    suaData: t("Sua data de nascimento (dd/mm/aaaa)"),
    continuar: t("Continuar"),
    paraOnde: t("Para onde mando o seu resultado?"),
    seuEmail: t("Seu melhor e-mail"),
    semSpam: t("Usamos só para guardar a sua leitura. Nada de spam."),
    verResultado: t("Ver o meu resultado"),
    pagamentoUnico: t("Pagamento único. Você lê aqui mesmo, logo depois de pagar."),
    pagarPix: t("Pagar com Pix"),
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
