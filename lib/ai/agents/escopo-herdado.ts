/**
 * O ESCOPO DA VERSÃO NOVA — o que não veio no corpo é HERDADO da versão anterior, não zerado.
 *
 * ─── O defeito que fez este arquivo existir ─────────────────────────────────────────────────────
 * `pipeline_ids` (funis em que o agente pode escrever) e `knowledge_source_ids` (materiais que ele
 * consulta) têm padrão `[]` no schema, e `[]` significa NENHUM. A tela sempre manda os dois; quem cria
 * versão pela API mandando só o que mudou (o roteiro, por exemplo) publicava um agente SEM funil e SEM
 * material, e nada avisava. Medido em produção em 11/10/2026: um agente perdeu o funil na versão 22 e
 * ficou 45 versões assim — a ferramenta de agendar retorno foi recusada 59 vezes em 14 dias com
 * `escopo_de_funil:escopo_vazio`; e as versões 32 a 66 ficaram sem material, com 35 compradores
 * atendidos sem o guia de entrega.
 *
 * ─── A regra ────────────────────────────────────────────────────────────────────────────────────
 * Campo AUSENTE no corpo = "não mexi nisto": vale o da versão mais recente do agente. Campo PRESENTE,
 * mesmo `[]`, é decisão de quem chamou e é respeitado — esvaziar o escopo continua possível, só que
 * de propósito. Primeira versão do agente não tem de quem herdar: fica o padrão do schema.
 */
export interface EscopoDeVersao {
  pipeline_ids: string[];
  knowledge_source_ids: string[];
}

const CAMPOS = ["pipeline_ids", "knowledge_source_ids"] as const;

function ehRegistro(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const soTextos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * `corpoBruto` é o JSON como chegou (é ele que diz o que veio e o que não veio — depois do schema
 * tudo tem valor). `anterior` é a versão mais recente do agente, ou `null` se não há nenhuma.
 */
export function escopoParaAVersaoNova(
  corpoBruto: unknown,
  validado: EscopoDeVersao,
  anterior: { pipeline_ids?: unknown; knowledge_source_ids?: unknown } | null,
): EscopoDeVersao & { herdados: (typeof CAMPOS)[number][] } {
  const resultado: EscopoDeVersao = {
    pipeline_ids: validado.pipeline_ids,
    knowledge_source_ids: validado.knowledge_source_ids,
  };
  const herdados: (typeof CAMPOS)[number][] = [];
  if (anterior === null) return { ...resultado, herdados };
  for (const campo of CAMPOS) {
    const veio = ehRegistro(corpoBruto) && Object.prototype.hasOwnProperty.call(corpoBruto, campo);
    if (veio) continue;
    resultado[campo] = soTextos(anterior[campo]);
    herdados.push(campo);
  }
  return { ...resultado, herdados };
}
