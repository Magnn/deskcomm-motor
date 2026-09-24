/**
 * O BARALHO — os 22 Arcanos Maiores, com o sentido de cada um em quatro áreas.
 *
 * Por que só os Maiores (não os 78): uma leitura rápida de WhatsApp precisa de
 * poucos arquétipos bem escritos, não de setenta e oito genéricos. Os Maiores
 * são os clássicos ("A Torre", "O Sol", "A Morte") e já cobrem os temas de
 * início, perda, escolha, transformação e realização que uma leitura de "amor,
 * dinheiro, saúde" precisa tocar.
 *
 * `sentido` tem quatro ângulos porque o roteiro da leitura primeiro fala da
 * DOR que a pessoa trouxe, depois ESTENDE pra saúde, dinheiro e relacionamento
 * (pedido do dono do produto) — a agente lê o ângulo certo, nunca o cartão
 * inteiro solto.
 */

export interface Carta {
  id: number;
  nome: string;
  /** 3–4 imagens/símbolos que a agente cita ao descrever a carta. */
  simbolos: readonly string[];
  sentido: {
    /** O que a carta diz sobre a causa raiz, em geral. */
    geral: string;
    amor: string;
    dinheiro: string;
    saude: string;
  };
}

export const TAMANHO_DO_BARALHO = 22;

export const BARALHO: readonly Carta[] = [
  {
    id: 1,
    nome: "O Louco",
    simbolos: ["o abismo aos pés", "a trouxa leve nas costas", "o primeiro passo sem mapa"],
    sentido: {
      geral: "você está diante de um começo que ainda não ousou dar — a causa raiz é o medo de sair do lugar conhecido, mesmo sabendo que ele não serve mais.",
      amor: "você segura um passo que já devia ter dado — declarar o que sente, sair da situação, aceitar o convite.",
      dinheiro: "existe uma ideia ou mudança de rumo parada por medo de errar, e o parado custa mais caro que o risco.",
      saude: "o corpo está pedindo uma mudança simples (dormir, se mexer, parar de adiar o médico) que a mente empurra pra depois.",
    },
  },
  {
    id: 2,
    nome: "O Mago",
    simbolos: ["a mesa com todas as ferramentas", "uma mão apontando pro céu, outra pro chão", "o símbolo do infinito"],
    sentido: {
      geral: "você já tem o que precisa pra resolver isso — a causa raiz não é falta de recurso, é falta de decisão de usar o que já está em mãos.",
      amor: "você sabe exatamente o que precisa dizer ou fazer; o que falta é começar, não descobrir o caminho.",
      dinheiro: "há uma habilidade ou oportunidade sua, parada, que já podia estar gerando resultado.",
      saude: "você já sabe o que o corpo precisa — o problema é a vontade de aplicar o que já sabe.",
    },
  },
  {
    id: 3,
    nome: "A Sacerdotisa",
    simbolos: ["o véu entre duas colunas", "a lua aos pés", "o silêncio guardando um segredo"],
    sentido: {
      geral: "há algo que você sente mas ainda não admite pra si mesma — a causa raiz mora no que você intui e evita olhar de frente.",
      amor: "sua intuição já sabe algo sobre essa pessoa ou situação que a razão ainda insiste em negar.",
      dinheiro: "existe um sinal, um número, uma sensação de alerta que você está escolhendo não ver.",
      saude: "o corpo dá um aviso baixinho, recorrente, que a rotina abafa — vale escutar antes que fale mais alto.",
    },
  },
  {
    id: 4,
    nome: "A Imperatriz",
    simbolos: ["o campo fértil", "a coroa de estrelas", "os braços abertos"],
    sentido: {
      geral: "a causa raiz é um cuidado que você dá aos outros e nunca dá a si mesma — está no ponto de esgotar o que planta e não colhe.",
      amor: "você entrega demais e recebe pouco de volta — o cansaço que sente é de cuidar sem ser cuidada.",
      dinheiro: "você investe tempo e esforço em algo (ou alguém) que não devolve na mesma medida.",
      saude: "o corpo está no limite de dar conta de tudo pelos outros — o cansaço físico é também emocional.",
    },
  },
  {
    id: 5,
    nome: "O Imperador",
    simbolos: ["o trono de pedra", "a armadura sob a túnica", "os carneiros nos braços do trono"],
    sentido: {
      geral: "a causa raiz é uma estrutura que você não colocou — falta uma regra, um limite, uma decisão firme que só você pode tomar.",
      amor: "falta clareza sobre o que você aceita e o que não aceita mais — sem esse limite, a mesma dor se repete.",
      dinheiro: "falta organização: um plano, um limite de gasto, uma decisão que você vem adiando.",
      saude: "falta disciplina num ponto simples — horário de dormir, rotina, um limite que o corpo pede.",
    },
  },
  {
    id: 6,
    nome: "O Hierofante",
    simbolos: ["as chaves cruzadas", "os dois discípulos ajoelhados", "a tradição pesando sobre os ombros"],
    sentido: {
      geral: "a causa raiz é uma crença antiga — algo que te ensinaram a aceitar como certo e que hoje só te prende.",
      amor: "você segue um modelo de relação (da família, da criação) que não é o que faz sentido pra você agora.",
      dinheiro: "uma crença sobre dinheiro ('não é pra mim', 'tem que ser difícil') está decidindo por você antes de você decidir.",
      saude: "um hábito antigo, nunca questionado, está fazendo mal — vale rever, não só repetir.",
    },
  },
  {
    id: 7,
    nome: "Os Enamorados",
    simbolos: ["duas pessoas diante da escolha", "o anjo observando de cima", "o caminho que se divide"],
    sentido: {
      geral: "a causa raiz é uma escolha que você está adiando — e o corpo, o bolso ou a relação sente o peso de ficar em cima do muro.",
      amor: "existe uma decisão real sobre essa pessoa (ficar, sair, se abrir) que você vem empurrando.",
      dinheiro: "duas direções estão na sua frente e a indecisão está custando mais que qualquer uma das duas escolhas.",
      saude: "o corpo somatiza a indecisão — a ansiedade de não decidir pesa tanto quanto decidir errado.",
    },
  },
  {
    id: 8,
    nome: "O Carro",
    simbolos: ["as duas esfinges, uma clara e uma escura", "as rédeas soltas", "a armadura de quem já venceu batalhas"],
    sentido: {
      geral: "a causa raiz é a força que puxa pra dois lados ao mesmo tempo — você tem o poder de seguir, mas ainda não alinhou a direção.",
      amor: "parte de você quer avançar, parte quer recuar — a relação sente essa direção dividida.",
      dinheiro: "você tem energia e vontade, mas está gastando em direções opostas em vez de uma só.",
      saude: "o corpo está sendo puxado por rotinas contrárias (trabalhar demais, descansar de menos) sem controle das rédeas.",
    },
  },
  {
    id: 9,
    nome: "A Força",
    simbolos: ["a mulher abrindo a boca do leão com calma", "o símbolo do infinito sobre a cabeça", "a força que não grita"],
    sentido: {
      geral: "a causa raiz não é falta de força — é ter usado força bruta (brigar, insistir, forçar) onde precisava de paciência e firmeza calma.",
      amor: "cobrar, brigar ou insistir não resolveu; o que falta é a firmeza calma, não mais pressão.",
      dinheiro: "empurrar com pressa criou mais resistência — o resultado vem de constância, não de força de uma vez.",
      saude: "o corpo reage mal à pressão que você mesma coloca; precisa de constância gentil, não de força bruta.",
    },
  },
  {
    id: 10,
    nome: "O Eremita",
    simbolos: ["a lanterna solitária", "o cajado de apoio", "o topo da montanha vazio"],
    sentido: {
      geral: "a causa raiz é ter buscado resposta fora demais e ter escutado a própria voz de menos — a resposta pede um tempo sozinha.",
      amor: "você anda perguntando pra todo mundo o que fazer, menos pra você mesma — a resposta já está mais clara do que parece.",
      dinheiro: "falta um tempo de parar, olhar os números com calma, antes de decidir com pressa por conselho alheio.",
      saude: "o corpo pede pausa de verdade, não mais uma opinião nova de fora — o cansaço é de excesso de estímulo.",
    },
  },
  {
    id: 11,
    nome: "A Roda da Fortuna",
    simbolos: ["a roda girando sozinha", "a esfinge no topo, equilibrada", "as figuras subindo e descendo"],
    sentido: {
      geral: "a causa raiz é resistir à mudança de ciclo — você está tentando seguir como antes num momento que já virou.",
      amor: "essa fase da relação (ou da solidão) está mudando, quer você queira ou não — lutar contra o ciclo é o que mais cansa.",
      dinheiro: "um ciclo está virando (pra melhor ou pra pior) e insistir no jeito antigo trava o que vem a seguir.",
      saude: "o corpo está em transição de fase (hormonal, de idade, de rotina) e resistir a isso é o que gera o desconforto.",
    },
  },
  {
    id: 12,
    nome: "A Justiça",
    simbolos: ["a balança equilibrada", "a espada erguida e reta", "os olhos que não se desviam"],
    sentido: {
      geral: "a causa raiz é uma conta que ainda não fechou — uma decisão, uma verdade ou uma responsabilidade que falta assumir.",
      amor: "falta uma conversa honesta, sem meio-termo, sobre o que é justo pros dois lados.",
      dinheiro: "existe uma conta, um contrato ou uma decisão que precisa ser encarada de frente, sem mais adiar.",
      saude: "o corpo cobra o equilíbrio que falta — excesso de um lado (trabalho, comida, sono perdido) sem compensação do outro.",
    },
  },
  {
    id: 13,
    nome: "O Enforcado",
    simbolos: ["a pessoa de cabeça pra baixo, em paz", "a árvore que sustenta", "o olhar sereno mesmo suspenso"],
    sentido: {
      geral: "a causa raiz é tentar resolver do mesmo jeito de sempre algo que só se resolve olhando por outro ângulo.",
      amor: "o que trava essa relação não muda insistindo do mesmo jeito — pede um olhar diferente, não mais esforço igual.",
      dinheiro: "a mesma estratégia não vai destravar o mesmo problema — vale parar e olhar de outro ângulo antes de agir de novo.",
      saude: "o corpo pede uma pausa forçada pra virar a chave — o desconforto é o convite pra mudar o ângulo, não só aguentar mais.",
    },
  },
  {
    id: 14,
    nome: "A Morte",
    simbolos: ["o esqueleto de armadura, sem pressa", "o sol nascendo ao fundo", "as figuras que se despedem"],
    sentido: {
      geral: "a causa raiz é segurar algo que já terminou — um jeito de ser, uma fase, um vínculo que precisa de um fim pra abrir espaço.",
      amor: "essa relação (ou esse jeito de se relacionar) já terminou de um jeito que a razão ainda não aceitou.",
      dinheiro: "um projeto, emprego ou fonte de renda já cumpriu o ciclo dele — segurar custa mais do que fechar e recomeçar.",
      saude: "um hábito antigo precisa morrer de verdade (não só pausar) pra o corpo virar a página.",
    },
  },
  {
    id: 15,
    nome: "A Temperança",
    simbolos: ["a água passando de um cálice a outro, sem derramar", "um pé na terra, outro na água", "o equilíbrio sem pressa"],
    sentido: {
      geral: "a causa raiz é o excesso — de um lado, de outro, sem o meio-termo que sustenta.",
      amor: "falta o equilíbrio entre dar e receber, entre estar perto e dar espaço.",
      dinheiro: "falta misturar na medida certa: gastar e guardar, arriscar e segurar — hoje está tudo pra um lado só.",
      saude: "o corpo pede a medida certa — nem tudo de uma vez, nem nada; o excesso (de qualquer coisa) é o que pesa.",
    },
  },
  {
    id: 16,
    nome: "O Diabo",
    simbolos: ["as correntes frouxas no pescoço, que dá pra tirar", "as duas figuras acorrentadas por vontade própria", "os chifres e o olhar fixo"],
    sentido: {
      geral: "a causa raiz é um padrão que prende mais pela repetição do que por falta de saída — a corrente está mais frouxa do que parece.",
      amor: "existe um padrão que se repete (ciúme, dependência, medo de ficar só) que prende mais por hábito do que por amor de verdade.",
      dinheiro: "um vício de comportamento (gastar pra aliviar, procrastinar, medo de negociar) está no comando, não a razão.",
      saude: "um hábito que vicia (tela, comida, bebida, trabalho sem parar) está sendo usado pra aliviar outra dor.",
    },
  },
  {
    id: 17,
    nome: "A Torre",
    simbolos: ["o raio partindo a torre ao meio", "as figuras caindo, mas vivas", "a coroa que voa longe"],
    sentido: {
      geral: "a causa raiz é uma estrutura que já estava rachada por dentro — o abalo só mostrou o que já não sustentava mais.",
      amor: "algo que parecia sólido já vinha rachado — o que caiu não era tão firme quanto parecia de fora.",
      dinheiro: "uma base que parecia segura (emprego, negócio, acordo) já vinha fraca antes do abalo aparecer.",
      saude: "o corpo avisou antes de doer forte — o abalo trouxe à tona o que já vinha sendo ignorado.",
    },
  },
  {
    id: 18,
    nome: "A Estrela",
    simbolos: ["a mulher derramando água na terra e no lago", "as sete estrelas no céu limpo", "a calma depois da tempestade"],
    sentido: {
      geral: "a causa raiz é ter perdido a esperança no meio do cansaço — a saída existe, mas a fé nela se apagou.",
      amor: "você ainda quer acreditar, só perdeu a confiança de que dá certo — a vontade continua viva por baixo do cansaço.",
      dinheiro: "existe um caminho de melhora real, mas o desânimo recente fez você parar de tentar.",
      saude: "o corpo responde bem a um recomeço simples — o que falta é retomar o cuidado que você abandonou por cansaço.",
    },
  },
  {
    id: 19,
    nome: "A Lua",
    simbolos: ["os dois cães uivando", "o caminho sinuoso entre as torres", "a lagosta saindo da água escura"],
    sentido: {
      geral: "a causa raiz é um medo que cresce na imaginação mais do que na realidade — a névoa some quando você olha de perto.",
      amor: "existe um medo (de traição, de abandono, de não ser suficiente) maior na cabeça do que nos fatos.",
      dinheiro: "a ansiedade sobre o dinheiro está maior que o problema real — o medo distorce o tamanho da coisa.",
      saude: "a ansiedade está pesando no corpo mais do que qualquer coisa física — o sono e a mente pedem cuidado primeiro.",
    },
  },
  {
    id: 20,
    nome: "O Sol",
    simbolos: ["o sol cheio, sem nuvem nenhuma", "a criança livre, sem medo", "o girassol aberto"],
    sentido: {
      geral: "a causa raiz é simples e mais leve do que parece — falta clareza pra ver o que já está dando certo.",
      amor: "há mais coisa boa nessa relação (ou em você mesma) do que a dor recente deixa enxergar.",
      dinheiro: "as coisas estão mais encaminhadas do que a ansiedade deixa perceber — falta reconhecer o que já deu certo.",
      saude: "o corpo responde bem quando a mente clareia — o problema pesa mais na cabeça do que no físico.",
    },
  },
  {
    id: 21,
    nome: "O Julgamento",
    simbolos: ["o anjo tocando a trombeta", "as pessoas saindo dos caixões, renascendo", "o chamado que não dá pra ignorar"],
    sentido: {
      geral: "a causa raiz é um chamado interno que você vem adiando ouvir — uma virada que já está pronta pra acontecer.",
      amor: "existe uma verdade sobre essa relação que você já sabe, e está esperando coragem pra agir sobre ela.",
      dinheiro: "está na hora de um recomeço que você já sente, mas ainda não deu o primeiro passo.",
      saude: "o corpo está pedindo uma virada de página — um check-up, um recomeço, uma decisão que você vem adiando.",
    },
  },
  {
    id: 22,
    nome: "O Mundo",
    simbolos: ["a figura dançando dentro da coroa de louros", "os quatro símbolos nos cantos", "o ciclo se fechando"],
    sentido: {
      geral: "a causa raiz é estar no fim de um ciclo sem ter comemorado o quanto já foi vencido até aqui.",
      amor: "um ciclo está se fechando bem, mesmo que ainda doa — reconhecer isso já é parte de virar a página.",
      dinheiro: "uma fase de esforço está chegando ao resultado — falta só o passo final pra colher o que foi plantado.",
      saude: "o corpo está pedindo reconhecimento do quanto já melhorou, não só foco no que ainda falta.",
    },
  },
] as const;

export const CARTA_POR_ID: ReadonlyMap<number, Carta> = new Map(BARALHO.map((c) => [c.id, c]));
