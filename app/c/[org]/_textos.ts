/**
 * Os textos da área do cliente, já traduzidos no servidor: as partes do
 * navegador não têm o provedor de idioma da equipe.
 */
import type { TextosDaCarteira } from "./_carteira";
import type { TextosDaArea } from "./_client";
import type { TextosDasEtapas } from "./_etapas";
import type { TextosDaMesa } from "./_mesa";
import type { TextosDasOfertas } from "./_ofertas";

/** Os textos das partes que rodam no navegador, já traduzidos aqui no servidor. */
export function textosDoNavegador(t: (s: string) => string): TextosDaArea {
  return {
    seuEmail: t("Seu e-mail"),
    receberCodigo: t("Receber código"),
    enviando: t("Enviando…"),
    codigoEnviadoAntes: t("Se este e-mail estiver no seu cadastro, você recebeu um código de 6 números. Ele vale 10 minutos."),
    codigo: t("Código"),
    entrar: t("Entrar"),
    entrando: t("Entrando…"),
    usarOutroEmail: t("Usar outro e-mail"),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
    naoFoiPossivel: t("Não foi possível agora. Tente de novo."),
    desejoTitulo: t("O que você gostaria de receber de nós?"),
    desejoObrigada: t("Obrigada por contar. A gente lê cada resposta. 💜"),
    desejoExemplo: t("Ex.: uma leitura sobre o meu trabalho, um ritual para a lua cheia…"),
    enviar: t("Enviar"),
    guardeSeuAcesso: t("Guarde seu acesso"),
    comSeuEmail: t("Salve seu e-mail para voltar a esta área em outro aparelho. Ao entrar, peça um código de acesso por e-mail."),
    salvar: t("Salvar"),
    prontoEntreCom: t("Pronto! Da próxima vez, entre com este e-mail:"),
    faleComAGente: t("Fale com a gente"),
    faleComAGenteConvite: t("Escreva sua dúvida. A equipe responde nesta conversa; volte a esta página para acompanhar. As respostas aparecem automaticamente enquanto ela está aberta."),
    escrevaAqui: t("Escreva sua mensagem…"),
    voce: t("Você"),
    nos: t("Nós"),
    enviada: t("Enviada. A gente responde por aqui."),
    conversaGuardada: t("O que a gente conversou"),
    conversaGuardadaConvite: t("Sua conversa com a gente, guardada para você reler quando quiser."),
    verConversaInteira: t("Ver a conversa inteira"),
    mostrarMenos: t("Mostrar menos"),
    revelar: t("Toque para revelar a sua carta"),
    cartaDoDia: t("Sua carta de hoje"),
    seuDiario: t("Seu diário"),
    diarioConvite: t("Um espaço para guardar suas reflexões e reler quando quiser."),
    diarioExemplo: t("Hoje eu…"),
    salvo: t("Salvo."),
    aniversarioTitulo: t("Quando é o seu aniversário? 🎂"),
    aniversarioConvite: t("Conta pra gente: no seu dia a gente prepara algo especial só para você."),
    aniversarioObrigada: t("Anotado! No seu dia tem surpresa. 💜"),
    circuloConvite: t("Todo mês: a energia do mês, um ritual simples para fazer em casa e uma pergunta sua respondida com uma carta. O conteúdo e a resposta ficam aqui na sua área. Cada pagamento dá 30 dias de acesso, sem renovação automática."),
    por30Dias: t("por 30 dias"),
    pagarComPix: t("Pagar com Pix"),
    pagarComCartao: t("Pagar com cartão"),
    copiarCodigo: t("Copiar código Pix"),
    codigoCopiado: t("Código copiado."),
    depoisDePagar: t("Depois de pagar, volte aqui e atualize a página: o acesso libera sozinho."),
    voceEstaNoCirculo: t("Você está no Círculo até"),
    renovar: t("Renovar por mais 30 dias"),
    conteudoPreparando: t("O conteúdo deste mês está sendo preparado…"),
    perguntaDoMes: t("Sua pergunta do mês"),
    perguntaExemplo: t("Ex.: o que preciso olhar no meu relacionamento agora?"),
    perguntar: t("Perguntar às cartas"),
    consultando: t("Tirando a sua carta…"),
    respostaChegando: t("Sua resposta está sendo preparada. Volte daqui a pouco."),
    tentarDeNovo: t("Tentar de novo"),
  };
}

/** Os textos das ofertas (presente, Ano Pessoal), já traduzidos. */
export function textosDasOfertas(t: (s: string) => string): TextosDasOfertas {
  return {
    presenteTitulo: t("Dê uma pergunta de tarô de presente"),
    presenteConvite: t("Alguém que você ama ganha uma pergunta para as cartas. Após a confirmação do pagamento, o link aparece aqui para você copiar e enviar à pessoa."),
    presenteParaQuem: t("Para quem é? (opcional)"),
    presenteParaQuemExemplo: t("Ex.: Ana"),
    seusPresentes: t("Seus presentes"),
    presenteNaoUsado: t("ainda não usado"),
    presenteUsado: t("já usado ✓"),
    copiarLink: t("Copiar link"),
    linkCopiado: t("Link copiado."),
    mandarPeloWhatsapp: t("Mandar pelo WhatsApp"),
    mensagemDoPresente: t("Tenho um presente para você: uma pergunta para as cartas. Abra aqui:"),
    anoPessoalTitulo: t("Seu Ano Pessoal"),
    anoPessoalConvite: t("A leitura do ano que começa no seu aniversário: o tema do ano, uma orientação para cada trimestre e três intenções para você. Após a confirmação do pagamento, a leitura é preparada em texto e aparece aqui na sua área."),
    anoPessoalPreparando: t("A leitura do seu ano está sendo preparada…"),
  };
}

/** Os textos das etapas do trabalho, já traduzidos. */
export function textosDasEtapas(t: (s: string) => string): TextosDasEtapas {
  return {
    etapaDeHoje: t("Sua etapa de hoje"),
    de: t("de"),
    fizEstaEtapa: t("Fiz esta etapa"),
    desfazer: t("desfazer"),
    feitaEm: t("feita em"),
    verTrabalho: t("Ver o trabalho inteiro"),
    concluido: t("Você concluiu todas as etapas"),
    etapasFeitas: t("etapas feitas"),
    naoFoiPossivel: t("Não foi possível agora. Tente de novo."),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
    jaFizTodas: t("Já fiz todas as etapas"),
    eAgora: t("E agora?"),
    proximoPasso: t("Quando sentir que é hora, este pode ser o seu próximo passo:"),
    conhecer: t("Conhecer"),
    contarComoFoi: t("Contar como foi"),
  };
}

/** Os textos da Mesa de leituras, já traduzidos. `empresa` entra no aviso de que a leitura é automática. */
export function textosDaCarteira(t: (s: string) => string): TextosDaCarteira {
  return {
    titulo: t("Seus créditos"),
    seusCreditos: t("Saldo para usar em toda a sua área"),
    creditos: t("créditos"),
    umCreditoUmReal: t("Cada crédito vale R$ 1 nas leituras. Os créditos não vencem."),
    escolhaPacote: t("Escolha um pacote"),
    bonus: t("de bônus"),
    maisEscolhido: t("Mais escolhido"),
    pagarComPix: t("Pagar com Pix"),
    pagarComCartao: t("Pagar com cartão"),
    esperandoPagamento: t("Assim que o Pix cair, os créditos aparecem aqui sozinhos."),
    copiarCodigo: t("Copiar código Pix"),
    codigoCopiado: t("Código copiado"),
    chegaram: t("créditos chegaram"),
    extrato: t("Ver extrato"),
    semMovimento: t("Nenhum movimento ainda."),
    voltar: t("Voltar"),
    motivos: {
      pacote: t("Pacote de créditos"),
      circulo: t("Créditos do mês do Círculo"),
      leitura: t("Leitura na mesa"),
      devolucao: t("Devolução"),
      ajuste: t("Ajuste"),
    },
  };
}

export function textosDaMesa(t: (s: string) => string, empresa: string): TextosDaMesa {
  return {
    titulo: t("A Mesa"),
    automatica: `${t("Leitura automática, nos métodos de")} ${empresa}`,
    primeiraPor: t("Primeira leitura por"),
    leituraPor: t("Leitura por"),
    restamHoje: t("Leituras que ainda cabem hoje:"),
    limiteDoDia: t("Por hoje a mesa já fez as suas leituras. Amanhã ela abre de novo para você."),
    suaPergunta: t("Sua pergunta"),
    dicaDaPergunta: t("Uma pergunta só, do seu jeito. Quanto mais clara, mais clara a leitura."),
    pagarComPix: t("Pagar com Pix"),
    pagarComCartao: t("Pagar com cartão"),
    esperandoPagamento: t("Esperando o pagamento"),
    copiarCodigo: t("Copiar o código Pix"),
    codigoCopiado: t("Código copiado"),
    embaralhando: t("Embaralhando as cartas"),
    escolhaTres: t("Concentre-se na sua pergunta e toque em três cartas."),
    escolhidas: t("escolhidas"),
    revelar: t("Revelar as cartas"),
    digitando: t("Lendo as suas cartas"),
    sintese: t("O que as cartas dizem juntas"),
    passo: t("Um passo para os próximos dias"),
    preparando: t("A leitura está sendo preparada. Toque abaixo em instantes."),
    tentarDeNovo: t("Tentar de novo"),
    voltarAMesa: t("Voltar para a mesa"),
    ciganaDeVerdade: t("Quer conversar sobre isso com uma cigana de verdade?"),
    falarComCigana: t("Falar com uma cigana no WhatsApp"),
    minhasLeituras: t("Minhas leituras"),
    esperandoVoce: t("Uma leitura paga está esperando você"),
    abrirAMesa: t("Abrir a mesa"),
    voltar: t("Voltar"),
    usarCreditos: t("Usar"),
    creditos: t("créditos"),
    seusCreditos: t("Seus créditos"),
    comprarCreditos: t("Comprar créditos"),
    ouPagueSoEsta: t("ou pague só esta leitura:"),
    ouvirLeitura: t("Ouvir a leitura"),
    pausar: t("Pausar"),
    preparandoVoz: t("Preparando a voz…"),
    vozIndisponivel: t("A voz não está disponível agora. A leitura escrita continua aqui."),
    posicoes: [t("O que pesa"), t("O que está em movimento"), t("O conselho das cartas")],
  };
}
