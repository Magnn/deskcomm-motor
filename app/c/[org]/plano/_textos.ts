/**
 * Os textos da página da entrada pelo plano de 7 dias (`./page.tsx`). Os do pagamento são os mesmos dos quizzes —
 * já traduzidos —; os novos têm tradução em `lib/i18n/area/*` e `lib/i18n/dicionario.ts`.
 */
export function textosDaEntrada(t: (texto: string) => string) {
  return {
    sobretitulo: t("7 dias para conhecer"),
    titulo: t("Sete dias com as cartas, os astros e a sua mão."),
    chamada: t("Por {preco}, uma vez só, você abre a sua área e ganha {n} créditos para usar lá dentro."),
    chamadaSemCreditos: t("Por {preco}, uma vez só, você abre a sua área por 7 dias."),
    oQueVem: t("O que vem nos 7 dias"),
    itens: [
      t("{n} créditos de boas-vindas: dá para abrir a leitura completa da sua mão pela foto, ou uma pergunta às cartas."),
      t("A carta do dia e o horóscopo, todas as manhãs."),
      t("Uma pergunta da semana às cartas, respondida inteira."),
      t("Um sonho interpretado por inteiro."),
      t("A guia para conversar por texto, foto ou áudio."),
      t("O seu diário, o grimório e a lua do mês."),
    ],
    semSurpresa: t("Não renova sozinho. No fim dos 7 dias, você escolhe se quer continuar."),
    nome: t("Como você se chama?"),
    email: t("Seu e-mail (é por ele que você volta para a área)"),
    nascimento: t("Data de nascimento (para a carta e o céu falarem de você)"),
    foco: t("O que mais pede a sua atenção agora?"),
    focos: { amor: t("Amor"), dinheiro: t("Dinheiro e trabalho"), caminhos: t("Caminhos"), eu: t("Autoconhecimento") },
    pagarPix: t("Entrar com Pix"),
    pagarCartao: t("Entrar com cartão"),
    soCartao: t("Fora do Brasil o pagamento é no cartão."),
    confira: t("Confira o nome, o e-mail e a data."),
    rodape: t("Orientação espiritual e de autoconhecimento. Não substitui ajuda médica, psicológica ou jurídica, e não há promessa de resultado."),
    // O pagamento: os mesmos textos dos quizzes.
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
    assimQueCairArea: t("Assim que o pagamento cair, a sua área abre aqui. Pode deixar esta página aberta."),
    confirmado: t("Pagamento confirmado"),
    entrando: t("Abrindo a sua área…"),
    naoFoiPossivel: t("Não foi possível continuar agora. Tente de novo."),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
    jaTemArea: t("Entrar na minha área"),
  };
}
export type TextosDaEntrada = ReturnType<typeof textosDaEntrada>;
