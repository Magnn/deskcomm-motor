/**
 * OFERTA PROATIVA — a configuração, num lugar só.
 *
 * Quem já conversou com o agente e não está mais na conversa recebe, no máximo uma vez por dia, UMA oferta
 * que cabe no que ela viveu ali: quem recebeu a leitura e não comprou ouve o produto de entrada; quem comprou
 * e falou de alguém ouve o produto seguinte. É DADO do agente (`followup.oferta_proativa` na versão
 * publicada), não fluxo desenhado: uma lista curta de ofertas, na ordem de prioridade, cada uma com a regra de
 * quem a recebe e o MOTIVO que o turno do agente lê para escrever a mensagem.
 *
 * O agente escreve o texto (ou decide não enviar); esta configuração só decide QUEM e QUAL. Quem decide o
 * ritmo é `espaco_segundos`: uma oferta por organização a cada tantos segundos, porque disparo em rajada é o
 * caminho mais curto para o número ser banido.
 *
 * Módulo folha (só zod): lido pela validação e pelo worker.
 */
import { z } from "zod";

/** Expressão regular válida (sem flags; o worker usa `i`). Vazia não é aceita: ausente = sem condição. */
const regex = z
  .string()
  .min(1)
  .max(600)
  .refine((s) => {
    try {
      new RegExp(s, "i");
      return true;
    } catch {
      return false;
    }
  }, "oferta_regex_invalida");

export const ofertaSchema = z
  .object({
    /** Identificador estável: é por ele que a repetição é contada. */
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    /** O que o turno do agente lê: o que oferecer, como, e o que NÃO fazer. */
    motivo: z.string().min(20).max(2000),
    /** `true` = só quem já comprou; `false` = só quem nunca comprou; ausente = todos. */
    so_quem_comprou: z.boolean().optional(),
    /** O agente já disse isto na conversa (ex.: entregou a leitura). Ausente = sem condição. */
    agente_ja_disse: regex.optional(),
    /** O cliente disse isto na conversa (ex.: falou de outra pessoa). Ausente = sem condição. */
    cliente_disse: regex.optional(),
    /** Se o agente disse isto nos últimos `dias_entre_repeticoes` dias, a oferta já foi feita. */
    ja_ofertada_se_agente_disse: regex.optional(),
    /** Se uma compra da pessoa tem produto que casa com isto, ela já tem e não recebe. */
    ja_tem_se_comprou: regex.optional(),
    dias_entre_repeticoes: z.number().int().min(1).max(90).default(5),
  })
  .strict();

export const ofertaProativaSchema = z
  .object({
    enabled: z.boolean(),
    ofertas: z.array(ofertaSchema).min(1).max(10),
    /** Ritmo da organização: no mínimo isto entre duas ofertas, para qualquer pessoa. */
    espaco_segundos: z.number().int().min(30).max(3600).default(120),
    /** Teto de ofertas da organização por dia (fuso da organização). */
    maximo_por_dia: z.number().int().min(1).max(500).default(60),
    /** Só quem falou nos últimos tantos dias. */
    falou_nos_ultimos_dias: z.number().int().min(1).max(30).default(7),
    /** E está calado há pelo menos isto: conversa viva é do atendimento, não da oferta. */
    quieto_ha_minutos: z.number().int().min(10).max(1440).default(40),
    /** Intervalo mínimo entre duas ofertas para a MESMA pessoa. */
    horas_entre_ofertas: z.number().int().min(6).max(720).default(20),
    /** Faixa do dia (hora cheia, fuso da organização) em que a oferta pode sair: [inicio, fim). */
    hora_inicio: z.number().int().min(0).max(23).default(8),
    hora_fim: z.number().int().min(1).max(24).default(21),
    /** Quem disse isto em qualquer mensagem recente não recebe oferta nenhuma. */
    nao_oferecer_se_cliente_disse: regex.optional(),
  })
  .strict()
  .refine((c) => c.hora_fim > c.hora_inicio, { path: ["hora_fim"], message: "oferta_faixa_invertida" })
  .refine((c) => new Set(c.ofertas.map((o) => o.id)).size === c.ofertas.length, {
    path: ["ofertas"],
    message: "oferta_id_repetido",
  });

export type Oferta = z.infer<typeof ofertaSchema>;
export type OfertaProativa = z.infer<typeof ofertaProativaSchema>;

/**
 * Recusa, desconfiança, aperto e sofrimento, em português: quem disse qualquer uma destas coisas não recebe
 * oferta, mesmo sem a organização ter escrito a sua. Somada à da organização, nunca trocada por ela.
 * O pedido de parar tem detector próprio (`lib/opt-out/deteccao.ts`), aplicado à parte.
 */
// Crise escrita abreviada também conta: em 21/10/2026 "Ate minha vd ja pensei em tirar" passou pela regra antiga.
export const NAO_OFERECER_PADRAO =
  "sem dinheiro|n[ãa]o tenho (dinheiro|condi)|desempregad|sem condi|passando fome|n[ãa]o quero mais|para de me|n[ãa]o me mand|parar atendimento|golpe|golpista|denunci|vou bloque|suic[ií]d|me matar|quero morrer|tirar minha vida|pensei em (me )?(tirar|matar|sumir)|(minha )?(vida|vd) j[áa] pensei|tirar a (minha )?(vida|vd)|acabar com (a minha vida|tudo)|n[ãa]o (quero|aguento) mais viver";

/**
 * Lê `followup.oferta_proativa` da versão publicada. `null` = desligada, ausente ou shape inválido — nos três
 * casos ninguém recebe oferta: contato proativo só com configuração legível.
 */
export function lerOfertaProativa(followup: unknown): OfertaProativa | null {
  if (typeof followup !== "object" || followup === null) return null;
  const lida = ofertaProativaSchema.safeParse((followup as { oferta_proativa?: unknown }).oferta_proativa);
  return lida.success && lida.data.enabled ? lida.data : null;
}
