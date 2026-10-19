/**
 * O PERFIL DA ÁREA DO CLIENTE — a entrada com 3 perguntas (pedido do dono em 19/10/2026): o que mais pede
 * cuidado agora (o foco), o que está pesando e a data de nascimento. Com isso a área abre "feita para ela":
 * o céu do nascimento (Sol e Lua, calculados de verdade em `lib/relatorio/astrologia.ts`) e perguntas para a
 * Mesa no tema dela.
 *
 * Regras puras, sem a astronomia (o céu do nascimento mora em `ceu.ts`, só no servidor, para não pesar no
 * celular). A linha em `area_perfis` (migration 0940) existir quer dizer que a entrada foi feita ou pulada.
 */
export const FOCOS = ["amor", "dinheiro", "familia", "saude", "caminhos", "autoconhecimento"] as const;
export type Foco = (typeof FOCOS)[number];

export function ehFoco(v: unknown): v is Foco {
  return typeof v === "string" && (FOCOS as readonly string[]).includes(v);
}

/** O nome do foco na tela e o tema dele numa frase ("sobre o seu amor"). */
export const NOME_DO_FOCO: Record<Foco, { nome: string; tema: string; simbolo: string }> = {
  amor: { nome: "Amor e relacionamento", tema: "o seu amor", simbolo: "♡" },
  dinheiro: { nome: "Dinheiro e trabalho", tema: "o seu dinheiro e o seu trabalho", simbolo: "✧" },
  familia: { nome: "Família", tema: "a sua família", simbolo: "⌂" },
  saude: { nome: "Saúde e energia", tema: "a sua energia", simbolo: "☀" },
  caminhos: { nome: "Caminhos e decisões", tema: "os seus caminhos", simbolo: "✦" },
  autoconhecimento: { nome: "Autoconhecimento", tema: "você mesma", simbolo: "☾" },
};

/** Perguntas prontas para a Mesa, no tema do foco: um toque preenche a pergunta. */
export const PERGUNTAS_DO_FOCO: Record<Foco, readonly string[]> = {
  amor: ["O que preciso entender sobre o meu relacionamento agora?", "Essa pessoa pensa em mim?", "O que está bloqueando o amor na minha vida?"],
  dinheiro: ["O que está travando o meu dinheiro?", "Qual caminho seguir no meu trabalho?", "O que preciso fazer para prosperar este mês?"],
  familia: ["Como trazer paz para a minha família?", "O que preciso entender sobre essa situação em casa?", "Como lidar com quem eu amo e me machuca?"],
  saude: ["O que está tirando a minha energia?", "Do que o meu corpo e a minha alma precisam agora?", "Como recuperar o meu ânimo?"],
  caminhos: ["Qual decisão tomar agora?", "O que me espera nos próximos meses?", "Estou no caminho certo?"],
  autoconhecimento: ["O que eu preciso enxergar em mim agora?", "Qual é a minha força escondida?", "O que preciso deixar ir?"],
};
