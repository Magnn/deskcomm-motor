/**
 * CONSCIÊNCIA DO LEAD — o que o dono do negócio sabe sobre QUEM chega e o quanto essa pessoa já
 * entende do próprio problema, antes de o agente tentar vender qualquer coisa.
 *
 * Sexta das abas ESTRUTURADAS da configuração do agente (Preço, Identidade, Oferta, Objeções,
 * Limites, Consciência). Vem DEPOIS da Oferta e ANTES de Objeções, de propósito: calibra COMO
 * conduzir a pessoa até a oferta — a mesma oferta soa diferente para quem ainda não sabe que tem
 * o problema e para quem já está comparando fornecedores — e essa calibração precisa valer antes
 * de o agente decidir como responder a uma objeção.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * O NÍVEL é a única coisa fechada (framework de copywriting conhecido — Eugene Schwartz, "5 níveis
 * de consciência" —, não vocabulário de nicho: vale para clínica, loja, imobiliária, curso, ritual,
 * qualquer um). O QUE a pessoa deseja, teme ou dói NÃO tem lista fechada: nada de "amor,
 * prosperidade, propósito" — isso é vocabulário de UM nicho (o espiritual) e travaria qualquer outro.
 * O dono escreve em texto livre, como o próprio negócio dele nomeia a dor do cliente.
 *
 * ─── O que NÃO está aqui, e por quê ────────────────────────────────────────────────────────────────
 *   • OBJEÇÕES DITAS EM VOZ ALTA ("está caro", "não confio"). Têm aba própria (Objeções), com a
 *     resposta que o dono aprovou para cada uma. Aqui é o oposto: o medo de FUNDO, que a pessoa
 *     raramente diz com todas as letras — o agente só o reconhece com delicadeza, nunca o nomeia cru.
 *   • O PREÇO. Fica na aba Preço; aqui não se reescreve o piso nem o degrau.
 *   • A PROMESSA MÉDICA/DE RESULTADO GARANTIDO. A camada universal de segurança já proíbe prometer
 *     resultado, para todo agente — esta aba não abre exceção nenhuma a isso.
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.consciencia` (jsonb, ao lado de `identity`, `offer`, `objections` e `limits`),
 * escrita SÓ por `PUT /api/v1/ai/agents/:id/consciencia`, e vale no PRÓXIMO turno, sem publicar
 * versão. `null` (ou `enabled: false`) = desligado: o turno segue como antes, byte a byte.
 */
import { z } from "zod";

/**
 * Os 5 níveis de consciência (Eugene Schwartz), na ordem em que um lead frio costuma amadurecer.
 * `frase` é a instrução que o agente lê — nunca o jargão de marketing, que não ajuda o modelo a agir.
 */
export const NIVEIS_DE_CONSCIENCIA = [
  "nao_sabe_do_problema",
  "sabe_do_problema",
  "conhece_solucoes",
  "conhece_a_oferta",
  "pronto_para_decidir",
] as const;
export type NivelDeConsciencia = (typeof NIVEIS_DE_CONSCIENCIA)[number];

export const DESCRICAO_DO_NIVEL: Record<NivelDeConsciencia, { rotulo: string; tela: string; frase: string }> = {
  nao_sabe_do_problema: {
    rotulo: "Ainda não percebeu o problema",
    tela: "Não fala em resolver nada específico — só comenta um incômodo solto, sem nome.",
    frase:
      "Esta pessoa ainda não nomeou o próprio problema para si mesma. Não ofereça nada ainda: ajude-a a reconhecer o que está sentindo, com perguntas, antes de falar de solução.",
  },
  sabe_do_problema: {
    rotulo: "Sabe do problema, não conhece solução",
    tela: "Já nomeia o que a incomoda, mas não sabe que existe algo que resolve isso.",
    frase:
      "Esta pessoa já reconhece o problema, mas não sabe que existe uma solução para ele. Mostre que existe caminho antes de falar da sua oferta especificamente.",
  },
  conhece_solucoes: {
    rotulo: "Sabe que existem soluções, não conhece a sua",
    tela: "Já pesquisou ou já tentou outras coisas, mas não conhece a sua oferta.",
    frase:
      "Esta pessoa já sabe que soluções existem (já tentou outras, ou já pesquisou), mas não conhece a sua. Foque em como a sua é diferente, não em convencê-la de que uma solução é possível.",
  },
  conhece_a_oferta: {
    rotulo: "Já conhece a oferta, ainda não decidiu",
    tela: "Já sabe o que você vende — falta o empurrão para decidir.",
    frase:
      "Esta pessoa já conhece a sua oferta e está avaliando. Não repita o básico: vá direto ao que a impede de decidir (dúvida, comparação, medo) e resolva isso.",
  },
  pronto_para_decidir: {
    rotulo: "Pronto para decidir",
    tela: "Já quer comprar — só falta o caminho para pagar.",
    frase:
      "Esta pessoa já quer fechar. Não alongue a conversa com contexto que ela não pediu: confirme os detalhes e leve direto para o pagamento.",
  },
};

const textoCurto = (max: number) => z.string().trim().min(1).max(max);

export const conscienciaSchema = z.strictObject({
  enabled: z.boolean(),
  nivel: z.enum(NIVEIS_DE_CONSCIENCIA).optional(),
  /** O que esta pessoa mais quer resolver ou conquistar, nas palavras do dono — nunca lista fechada. */
  desejo_ou_dor: textoCurto(300).optional(),
  /**
   * O medo de fundo, raramente dito em voz alta — distinto de uma objeção (que a pessoa FALA). O
   * agente reconhece com delicadeza; nunca o nomeia cru nem o repete de volta à pessoa.
   */
  medo_oculto: textoCurto(300).optional(),
  /** A promessa central desta oferta — o que a torna diferente do resto, em uma frase do dono. */
  promessa: textoCurto(300).optional(),
});
export type ConscienciaConfig = z.infer<typeof conscienciaSchema>;

/**
 * Lê `config.consciencia` de forma DEFENSIVA: shape quebrado, desligado ou vazio viram `null` e o
 * turno segue sem bloco. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerConsciencia(config: unknown): ConscienciaConfig | null {
  const bruto = (config as { consciencia?: unknown } | null | undefined)?.consciencia;
  if (bruto === undefined || bruto === null) return null;
  const r = conscienciaSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
