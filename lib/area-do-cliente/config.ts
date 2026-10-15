/**
 * A configuração da área do cliente de uma organização: mora em
 * `organizations.settings.area` (jsonb), escrita só por
 * `PUT /api/v1/area/config` (manager+).
 *
 * Desligada por padrão: a página pública responde "não encontrada" até a
 * empresa ligar — ninguém descobre uma área vazia por adivinhar o endereço.
 */
import { z } from "zod";

export const configDaAreaSchema = z.strictObject({
  ativo: z.boolean().default(false),
  /** Título no topo da área. Vazio = o nome de exibição da organização. */
  titulo: z.string().trim().max(60).optional(),
  /** A frase abaixo do "Olá". */
  boas_vindas: z.string().trim().max(200).optional(),
  /**
   * O número do botão "Falar com a gente", só dígitos com DDI. Fica AQUI e não
   * no canal: quando o número muda (ou cai), muda num lugar só e nenhum cliente
   * fica sem contato.
   */
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, "só números, com DDI e DDD (ex.: 5569999999999)")
    .optional(),
  /**
   * Mostra a carta do dia (o baralho da leitura, `lib/leitura/baralho.ts`). Só
   * faz sentido para quem tem as fotos das cartas no Storage — por isso desligada
   * por padrão.
   */
  carta_do_dia: z.boolean().optional(),
  /** Cor principal da área, em hex. Vazio = a cor do produto. */
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor em hex, ex.: #7c3aed")
    .optional(),
});
export type ConfigDaArea = z.infer<typeof configDaAreaSchema>;

export const CONFIG_PADRAO_DA_AREA: ConfigDaArea = { ativo: false };

/** Lê `settings.area` sem nunca lançar: config ruim = área desligada. */
export function lerConfigDaArea(settings: unknown): ConfigDaArea {
  const bruto = (settings as { area?: unknown } | null)?.area;
  const lido = configDaAreaSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : CONFIG_PADRAO_DA_AREA;
}

export const COR_PADRAO_DA_AREA = "#7c3aed";
