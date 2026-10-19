/**
 * A LEITURA DA MESA NARRADA — a mesma leitura escrita, falada pela voz do próprio servidor
 * (`lib/voz/servidor-proprio.ts`). Sem custo por uso: o modelo de voz roda na máquina da instalação.
 *
 * Gerada UMA vez por leitura e guardada no Storage (`<org>/leitura/narracoes/<id>.mp3`); quem ouve de
 * novo recebe o mesmo arquivo. Só narra leitura paga e já escrita, da própria pessoa.
 *
 * Duas vozes: a RÁPIDA (Kokoro, pronta na hora) e a HUMANA (Chatterbox, `lib/voz/servidor-humana.ts`),
 * que entra numa fila e fica pronta em alguns minutos — enquanto isso a resposta é `preparando`, com o
 * lugar na fila. Se a humana falhar ou não estiver configurada, a leitura sai na rápida.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKET_DAS_FOTOS } from "@/lib/catalogo/fotos";
import { logger } from "@/lib/logger";
import { baixarVozHumana, pedirVozHumana, vozHumanaConfigurada } from "@/lib/voz/servidor-humana";
import { falarNaVozPropria, vozPropriaConfigurada } from "@/lib/voz/servidor-proprio";

import { lerCartas, type CartaDaLeitura } from "./leituras";
import type { LeituraEscrita } from "./leituras-ia";
import { lerTextoGravado } from "./leituras-servidor";

const VALIDADE_S = 3600;

export function caminhoDaNarracao(orgId: string, leituraId: string): string {
  return `${orgId}/leitura/narracoes/${leituraId}.mp3`;
}

/** O texto que a voz fala: a leitura na ordem da tela, com pausas entre as partes. */
export function roteiroDaNarracao(cartas: CartaDaLeitura[], leitura: LeituraEscrita, primeiroNome: string): string {
  const partes = [primeiroNome ? `${primeiroNome}, as suas cartas chegaram.` : "As suas cartas chegaram."];
  cartas.forEach((c, i) => {
    const texto = leitura.cartas[i]?.trim();
    if (texto) partes.push(`${c.posicao}. ${c.nome}. ${texto}`);
  });
  partes.push(`O que as cartas dizem juntas. ${leitura.sintese.trim()}`);
  partes.push(`Um passo para os próximos dias. ${leitura.passo.trim()}`);
  // A linha em branco vira pausa na fala; markdown e emoji não se falam.
  return partes
    .map((p) => p.replace(/[*_#>`~]/g, "").replace(/\p{Extended_Pictographic}/gu, "").trim())
    .join("\n\n");
}

export type ResultadoDaNarracao =
  | { ok: true; url: string }
  | { ok: false; motivo: "preparando"; posicao: number }
  | { ok: false; motivo: "sem_voz" | "nao_encontrada" | "ainda_sem_texto" | "falhou" };

export interface OpcoesDaNarracao {
  /** Narrar com a voz humana (fila). `voz`: a voz clonada (`clone_…`); vazia = a padrão do serviço. */
  humana: { voz?: string } | null;
}

export async function narrarLeitura(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  leituraId: string,
  primeiroNome: string,
  opcoes: OpcoesDaNarracao = { humana: null },
): Promise<ResultadoDaNarracao> {
  const humana = opcoes.humana && vozHumanaConfigurada() ? opcoes.humana : null;
  if (!vozPropriaConfigurada() && !humana) return { ok: false, motivo: "sem_voz" };
  const { data } = await admin
    .from("area_leituras")
    .select("id, pago_at, cartas, texto")
    .eq("id", leituraId)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();
  const l = data as { id: string; pago_at: string | null; cartas: unknown; texto: string | null } | null;
  if (!l || !l.pago_at) return { ok: false, motivo: "nao_encontrada" };
  const leitura = lerTextoGravado(l.texto);
  const cartas = lerCartas(l.cartas);
  if (!leitura || cartas.length === 0) return { ok: false, motivo: "ainda_sem_texto" };

  const caminho = caminhoDaNarracao(orgId, leituraId);
  const storage = admin.storage.from(BUCKET_DAS_FOTOS);
  const pronta = await storage.createSignedUrl(caminho, VALIDADE_S);
  if (pronta.data?.signedUrl) return { ok: true, url: pronta.data.signedUrl };

  const roteiro = roteiroDaNarracao(cartas, leitura, primeiroNome);

  if (humana) {
    try {
      const trabalho = await pedirVozHumana({ id: `leitura-${leituraId}`, texto: roteiro, voz: humana.voz });
      if (trabalho.status === "na_fila" || trabalho.status === "gerando") {
        return { ok: false, motivo: "preparando", posicao: trabalho.posicao };
      }
      if (trabalho.status === "pronto") return await guardarNarracao(storage, caminho, await baixarVozHumana(trabalho.id));
      logger.error("[area.leitura] voz humana falhou — a leitura sai na voz rápida", { organization_id: orgId });
    } catch (err) {
      logger.error("[area.leitura] voz humana indisponível — a leitura sai na voz rápida", {
        organization_id: orgId,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
    if (!vozPropriaConfigurada()) return { ok: false, motivo: "falhou" };
  }

  try {
    return await guardarNarracao(storage, caminho, await falarNaVozPropria(roteiro, { velocidade: 0.92 }));
  } catch (err) {
    logger.error("[area.leitura] narração não gerada", {
      organization_id: orgId,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return { ok: false, motivo: "falhou" };
  }
}

type Armazem = ReturnType<SupabaseClient["storage"]["from"]>;

/** Guarda o mp3 no Storage e devolve o link assinado. */
async function guardarNarracao(storage: Armazem, caminho: string, audio: Buffer): Promise<ResultadoDaNarracao> {
  const { error } = await storage.upload(caminho, audio, { contentType: "audio/mpeg", upsert: true });
  if (error) throw new Error(error.message);
  const assinada = await storage.createSignedUrl(caminho, VALIDADE_S);
  if (!assinada.data?.signedUrl) throw new Error("sem link assinado");
  return { ok: true, url: assinada.data.signedUrl };
}
