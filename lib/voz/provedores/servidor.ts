/**
 * A VOZ DO PRÓPRIO SERVIDOR como provedor da agente: a nota de voz do WhatsApp sai de um modelo
 * aberto rodando na instalação (`lib/voz/servidor-proprio.ts` — o Kokoro no speaches da
 * transcrição), sem custo por caractere.
 *
 * Diferenças para os provedores pagos:
 *  - não há chave da organização: quem configura é o `.env` da instalação (`VOZ_PROPRIA_*`), e
 *    `resolverChaveDeVoz` devolve um marcador quando está configurado;
 *  - o serviço só devolve mp3 (medido em 19/10/2026: aceita mp3, flac, wav e pcm), então a nota de
 *    voz passa pela conversão para Ogg/Opus (`converterParaNotaDeVoz`, ffmpeg do worker);
 *  - as vozes são as do português do Brasil do Kokoro, numa lista fixa, MAIS as clonadas no serviço
 *    de voz clonada da instalação (`lib/voz/servidor-clonada.ts`), quando ele está configurado.
 */
import { converterParaNotaDeVoz } from "../converter";
import { ErroDeVoz } from "../erros";
import {
  apagarVozClonada,
  clonarNoServidor,
  ehVozClonadaDoServidor,
  falarComVozClonada,
  listarVozesClonadas,
} from "../servidor-clonada";
import { VozPropriaIndisponivel, falarNaVozPropria, vozPropriaConfigurada } from "../servidor-proprio";
import type { AudioGerado, VozDisponivel } from "../tipos";
import type { ImplementacaoDeVoz } from "./tipos";

export const VOZES_DO_SERVIDOR: readonly VozDisponivel[] = [
  { provedor: "servidor", id: "pf_dora", nome: "Dora", genero: "feminina", categoria: "pronta", descricao: "Feminina, português do Brasil, calma e clara." },
  { provedor: "servidor", id: "pm_alex", nome: "Alex", genero: "masculina", categoria: "pronta", descricao: "Masculina, português do Brasil, tom firme." },
  { provedor: "servidor", id: "pm_santa", nome: "Santa", genero: "masculina", categoria: "pronta", descricao: "Masculina, português do Brasil, grave e acolhedora." },
];

export const servidorVoz: ImplementacaoDeVoz = {
  id: "servidor",

  async listarVozes() {
    // O serviço de clonagem fora do ar não esconde as vozes prontas.
    const clonadas = await listarVozesClonadas().catch(() => []);
    return [...clonadas, ...VOZES_DO_SERVIDOR];
  },

  async sintetizar(p): Promise<AudioGerado> {
    let mp3: Buffer;
    const velocidade = p.ajustes?.speed !== undefined ? { velocidade: p.ajustes.speed } : {};
    try {
      mp3 = ehVozClonadaDoServidor(p.vozId)
        ? await falarComVozClonada(p.texto, p.vozId, velocidade)
        : await falarNaVozPropria(p.texto, { voz: p.vozId, ...velocidade });
    } catch (err) {
      if (err instanceof VozPropriaIndisponivel) throw new ErroDeVoz(vozPropriaConfigurada() ? "provedor_fora_do_ar" : "sem_chave");
      throw err;
    }
    if (p.formato === "previa") return { buffer: mp3, mime: "audio/mpeg" };
    return converterParaNotaDeVoz(mp3);
  },

  async validarChave() {
    return vozPropriaConfigurada() ? { ok: true } : { ok: false, error: "not_configured" };
  },

  async clonar(p) {
    return clonarNoServidor({ nome: p.nome, genero: p.genero, amostras: p.amostras });
  },

  async apagarVoz(_apiKey, vozId) {
    await apagarVozClonada(vozId);
  },
};
