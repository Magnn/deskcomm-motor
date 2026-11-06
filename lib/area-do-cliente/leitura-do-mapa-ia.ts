/**
 * A IA DA LEITURA DO MAPA ASTRAL — o emissor do ponto `area_mapa`.
 *
 * Passa por `runModelCall`, como a Mesa e o sonho: mesma chave, mesmo teto de gasto, mesmo registro em `llm_calls`.
 * Uma chamada por leitura. As posições (signo, grau, casa) são do cálculo (`lib/relatorio/mapa-natal.ts`) e vão no
 * pedido já prontas: a IA interpreta, não calcula.
 */
import type pg from "pg";

import { runModelCall, type LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/run-model-call";
import { instrucaoDeIdioma, type IdiomaDaArea } from "@/lib/i18n/area";

import { REGRAS_DE_TOM } from "./circulo-ia";
import { TEMA_DA_PARTE, lerLeituraDoMapa, type LeituraDoMapa, type PosicaoDaParte } from "./leitura-do-mapa";

const ROTULO: Record<PosicaoDaParte["parte"], string> = { sol: "Sol", lua: "Lua", ascendente: "Ascendente", venus: "Vênus", marte: "Marte" };

export function pedidoDoMapa(empresa: string, primeiroNome: string, posicoes: readonly PosicaoDaParte[]): string {
  const linhas = posicoes
    .map((p) => `- "${p.parte}": ${ROTULO[p.parte]} em ${p.signo} (${p.grau}°)${p.casa && p.parte !== "ascendente" ? `, casa ${p.casa}` : ""} — fala de ${TEMA_DA_PARTE[p.parte]}`)
    .join("\n");
  const semHora = !posicoes.some((p) => p.parte === "ascendente");
  return [
    `Você faz a leitura do mapa astral de uma cliente de ${empresa}${primeiroNome ? `, ${primeiroNome}` : ""}, com o olhar da astrologia tradicional e com delicadeza.`,
    `As posições já foram calculadas; não recalcule nem mude nenhuma:\n${linhas}`,
    semHora ? "Ela não sabe a hora em que nasceu: não fale de Ascendente nem de casas." : "Leve em conta a casa de cada planeta (a área da vida em que ele age).",
    "Para cada parte acima, escreva a leitura dela falando com a cliente (você), de 70 a 110 palavras, ligada ao signo e, quando houver, à casa. Depois, uma síntese que junta o mapa (até 120 palavras) e um passo pequeno e concreto para os próximos dias (uma ou duas frases).",
    `Regras:\n- ${REGRAS_DE_TOM}\n- Mapa é retrato de temperamento, nunca destino: não preveja morte, doença, acidente, separação nem dinheiro certo.\n- Esta leitura é automática: não diga que é uma pessoa lendo.\n- Use o nome dela no máximo uma vez.`,
    `Responda só com JSON, sem texto fora dele: {"partes": {${posicoes.map((p) => `"${p.parte}": "…"`).join(", ")}}, "sintese": "…", "passo": "…"}.`,
  ].join("\n\n");
}

export type ResultadoDoMapa = { ok: true; leitura: LeituraDoMapa; modelo: string | null } | { ok: false; motivo: "resposta_invalida" };

export async function lerOMapa(
  pool: pg.Pool,
  cfg: LlmEdgeConfig,
  d: { organizationId: string; contactId: string; empresa: string; primeiroNome: string; posicoes: readonly PosicaoDaParte[]; idioma?: IdiomaDaArea },
): Promise<ResultadoDoMapa> {
  const chamada = await runModelCall(pool, cfg, {
    tenantId: d.organizationId,
    leadId: d.contactId,
    jobId: null,
    purpose: "area_mapa",
    maxOutputTokens: 2500,
    messages: [{ role: "user", content: pedidoDoMapa(d.empresa, d.primeiroNome, d.posicoes) + instrucaoDeIdioma(d.idioma) }],
  });
  const lida = lerLeituraDoMapa(chamada.result.text ?? "", d.posicoes);
  if (!lida) return { ok: false, motivo: "resposta_invalida" };
  return { ok: true, leitura: lida, modelo: chamada.model ?? null };
}
