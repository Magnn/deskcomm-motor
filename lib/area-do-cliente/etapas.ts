/**
 * AS ETAPAS DO TRABALHO na área do cliente.
 *
 * A empresa escreve as etapas no serviço (`area_servicos.etapas`); a pessoa
 * marca, na área, cada uma que fez (`area_etapas_feitas`, pelo índice). Daqui
 * sai a linha do tempo que a aba "Meu trabalho" desenha e a "próxima etapa" da
 * aba Hoje — sem nada inventado: só o que a empresa escreveu e o que a pessoa
 * marcou.
 */
import { z } from "zod";

export const MAXIMO_DE_ETAPAS = 20;

export const etapaSchema = z.strictObject({
  titulo: z.string().trim().min(1).max(80),
  orientacao: z.string().trim().max(300).optional(),
});
export const etapasSchema = z.array(etapaSchema).max(MAXIMO_DE_ETAPAS);
export type Etapa = z.infer<typeof etapaSchema>;

/** Lê a coluna sem nunca lançar: formato estranho = sem etapas. */
export function lerEtapas(bruto: unknown): Etapa[] {
  const lido = etapasSchema.safeParse(bruto ?? []);
  return lido.success ? lido.data : [];
}

export type EstadoDaEtapa = "feita" | "agora" | "depois";

export interface EtapaNaLinhaDoTempo extends Etapa {
  indice: number;
  estado: EstadoDaEtapa;
  /** Quando a pessoa marcou (ISO); só nas feitas. */
  feitaEm: string | null;
}

/**
 * A linha do tempo: cada etapa feita, depois a PRIMEIRA ainda não feita como
 * "agora" e as outras como "depois". A pessoa pode marcar fora de ordem (fez a
 * 3ª antes da 2ª); a que está "agora" é sempre a primeira que falta.
 */
export function linhaDoTempo(etapas: readonly Etapa[], feitas: ReadonlyMap<number, string>): EtapaNaLinhaDoTempo[] {
  let agoraJaDada = false;
  return etapas.map((e, indice) => {
    const feitaEm = feitas.get(indice) ?? null;
    let estado: EstadoDaEtapa = "feita";
    if (feitaEm === null) {
      estado = agoraJaDada ? "depois" : "agora";
      agoraJaDada = true;
    }
    return { ...e, indice, estado, feitaEm };
  });
}

/** A etapa da vez (a primeira que falta), ou `null` quando já fez todas. */
export function etapaDaVez(linha: readonly EtapaNaLinhaDoTempo[]): EtapaNaLinhaDoTempo | null {
  return linha.find((e) => e.estado === "agora") ?? null;
}
