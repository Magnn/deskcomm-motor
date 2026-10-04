/**
 * MODELOS DE JORNADA — pontos de partida que o dono escolhe e depois edita.
 *
 * Ninguém começa uma jornada do zero com facilidade; começar de um modelo parecido e trocar as palavras é
 * o que faz a aba ser usada (o mesmo princípio dos atalhos de Limites e Objeções). Os modelos são DADO,
 * passam pelo mesmo schema que o servidor aplica (`modelos.test.ts` garante) e não têm nada de código.
 *
 * O texto dos objetivos é deliberadamente neutro: o que a etapa precisa CONSEGUIR, sem técnica de
 * pressão. Prometer resultado, inventar problema ou urgência não entra em modelo da plataforma.
 */
import type { JornadaConfig } from "./tipos";

export interface ModeloDeJornada {
  chave: string;
  nome: string;
  descricao: string;
  jornada: JornadaConfig;
}

export const MODELOS_DE_JORNADA: readonly ModeloDeJornada[] = [
  {
    chave: "venda",
    nome: "Venda pelo WhatsApp",
    descricao: "Acolher, entender o que a pessoa procura, recomendar, passar valor e link.",
    jornada: {
      enabled: true,
      etapas: [
        {
          id: "acolhida",
          nome: "Acolhida",
          objetivo: "Dar boas-vindas pelo nome da empresa e perguntar como pode ajudar.",
          campos: [],
          saida: "resposta",
          libera: [],
        },
        {
          id: "necessidade",
          nome: "Entender a necessidade",
          objetivo: "Entender o que a pessoa procura e para quê, com uma pergunta de cada vez.",
          campos: [{ chave: "necessidade", rotulo: "O que procura", tipo: "texto" }],
          saida: "campos",
          libera: [],
        },
        {
          id: "recomendacao",
          nome: "Recomendação",
          objetivo: "Recomendar UM produto da oferta que resolve o que ela contou, explicando por quê.",
          campos: [],
          saida: "resposta",
          libera: ["oferta"],
        },
        {
          id: "fechamento",
          nome: "Valor e pagamento",
          objetivo: "Dizer o valor, mandar o link de pagamento e tirar as dúvidas que sobrarem.",
          campos: [],
          saida: "resposta",
          libera: ["preco", "link"],
        },
      ],
    },
  },
  {
    chave: "agendamento",
    nome: "Agendamento",
    descricao: "Acolher, entender o motivo, combinar o dia e confirmar.",
    jornada: {
      enabled: true,
      etapas: [
        {
          id: "acolhida",
          nome: "Acolhida",
          objetivo: "Dar boas-vindas e perguntar o motivo do contato.",
          campos: [{ chave: "motivo", rotulo: "Motivo", tipo: "texto" }],
          saida: "campos",
          libera: [],
        },
        {
          id: "data",
          nome: "Dia",
          objetivo: "Perguntar o melhor dia para o atendimento.",
          campos: [{ chave: "dia", rotulo: "Dia desejado", tipo: "data" }],
          saida: "campos",
          libera: [],
        },
        {
          id: "confirmacao",
          nome: "Confirmação",
          objetivo: "Confirmar o motivo e o dia, dizer o valor se houver e o que a pessoa precisa levar.",
          campos: [],
          saida: "resposta",
          libera: ["oferta", "preco", "link"],
        },
      ],
    },
  },
  {
    chave: "leitura",
    nome: "Leitura de cartas",
    descricao: "Acolher, pegar os dados, a pessoa escolhe 3 números, a leitura, e só então a oferta.",
    jornada: {
      enabled: true,
      etapas: [
        {
          id: "acolhida",
          nome: "Acolhida",
          objetivo: "Dar boas-vindas com calma e perguntar se a pessoa quer começar a leitura.",
          campos: [],
          saida: "resposta",
          libera: [],
        },
        {
          id: "dados",
          nome: "Dados da pessoa",
          objetivo: "Pedir o primeiro nome e a data de nascimento para a leitura.",
          campos: [
            { chave: "nome", rotulo: "Primeiro nome", tipo: "texto" },
            { chave: "nascimento", rotulo: "Data de nascimento", tipo: "data" },
          ],
          saida: "campos",
          libera: [],
        },
        {
          id: "escolha",
          nome: "Escolha das cartas",
          objetivo: "Explicar que há 22 cartas fechadas e pedir que a pessoa escolha 3 números de 1 a 22.",
          campos: [{ chave: "cartas", rotulo: "Números escolhidos", tipo: "numeros", quantidade: 3, minimo: 1, maximo: 22 }],
          saida: "campos",
          libera: [],
        },
        {
          id: "leitura",
          nome: "Leitura",
          objetivo:
            "Ler as cartas uma de cada vez como reflexão sobre o que a pessoa contou, sem afirmar doença, ameaça ou culpa, e perguntar o que ela sentiu.",
          campos: [],
          saida: "resposta",
          libera: [],
        },
        {
          id: "oferta",
          nome: "Oferta",
          objetivo:
            "Se fizer sentido para o que a pessoa contou, apresentar o trabalho da oferta, o valor e o link, deixando claro que é escolha dela.",
          campos: [],
          saida: "resposta",
          libera: ["oferta", "preco", "link"],
        },
      ],
    },
  },
];
