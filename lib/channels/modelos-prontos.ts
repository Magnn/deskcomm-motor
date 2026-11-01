/**
 * Modelos de WhatsApp prontos para preencher o formulário de criação.
 *
 * Nada aqui vai para a Meta sozinho: escolher um modelo só preenche o
 * formulário, e o operador revisa antes de "Enviar para revisão".
 *
 * ─── A categoria diz o que a mensagem É ────────────────────────────────────
 *
 * UTILITY é aviso de um fato real daquele contato: pedido, pagamento, acesso,
 * horário. Promoção vai como MARKETING, mesmo custando mais. Mandar promoção
 * como utilidade rende reclassificação e recusa, e a denúncia de quem recebeu
 * derruba a qualidade da conta: foi spam que baniu o número oficial em 15/10.
 * Pelo mesmo motivo nenhum modelo tem uma variável aberta para trocar a copy no
 * disparo: o que a revisão aprovou é o que o contato recebe.
 *
 * ─── Forma ─────────────────────────────────────────────────────────────────
 *
 * Mensagem curta, quem fala logo no início e um botão que continua a conversa.
 * Corpo não começa nem termina em variável, porque a revisão recusa. Botão de
 * link pede URL fixa da empresa, então o link sai na resposta, já com a janela
 * aberta pelo toque no botão.
 */
import type { BotaoDaDefinicao } from "./template-conteudo";

export interface ModeloPronto {
  name: string;
  titulo: string;
  /** Em que situação real o modelo pode ser usado. */
  quando: string;
  category: "UTILITY" | "MARKETING";
  language: "pt_BR";
  body: string;
  footer?: string;
  /** Um por `{{n}}`, na ordem. É o que a revisão lê como amostra. */
  exemplos: string[];
  botoes: BotaoDaDefinicao[];
}

const ajuda: BotaoDaDefinicao = { tipo: "quick_reply", texto: "Preciso de ajuda" };
/** "Parar de receber" bloqueia o contato na entrada, em `lib/opt-out/deteccao.ts`. */
const parar: BotaoDaDefinicao = { tipo: "quick_reply", texto: "Parar de receber" };

export const MODELOS_PRONTOS: readonly ModeloPronto[] = [
  {
    name: "pedido_confirmado",
    titulo: "Pedido confirmado",
    quando: "Depois de um pedido feito pelo contato.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nSeu pedido de {{3}} foi confirmado. Assim que houver novidade, avisamos por aqui.",
    exemplos: ["Maria", "Loja Exemplo", "1 camiseta azul"],
    botoes: [{ tipo: "quick_reply", texto: "Tudo certo" }, ajuda],
  },
  {
    name: "pagamento_pendente",
    titulo: "Pagamento pendente",
    quando: "Pedido real que ainda não foi pago.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nSeu pedido de {{3}}, no valor de {{4}}, está aguardando pagamento. Posso enviar o código de pagamento por aqui?",
    exemplos: ["Maria", "Loja Exemplo", "1 camiseta azul", "R$ 59,90"],
    botoes: [{ tipo: "quick_reply", texto: "Receber o código" }, ajuda],
  },
  {
    name: "pagamento_recebido",
    titulo: "Pagamento recebido",
    quando: "Assim que o pagamento cair.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nRecebemos o pagamento de {{3}}, no valor de {{4}}. Os próximos passos seguem por aqui.",
    exemplos: ["Maria", "Loja Exemplo", "1 camiseta azul", "R$ 59,90"],
    botoes: [{ tipo: "quick_reply", texto: "Tudo certo" }, ajuda],
  },
  {
    name: "acesso_liberado",
    titulo: "Acesso liberado",
    quando: "Produto digital ou curso já comprado.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nSeu acesso a {{3}} foi liberado. Consegue entrar normalmente?",
    exemplos: ["Maria", "Escola Exemplo", "Curso de Bordado"],
    botoes: [{ tipo: "quick_reply", texto: "Está tudo certo" }, ajuda],
  },
  {
    name: "agendamento_confirmado",
    titulo: "Agendamento confirmado",
    quando: "Horário marcado com o contato.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nSeu horário de {{3}} está confirmado para {{4}}. Se precisar mudar, é só avisar por aqui.",
    exemplos: ["Maria", "Clínica Exemplo", "avaliação", "12/11 às 14h"],
    botoes: [
      { tipo: "quick_reply", texto: "Confirmar presença" },
      { tipo: "quick_reply", texto: "Remarcar" },
    ],
  },
  {
    name: "lembrete_de_agendamento",
    titulo: "Lembrete de agendamento",
    quando: "Véspera ou dia do horário marcado.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nLembrete do seu horário de {{3}}, marcado para {{4}}. Você confirma a presença?",
    exemplos: ["Maria", "Clínica Exemplo", "avaliação", "amanhã às 14h"],
    botoes: [
      { tipo: "quick_reply", texto: "Confirmar presença" },
      { tipo: "quick_reply", texto: "Remarcar" },
    ],
  },
  {
    name: "retorno_combinado",
    titulo: "Retorno combinado",
    quando: "O contato pediu para falar em outra data.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nComo combinamos, voltamos a falar hoje sobre {{3}}. Podemos continuar por aqui?",
    exemplos: ["Maria", "Loja Exemplo", "o seu pedido"],
    botoes: [
      { tipo: "quick_reply", texto: "Podemos continuar" },
      { tipo: "quick_reply", texto: "Falar outro dia" },
    ],
  },
  {
    name: "inscricao_confirmada",
    titulo: "Inscrição confirmada",
    quando: "O contato se inscreveu de verdade.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nSua inscrição em {{3}} está confirmada. Posso enviar as informações da inscrição por aqui?",
    exemplos: ["Maria", "Escola Exemplo", "Aula de Bordado"],
    botoes: [{ tipo: "quick_reply", texto: "Receber informações" }, parar],
  },
  {
    name: "aula_confirmada_hoje",
    titulo: "Aula ao vivo hoje",
    quando: "Inscritos, no dia da aula.",
    category: "UTILITY",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nA aula {{3}} está confirmada para hoje às {{4}}. Posso enviar o link assim que começar?",
    exemplos: ["Maria", "Escola Exemplo", "Bordado na prática", "19h"],
    botoes: [{ tipo: "quick_reply", texto: "Receber o link" }, parar],
  },
  {
    name: "pedido_em_aberto",
    titulo: "Compra não concluída",
    quando: "O contato começou a compra e parou.",
    category: "MARKETING",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nVocê começou a compra de {{3}} e ela não foi concluída. Quer ajuda para terminar?",
    exemplos: ["Maria", "Loja Exemplo", "1 camiseta azul"],
    botoes: [{ tipo: "quick_reply", texto: "Quero terminar" }, parar],
  },
  {
    name: "novidade_para_clientes",
    titulo: "Novidade para clientes",
    quando: "Quem já comprou ou aceitou receber.",
    category: "MARKETING",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\nChegou {{3}}, e lembramos de você. Quer conhecer?",
    exemplos: ["Maria", "Loja Exemplo", "a nova coleção de inverno"],
    botoes: [{ tipo: "quick_reply", texto: "Quero conhecer" }, parar],
  },
  {
    name: "oferta_para_clientes",
    titulo: "Oferta com prazo real",
    quando: "Oferta verdadeira, com prazo que vale mesmo.",
    category: "MARKETING",
    language: "pt_BR",
    body: "Olá, {{1}}! Aqui é da {{2}}.\n\n{{3}} está por {{4}} até {{5}}. Quer que eu envie os detalhes?",
    exemplos: ["Maria", "Loja Exemplo", "A camiseta azul", "R$ 49,90", "domingo"],
    botoes: [{ tipo: "quick_reply", texto: "Quero os detalhes" }, parar],
  },
];
