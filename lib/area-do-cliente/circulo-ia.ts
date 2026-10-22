/**
 * A IA da área do cliente — o EMISSOR dos pontos `area_circulo_conteudo` (o
 * conteúdo do mês do Círculo), `area_circulo_resposta` (a pergunta do mês),
 * `area_presente_resposta` (a pergunta dada de presente) e `area_ano_pessoal`
 * (a leitura do ano que começa no aniversário).
 *
 * Passa por `runModelCall`: mesma chave (da empresa ou da plataforma), mesmo
 * teto de gasto e mesmo registro em `llm_calls` de qualquer outra chamada.
 *
 * As regras de tom moram AQUI, no pedido, e não no roteiro do agente: quem lê
 * este texto já pagou e está numa página só dela, sem ninguém da equipe olhando
 * antes. Orientação, nunca promessa — sem resultado garantido, sem prazo, sem
 * cura, sem medo, sem pedir dinheiro e sem oferecer produto.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import { BARALHO, type Carta } from "@/lib/leitura/baralho";

import { ROTULO_DA_RESPOSTA, type IdDaPergunta } from "./sinastria";

export const REGRAS_DE_TOM = [
  "Escreva em português do Brasil, com acolhimento e simplicidade.",
  "É orientação e reflexão, nunca previsão certa: não prometa resultado, não dê prazo, não fale em cura.",
  "Não use medo, ameaça, \"energia bloqueada\", \"trabalho feito\" nem urgência.",
  "Não peça dinheiro, não ofereça produto, serviço, desconto ou link.",
  "Não dê diagnóstico nem conselho médico, jurídico ou financeiro; se o assunto for esse, sugira procurar um profissional.",
].join("\n- ");

export function pedidoDoConteudo(empresa: string, mes: string): string {
  return [
    `Você escreve o conteúdo mensal do "Círculo", o espaço de assinantes de ${empresa}.`,
    `Mês: ${mes}.`,
    "Escreva três partes curtas: (1) a energia do mês, (2) um ritual simples para fazer em casa, em passos numerados, com itens comuns, e (3) uma reflexão para o diário.",
    `Regras:\n- ${REGRAS_DE_TOM}`,
    "Até 450 palavras no total.",
    'Responda só com JSON, sem texto fora dele: {"titulo": "…", "texto": "…"}. No "texto", separe as partes com uma linha em branco.',
  ].join("\n\n");
}

export function pedidoDaResposta(empresa: string, pergunta: string, carta: Carta, origem: "circulo" | "presente" = "circulo"): string {
  return [
    origem === "presente"
      ? `Você é a taróloga de ${empresa}. Esta pessoa ganhou de presente uma pergunta de tarô e fez a pergunta dela.`
      : `Você é a taróloga de ${empresa}. Uma assinante do Círculo fez a pergunta do mês.`,
    `Pergunta: """${pergunta.slice(0, 600)}"""`,
    `A carta tirada para ela foi ${carta.nome} (símbolos: ${carta.simbolos.join(", ")}). Sentido geral: ${carta.sentido.geral}`,
    "Responda a ela em até 180 palavras: diga qual carta saiu, o que ela sugere para a pergunta e um pequeno passo que ela pode dar.",
    `Regras:\n- ${REGRAS_DE_TOM}`,
    "Responda só com o texto da resposta, sem título.",
  ].join("\n\n");
}

/** Lê o JSON do conteúdo; `null` se a resposta não servir. */
export function lerConteudo(texto: string): { titulo: string; texto: string } | null {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  try {
    const j = JSON.parse(texto.slice(inicio, fim + 1)) as { titulo?: unknown; texto?: unknown };
    if (typeof j.titulo !== "string" || typeof j.texto !== "string") return null;
    const titulo = j.titulo.trim().slice(0, 120);
    const corpo = j.texto.trim().slice(0, 8000);
    return titulo && corpo ? { titulo, texto: corpo } : null;
  } catch {
    return null;
  }
}

/** A carta da pergunta: sorteio de verdade, feito pelo código e não pela IA. */
export function cartaDaPergunta(aleatorio: () => number = Math.random): Carta {
  return BARALHO[Math.floor(aleatorio() * BARALHO.length)] as Carta;
}

export async function gerarConteudoDoMes(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; empresa: string; mes: string },
): Promise<{ titulo: string; texto: string; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: null,
    jobId: null,
    purpose: "area_circulo_conteudo",
    messages: [{ role: "user", content: pedidoDoConteudo(d.empresa, d.mes) }],
  });
  const lido = lerConteudo(chamada.result.text ?? "");
  return lido ? { ...lido, modelo: chamada.model ?? null } : null;
}

export async function responderPergunta(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: {
    organizationId: string;
    contactId: string;
    empresa: string;
    pergunta: string;
    carta: Carta;
    origem?: "circulo" | "presente";
  },
): Promise<string | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: d.origem === "presente" ? "area_presente_resposta" : "area_circulo_resposta",
    messages: [{ role: "user", content: pedidoDaResposta(d.empresa, d.pergunta, d.carta, d.origem ?? "circulo") }],
  });
  const texto = (chamada.result.text ?? "").trim();
  return texto ? texto.slice(0, 4000) : null;
}

export function pedidoDoAnoPessoal(empresa: string, d: { numero: number; ano: number; primeiroNome: string }): string {
  return [
    `Você escreve a leitura do Ano Pessoal de uma cliente de ${empresa}${d.primeiroNome ? `, ${d.primeiroNome}` : ""}.`,
    `Pela numerologia, o ano que começa no aniversário dela em ${d.ano} é um Ano Pessoal ${d.numero}.`,
    "Escreva: (1) o tema do Ano Pessoal " + d.numero + " em poucas linhas, (2) uma orientação para cada trimestre do ano (quatro blocos curtos) e (3) três intenções para ela anotar.",
    `Regras:\n- ${REGRAS_DE_TOM}`,
    "Até 700 palavras. Use o nome dela no máximo duas vezes.",
    "Responda só com o texto, com uma linha em branco entre as partes.",
  ].join("\n\n");
}

export function pedidoDaSinastria(
  empresa: string,
  d: {
    nomeDela: string;
    nomeDele: string;
    signoDela: string;
    signoDele: string;
    elementoDela: string;
    elementoDele: string;
    respostas: Record<string, string>;
  },
): string {
  const contexto = Object.entries(d.respostas)
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${ROTULO_DA_RESPOSTA[k as IdDaPergunta] ?? k}: ${v}`)
    .join("\n");
  return [
    `Você escreve "O Código da Conexão", a sinastria de um casal, para uma cliente de ${empresa}.`,
    `Ela: ${d.nomeDela}, signo solar ${d.signoDela} (elemento ${d.elementoDela}). Ele: ${d.nomeDele}, signo solar ${d.signoDele} (elemento ${d.elementoDele}).`,
    contexto ? `O que ela contou no quiz:\n${contexto}` : "",
    "Escreva em seis partes, cada uma com um título curto em linha própria: (1) A energia de cada um no amor, (2) O que une vocês, (3) Onde vocês se desencontram, (4) O padrão que se repete — ligue-o ao motivo dos desentendimentos que ela contou, (5) Como conversar com a outra pessoa — use o jeito como ela sente o carinho, (6) Uma prática para os próximos 7 dias, que responda ao que ela quer entender.",
    `Regras:\n- ${REGRAS_DE_TOM}\n- Fale do que os signos e os elementos indicam como TENDÊNCIA, nunca como certeza. Nunca diga o que ele sente, pensa ou vai fazer, nem prometa que vão ficar juntos.\n- Se ela contou que estão separados ou que ele some, acolha sem alimentar espera: o foco é ela entender e escolher.`,
    "Entre 700 e 1.000 palavras. Use o nome dela no máximo três vezes e o dele no máximo três.",
    "Responda só com o texto, com uma linha em branco entre as partes.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function gerarSinastria(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: Parameters<typeof pedidoDaSinastria>[1] & { organizationId: string; contactId: string; empresa: string },
): Promise<{ texto: string; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_sinastria",
    messages: [{ role: "user", content: pedidoDaSinastria(d.empresa, d) }],
  });
  const texto = (chamada.result.text ?? "").trim();
  return texto ? { texto: texto.slice(0, 16000), modelo: chamada.model ?? null } : null;
}

export function pedidoDoQuiz(
  empresa: string,
  d: { tipo: "prosperidade" | "caminhos" | "par"; nome: string; titulo: string; detalhe: string; fato?: string; respostas: Record<string, string> },
): string {
  // A hora e o lugar de nascimento (Retrato do Par) já viraram o `fato` calculado: não entram como "resposta".
  const contexto = Object.entries(d.respostas)
    .filter(([k, v]) => v && k !== "hora" && k !== "lugar")
    .map(([, v]) => `- ${v}`)
    .join("\n");
  const comum = [
    `Regras:\n- ${REGRAS_DE_TOM}\n- Nunca prometa dinheiro, emprego, cura, volta de alguém ou prazo. Não dê conselho financeiro: fale de atitude, organização e intenção.\n- Não fale em "bloqueio", "energia ruim", "carga" nem "trabalho feito".`,
    "Entre 600 e 900 palavras. Use o nome dela no máximo três vezes.",
    "Responda só com o texto, com uma linha em branco entre as partes, cada parte com um título curto em linha própria.",
  ];
  if (d.tipo === "par") {
    return [
      `Você escreve "O Retrato do Par", uma leitura de astrologia para ${d.nome}, cliente de ${empresa}: o perfil de pessoa que combina com ela.`,
      `Calculado do mapa dela (posições reais): ${d.fato ?? d.detalhe}.`,
      "Vênus descreve o que a ATRAI; o Descendente (casa 7) descreve o que lhe FAZ BEM numa relação. Quando os dois estão em elementos que não conversam, ela tende a se apaixonar pelo que não a faz bem, e o padrão se repete.",
      contexto ? `O que ela contou no quiz:\n${contexto}` : "",
      "Escreva em cinco partes: (1) O que te atrai (Vênus), (2) O que te faz bem (o Descendente; sem a hora, diga com clareza que esta parte precisa da hora e fale do que Vênus pede), (3) O padrão que se repete, ligado ao que ela contou, (4) O perfil que combina com você: os signos e elementos listados e os traços desse perfil, (5) O sinal de alerta: o tipo que repete o padrão, e uma prática para os próximos 7 dias.",
      "Fale de PERFIL e de TENDÊNCIA, nunca de uma pessoa específica: não invente nome, inicial, aparência nem data de encontro, e não prometa que alguém vai aparecer.",
      ...comum,
    ].filter(Boolean).join("\n\n");
  }
  if (d.tipo === "prosperidade") {
    return [
      `Você escreve "Seu Mapa da Prosperidade", uma leitura de numerologia para ${d.nome}, cliente de ${empresa}.`,
      `Pela numerologia popular, o número do destino dela é ${d.detalhe.replace(/\D/g, "")} (${d.titulo}).`,
      d.fato ? `${d.fato}. A prévia grátis mostrou esse número; a leitura completa explica o que ele pede.` : "",
      contexto ? `O que ela contou no quiz:\n${contexto}` : "",
      `Escreva em cinco partes: (1) O que o ${d.detalhe} diz sobre a forma dela de prosperar, (2) Os talentos que ela pode usar, (3) O padrão que costuma atrapalhar, ligado ao que ela disse que mais pesa, (4) ${d.fato ? "O que o ano pessoal pede e " : ""}três atitudes práticas para as próximas semanas, (5) Uma intenção para escrever e guardar.`,
      ...comum,
    ].filter(Boolean).join("\n\n");
  }
  return [
    `Você escreve "Seu Ritual de Abertura de Caminhos", um ritual guiado de 7 dias para ${d.nome}, cliente de ${empresa}.`,
    `Pelo quiz, o perfil dela é ${d.titulo}.${d.fato ? ` ${d.fato}` : ""}`,
    contexto ? `O que ela respondeu:\n${contexto}` : "",
    `Escreva em quatro partes: (1) O que o perfil ${d.titulo} e a carta-chave mostram sobre o momento dela, (2) O que separar (coisas simples de casa: uma vela branca, um copo de água, papel e caneta), (3) O ritual de 7 dias, um parágrafo curto por dia, cada dia com uma reflexão e um gesto pequeno, (4) Como encerrar e o que observar depois.`,
    "Segurança: vela sempre num pratinho firme, longe de cortina e de criança, e apagada antes de sair ou dormir.",
    ...comum,
  ].filter(Boolean).join("\n\n");
}

export async function gerarQuiz(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: Parameters<typeof pedidoDoQuiz>[1] & { organizationId: string; contactId: string; empresa: string },
): Promise<{ texto: string; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: d.tipo === "prosperidade" ? "area_quiz_prosperidade" : d.tipo === "par" ? "area_quiz_par" : "area_quiz_caminhos",
    messages: [{ role: "user", content: pedidoDoQuiz(d.empresa, d) }],
  });
  const texto = (chamada.result.text ?? "").trim();
  return texto ? { texto: texto.slice(0, 16000), modelo: chamada.model ?? null } : null;
}

export async function gerarAnoPessoal(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; empresa: string; numero: number; ano: number; primeiroNome: string },
): Promise<{ texto: string; modelo: string | null } | null> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_ano_pessoal",
    messages: [{ role: "user", content: pedidoDoAnoPessoal(d.empresa, d) }],
  });
  const texto = (chamada.result.text ?? "").trim();
  return texto ? { texto: texto.slice(0, 12000), modelo: chamada.model ?? null } : null;
}
