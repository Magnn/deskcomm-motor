/**
 * BRIEFS DE ANÚNCIO — nível de consciência, desejo/dor, medo oculto e promessa POR ANÚNCIO, não só
 * pelo agente inteiro (a aba "Consciência", `ai_agents.config.consciencia`).
 *
 * ─── Por que uma tabela, e não mais uma chave em `config` ────────────────────────────────────────
 * As abas Identidade/Oferta/Consciência/Objeções/Limites são um objeto SÓ por agente. Isto aqui é
 * uma LISTA — o mesmo agente pode atender vários anúncios com ângulos diferentes ao mesmo tempo —,
 * e por isso vive em `ai_agent_ad_briefs` (migration 0904), não em mais uma chave jsonb.
 *
 * ─── Como casa com o contato ──────────────────────────────────────────────────────────────────────
 * `ad_id` exato (o mesmo `adId` que `lib/leads/atribuicao-de-anuncio.ts` grava em
 * `contacts.source_metadata`) vence sempre que existir — é o índice único parcial da migration 0904,
 * então nunca há ambiguidade nesse caminho. Na ausência de `ad_id`, `titulo_contem` casa por SUBSTRING
 * (via `strpos`, nunca `LIKE` com concatenação — um `%` digitado pelo dono num trecho de título não
 * deve virar curinga). Mais de um título batendo é tratado como "não resolveu": a função nunca
 * escolhe às cegas, e quem chama cai no default do agente.
 */
import { z } from "zod";
import type pg from "pg";

import { NIVEIS_DE_CONSCIENCIA, type ConscienciaConfig } from "./tipos";

const textoCurto = (max: number) => z.string().trim().min(1).max(max);

export const adBriefInputSchema = z
  .strictObject({
    rotulo: textoCurto(80),
    ad_id: textoCurto(100).optional(),
    titulo_contem: textoCurto(140).optional(),
    nivel: z.enum(NIVEIS_DE_CONSCIENCIA).optional(),
    desejo_ou_dor: textoCurto(300).optional(),
    medo_oculto: textoCurto(300).optional(),
    promessa: textoCurto(300).optional(),
    ativo: z.boolean().default(true),
  })
  .refine((v) => v.ad_id !== undefined || v.titulo_contem !== undefined, {
    message: "Preencha o ID do anúncio ou um trecho do título — pelo menos um dos dois.",
    path: ["ad_id"],
  });
export type AdBriefInput = z.infer<typeof adBriefInputSchema>;

export interface AdBriefRow {
  id: string;
  rotulo: string;
  ad_id: string | null;
  titulo_contem: string | null;
  nivel: ConscienciaConfig["nivel"] | null;
  desejo_ou_dor: string | null;
  medo_oculto: string | null;
  promessa: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** O que a resolução precisa saber do anúncio do contato — mesmos dois campos de `AnuncioDoContato`. */
export interface AnuncioParaResolucao {
  adId: string | null;
  titulo: string | null;
}

type Db = Pick<pg.Pool, "query">;
type LinhaDeResolucao = Pick<AdBriefRow, "nivel" | "desejo_ou_dor" | "medo_oculto" | "promessa">;

function paraConsciencia(row: LinhaDeResolucao): ConscienciaConfig {
  return {
    enabled: true,
    ...(row.nivel !== null ? { nivel: row.nivel } : {}),
    ...(row.desejo_ou_dor !== null ? { desejo_ou_dor: row.desejo_ou_dor } : {}),
    ...(row.medo_oculto !== null ? { medo_oculto: row.medo_oculto } : {}),
    ...(row.promessa !== null ? { promessa: row.promessa } : {}),
  };
}

/**
 * Resolve qual consciência vale para ESTE contato: brief por `ad_id` exato > brief por trecho do
 * título > `null` (quem chama cai para o default do agente). Falha de leitura também vira `null` —
 * a resolução nunca pode derrubar o turno.
 */
export async function resolverConscienciaDoAnuncio(
  db: Db,
  args: { organizationId: string; agentId: string; anuncio: AnuncioParaResolucao | null },
): Promise<ConscienciaConfig | null> {
  const anuncio = args.anuncio;
  if (anuncio === null) return null;
  const { adId, titulo } = anuncio;
  if (adId === null && titulo === null) return null;

  if (adId !== null) {
    const { rows } = await db.query<LinhaDeResolucao>(
      `select nivel, desejo_ou_dor, medo_oculto, promessa
         from ai_agent_ad_briefs
        where organization_id = $1 and agent_id = $2 and ativo and ad_id = $3
        limit 2`,
      [args.organizationId, args.agentId, adId],
    );
    // >1 não devia acontecer (índice único cobre isto) — defesa em profundidade, nunca escolhe às cegas.
    if (rows.length === 1) return paraConsciencia(rows[0]!);
    if (rows.length > 1) return null;
  }

  if (titulo !== null) {
    const { rows } = await db.query<LinhaDeResolucao>(
      `select nivel, desejo_ou_dor, medo_oculto, promessa
         from ai_agent_ad_briefs
        where organization_id = $1 and agent_id = $2 and ativo
          and titulo_contem is not null
          and strpos(lower($3), lower(titulo_contem)) > 0
        limit 2`,
      [args.organizationId, args.agentId, titulo],
    );
    if (rows.length === 1) return paraConsciencia(rows[0]!);
  }

  return null;
}
