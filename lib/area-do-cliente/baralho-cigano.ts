/**
 * O BARALHO CIGANO — as 36 cartas, para a Mesa de leituras da área do cliente.
 *
 * Cada carta tem o símbolo que a tela desenha (enquanto a empresa não sobe a arte das cartas) e um sentido
 * curto, escrito como ORIENTAÇÃO: nada de sentença, medo ou prazo. A carta 8 é o exemplo: tradicionalmente
 * "o caixão", aqui é fim de ciclo e recomeço, nunca morte. Quem escreve a leitura é a IA, a partir deste
 * sentido e da posição em que a carta saiu.
 */
export interface CartaCigana {
  id: number;
  nome: string;
  /** O desenho da carta enquanto não há arte própria. */
  simbolo: string;
  sentido: string;
}

export const BARALHO_CIGANO: readonly CartaCigana[] = [
  { id: 1, nome: "O Cavaleiro", simbolo: "🐎", sentido: "notícias e movimento chegando; algo começa a andar mais rápido do que você espera." },
  { id: 2, nome: "O Trevo", simbolo: "☘️", sentido: "pequenas dificuldades passageiras; um obstáculo curto que pede paciência, não desistência." },
  { id: 3, nome: "O Navio", simbolo: "⛵", sentido: "mudança de rota, viagem ou distância; o desejo de ir além do lugar onde você está." },
  { id: 4, nome: "A Casa", simbolo: "🏠", sentido: "base, família e segurança; o que acontece dentro de casa e dentro de você." },
  { id: 5, nome: "A Árvore", simbolo: "🌳", sentido: "crescimento lento e raízes; saúde e paciência com o que ainda está se formando." },
  { id: 6, nome: "As Nuvens", simbolo: "☁️", sentido: "dúvida e confusão momentâneas; ainda não é hora de decidir com a cabeça cheia." },
  { id: 7, nome: "A Serpente", simbolo: "🐍", sentido: "atenção a caminhos tortuosos; use a sua sabedoria e não se deixe envolver por intrigas." },
  { id: 8, nome: "O Caixão", simbolo: "⚱️", sentido: "fim de um ciclo para que outro comece; algo se encerra e abre espaço para o novo." },
  { id: 9, nome: "O Buquê", simbolo: "💐", sentido: "alegria, presente e reconhecimento; um momento de leveza que merece ser recebido." },
  { id: 10, nome: "A Foice", simbolo: "🌾", sentido: "corte e decisão; hora de separar o que fica do que já não serve." },
  { id: 11, nome: "O Chicote", simbolo: "🪢", sentido: "conversas tensas e repetições; cuidado com discussões que giram sem sair do lugar." },
  { id: 12, nome: "Os Pássaros", simbolo: "🕊️", sentido: "conversas, mensagens e ansiedade; fale do que sente em vez de imaginar." },
  { id: 13, nome: "A Criança", simbolo: "🧒", sentido: "começo, inocência e algo novo; olhar a situação com simplicidade ajuda." },
  { id: 14, nome: "A Raposa", simbolo: "🦊", sentido: "esperteza e cautela; confie, mas observe quem está ao seu redor." },
  { id: 15, nome: "O Urso", simbolo: "🐻", sentido: "força e proteção; alguém forte por perto, ou a sua própria força pedindo espaço." },
  { id: 16, nome: "A Estrela", simbolo: "⭐", sentido: "esperança, fé e direção; o caminho está iluminado se você seguir o que acredita." },
  { id: 17, nome: "A Cegonha", simbolo: "🦩", sentido: "mudança boa e renovação; algo melhora quando você aceita se transformar." },
  { id: 18, nome: "O Cachorro", simbolo: "🐕", sentido: "amizade e lealdade; alguém fiel ao seu lado, ou a lealdade que você dá." },
  { id: 19, nome: "A Torre", simbolo: "🗼", sentido: "solidão escolhida e reflexão; um tempo para se olhar por dentro e se fortalecer." },
  { id: 20, nome: "O Jardim", simbolo: "🌷", sentido: "vida social e encontros; abrir-se às pessoas traz o que você procura." },
  { id: 21, nome: "A Montanha", simbolo: "⛰️", sentido: "obstáculo grande, mas atravessável; persistência vence o que parece parado." },
  { id: 22, nome: "Os Caminhos", simbolo: "🛤️", sentido: "escolha entre dois rumos; a decisão é sua, e as duas trilhas ensinam." },
  { id: 23, nome: "O Rato", simbolo: "🐭", sentido: "desgaste e preocupação que corrói; cuide do que está tirando a sua energia." },
  { id: 24, nome: "O Coração", simbolo: "❤️", sentido: "amor, afeto e sentimento verdadeiro; a resposta está no que você sente." },
  { id: 25, nome: "O Anel", simbolo: "💍", sentido: "compromisso e união; um acordo, uma parceria ou uma promessa que pede cuidado." },
  { id: 26, nome: "O Livro", simbolo: "📖", sentido: "segredo e conhecimento; há algo ainda não revelado, e aprender ajuda." },
  { id: 27, nome: "A Carta", simbolo: "✉️", sentido: "notícia, documento ou recado; uma informação que muda a forma de ver as coisas." },
  { id: 28, nome: "O Cigano", simbolo: "🧔", sentido: "a figura masculina da sua história, ou a sua parte que age e decide." },
  { id: 29, nome: "A Cigana", simbolo: "👩", sentido: "você mesma, a figura feminina da história; a sua intuição está no centro." },
  { id: 30, nome: "Os Lírios", simbolo: "⚜️", sentido: "paz, maturidade e harmonia; calma e serenidade trazem a resposta." },
  { id: 31, nome: "O Sol", simbolo: "☀️", sentido: "sucesso, clareza e energia; um período de luz depois da espera." },
  { id: 32, nome: "A Lua", simbolo: "🌙", sentido: "emoção, intuição e reconhecimento; escute o que sente, mesmo sem explicar." },
  { id: 33, nome: "A Chave", simbolo: "🗝️", sentido: "solução e abertura; a resposta está mais perto do que parece." },
  { id: 34, nome: "Os Peixes", simbolo: "🐟", sentido: "prosperidade e fluxo; os recursos circulam quando você se movimenta." },
  { id: 35, nome: "A Âncora", simbolo: "⚓", sentido: "estabilidade e firmeza; o que é sólido permanece, e você pode confiar nisso." },
  { id: 36, nome: "A Cruz", simbolo: "✝️", sentido: "fé e propósito; um peso que se carrega com sentido, e que também passa." },
];
