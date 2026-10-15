/**
 * A CARTA DO DIA da área do cliente — o motivo leve para a pessoa voltar todo
 * dia, sem nada a pagar.
 *
 * A carta é a MESMA para a mesma pessoa no mesmo dia (sorteio determinístico
 * pelo contato e pela data no fuso da organização): voltar à tarde e ver outra
 * carta faria o dia parecer roleta, e a área não é roleta. Amanhã, outra.
 *
 * O baralho é o da leitura (`lib/leitura/baralho.ts`, os 22 Arcanos Maiores) e
 * a foto é a mesma que a leitura usa. A mensagem do dia é própria, curta e de
 * orientação: nenhuma promete resultado, prazo ou cura — a carta convida a
 * olhar para algo, não garante nada.
 */
import { createHash } from "node:crypto";

import { BARALHO, TAMANHO_DO_BARALHO, type Carta } from "@/lib/leitura/baralho";

export const MENSAGEM_DO_DIA: Readonly<Record<number, string>> = {
  1: "Hoje pede um primeiro passo pequeno. Não precisa do mapa inteiro para sair do lugar.",
  2: "Você já tem nas mãos o que precisa para hoje. Escolha uma coisa e comece por ela.",
  3: "Escute o que você sente antes de responder. A sua intuição está falando baixinho hoje.",
  4: "Cuide de algo que está crescendo em você: uma ideia, um projeto, um afeto. Dê tempo e atenção.",
  5: "Um pouco de ordem traz paz. Organize uma coisa só, e o resto do dia fica mais leve.",
  6: "Busque um conselho de quem você confia. Às vezes a resposta vem de uma conversa simples.",
  7: "Hoje é dia de escolher com o coração e com a cabeça juntos. Qual opção te deixa em paz?",
  8: "Siga em frente com firmeza no que você decidiu. Constância vale mais que pressa.",
  9: "Sua força hoje está na calma. Responda com paciência, inclusive a você mesma.",
  10: "Reserve um momento de silêncio só seu. É nele que as respostas aparecem.",
  11: "As coisas mudam de lugar. Observe o que está girando a seu favor e aproveite com cuidado.",
  12: "Seja justa com você hoje: reconheça o que fez de bom, não só o que faltou.",
  13: "Olhar a situação por outro ângulo pode mudar tudo. Pausar também é caminhar.",
  14: "Deixe ir algo que já terminou. Abrir espaço é o começo de uma fase nova.",
  15: "Equilíbrio é a palavra do dia. Nem tanto, nem tão pouco: o meio-termo te protege.",
  16: "Repare no que te prende por hábito. Reconhecer já é o primeiro passo para soltar.",
  17: "Algo que parecia sólido pode balançar. O que é seu de verdade continua de pé.",
  18: "A esperança volta devagar. Anote hoje o que você quer ver florescer este mês.",
  19: "Nem tudo está claro ainda, e tudo bem. Vá com calma e confie no que você sente.",
  20: "Um dia para se aquecer no que dá certo. Compartilhe uma alegria, por menor que seja.",
  21: "Uma escuta interna te chama. Perdoe uma coisa antiga e siga mais leve.",
  22: "Celebre o caminho até aqui. Fechar um ciclo com gratidão abre o próximo.",
};

/** Qual carta, de 1 a 22, para esta pessoa neste dia (`AAAA-MM-DD` no fuso da organização). */
export function cartaDoDia(contactId: string, dia: string): Carta {
  const n = createHash("sha256").update(`${contactId}:${dia}`, "utf8").digest().readUInt32BE(0);
  const id = (n % TAMANHO_DO_BARALHO) + 1;
  return BARALHO.find((c) => c.id === id) as Carta;
}
