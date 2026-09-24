/**
 * Síntese e clonagem de voz da ElevenLabs.
 *
 * O que aqui foi escrito a partir da documentação pública da API, sem chamada
 * real (não há chave nesta casa) — por isso cada ponto frágil tem um plano B:
 *
 *  - `output_format=opus_48000_32` pede Ogg/Opus direto. Se a conta ou o modelo
 *    não oferece o formato (4xx), pede mp3 e converte com ffmpeg; sem ffmpeg,
 *    `sem_conversor` e a agente cai para texto.
 *  - A clonagem instantânea (`POST /v1/voices/add`, multipart) exige plano
 *    pago. O 4xx de plano vira `sem_permissao_de_clonagem`, que a tela explica.
 *  - O gênero vem de `labels.gender` da própria ElevenLabs; sem rótulo, "neutra".
 */
import { ErroDeVoz } from "../erros";
import { converterParaNotaDeVoz } from "../converter";
import { erroDaResposta, fetchComTempo } from "../http";
import { ehOggOpus } from "../ogg";
import { MIME_DA_NOTA_DE_VOZ, type AudioGerado, type GeneroDaVoz, type VozDisponivel } from "../tipos";
import type { BuscaNaBiblioteca, ImplementacaoDeVoz, PedidoDeClonagem, PedidoDeSintese, VozDaBiblioteca } from "./tipos";

const BASE = "https://api.elevenlabs.io/v1";
/** Bom em português e o mais estável para falas longas. */
export const MODELO_PADRAO_DA_ELEVENLABS = "eleven_multilingual_v2";
const FORMATO_NOTA = "opus_48000_32";
const FORMATO_NOTA_PLANO_B = "mp3_44100_128";
const FORMATO_PREVIA = "mp3_44100_64";

interface VozDaApi {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  preview_url?: string | null;
  labels?: Record<string, string> | null;
}

export function generoDaElevenLabs(rotulo: string | undefined): GeneroDaVoz {
  const g = (rotulo ?? "").toLowerCase();
  if (g === "female" || g === "feminine" || g === "feminina") return "feminina";
  if (g === "male" || g === "masculine" || g === "masculina") return "masculina";
  return "neutra";
}

export function vozDaApi(v: VozDaApi): VozDisponivel {
  const clonada = v.category === "cloned" || v.category === "professional";
  const descricao = (v.description ?? v.labels?.description ?? "").toString().trim();
  return {
    provedor: "elevenlabs",
    id: v.voice_id,
    nome: v.name,
    genero: generoDaElevenLabs(v.labels?.gender),
    categoria: clonada ? "clonada" : "pronta",
    ...(descricao ? { descricao } : {}),
    ...(v.preview_url ? { previewUrl: v.preview_url } : {}),
  };
}

interface VozCompartilhadaDaApi {
  public_owner_id?: string;
  voice_id?: string;
  name?: string;
  gender?: string | null;
  age?: string | null;
  accent?: string | null;
  locale?: string | null;
  language?: string | null;
  use_case?: string | null;
  descriptive?: string | null;
  description?: string | null;
  preview_url?: string | null;
}

const TEXTO_DE_SOTAQUE_BRASILEIRO = /brazil|brasil|pt-br/i;

/**
 * A biblioteca devolve português de Portugal e do Brasil misturados (`language=pt`).
 * Fica o que se declara brasileiro; se o provedor não declara nada em nenhuma voz da
 * página, devolve tudo — sumir com a lista por causa de um campo ausente seria pior.
 */
export function vozesDaBiblioteca(brutas: VozCompartilhadaDaApi[]): VozDaBiblioteca[] {
  const todas: Array<VozDaBiblioteca & { brasileira: boolean }> = [];
  for (const v of brutas) {
    if (!v.voice_id || !v.public_owner_id || !v.name) continue;
    const descricao = [v.descriptive, v.description].filter((x): x is string => !!x && x.trim() !== "").join(" — ");
    todas.push({
      publicOwnerId: v.public_owner_id,
      id: v.voice_id,
      nome: v.name,
      genero: generoDaElevenLabs(v.gender ?? undefined),
      ...(v.accent ? { sotaque: v.accent } : {}),
      ...(v.locale ? { locale: v.locale } : {}),
      ...(v.age ? { idade: v.age } : {}),
      ...(v.use_case ? { usoIndicado: v.use_case } : {}),
      ...(descricao ? { descricao } : {}),
      ...(v.preview_url ? { previewUrl: v.preview_url } : {}),
      brasileira: TEXTO_DE_SOTAQUE_BRASILEIRO.test(`${v.accent ?? ""} ${v.locale ?? ""}`),
    });
  }
  const brasileiras = todas.filter((v) => v.brasileira);
  const escolhidas = brasileiras.length > 0 ? brasileiras : todas;
  return escolhidas.map(({ brasileira: _b, ...voz }) => voz);
}

export function corpoDaSinteseElevenLabs(p: PedidoDeSintese): Record<string, unknown> {
  const a = p.ajustes ?? {};
  const voiceSettings: Record<string, unknown> = {
    ...(a.stability !== undefined ? { stability: a.stability } : {}),
    ...(a.similarity_boost !== undefined ? { similarity_boost: a.similarity_boost } : {}),
    ...(a.style !== undefined ? { style: a.style } : {}),
    ...(a.speed !== undefined ? { speed: a.speed } : {}),
    use_speaker_boost: true,
  };
  return {
    text: p.texto,
    model_id: a.model?.trim() || MODELO_PADRAO_DA_ELEVENLABS,
    voice_settings: voiceSettings,
  };
}

async function pedirAudio(p: PedidoDeSintese, formato: string): Promise<Response> {
  return fetchComTempo(
    `${BASE}/text-to-speech/${encodeURIComponent(p.vozId)}?output_format=${formato}`,
    {
      method: "POST",
      headers: { "xi-api-key": p.apiKey, "Content-Type": "application/json", Accept: "audio/*" },
      body: JSON.stringify(corpoDaSinteseElevenLabs(p)),
    },
    45_000,
  );
}

export const elevenlabsVoz: ImplementacaoDeVoz = {
  id: "elevenlabs",

  async listarVozes(apiKey) {
    const res = await fetchComTempo(`${BASE}/voices`, { headers: { "xi-api-key": apiKey } }, 15_000);
    if (!res.ok) throw await erroDaResposta(res);
    const json = (await res.json().catch(() => ({}))) as { voices?: VozDaApi[] };
    return (json.voices ?? []).filter((v) => v.voice_id && v.name).map(vozDaApi);
  },

  async sintetizar(p): Promise<AudioGerado> {
    if (p.formato === "previa") {
      const res = await pedirAudio(p, FORMATO_PREVIA);
      if (!res.ok) throw await erroDaResposta(res, "sintese");
      return { buffer: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
    }

    const direto = await pedirAudio(p, FORMATO_NOTA);
    if (direto.ok) {
      const buffer = Buffer.from(await direto.arrayBuffer());
      if (ehOggOpus(buffer)) return { buffer, mime: MIME_DA_NOTA_DE_VOZ };
      // Devolveu 200 num formato que não é o pedido: trata como o plano B.
      return converterParaNotaDeVoz(buffer);
    }
    // 400/422 = formato não oferecido nesta conta/modelo. Qualquer outro
    // desfecho (chave, cota, voz, fora do ar) o plano B não resolve.
    if (direto.status !== 400 && direto.status !== 422) throw await erroDaResposta(direto, "sintese");

    const mp3 = await pedirAudio(p, FORMATO_NOTA_PLANO_B);
    if (!mp3.ok) throw await erroDaResposta(mp3, "sintese");
    return converterParaNotaDeVoz(Buffer.from(await mp3.arrayBuffer()));
  },

  async buscarNaBiblioteca(apiKey, busca: BuscaNaBiblioteca) {
    const q = new URLSearchParams({
      page_size: "60",
      language: busca.idioma ?? "pt",
      sort: "trending",
    });
    if (busca.genero === "feminina") q.set("gender", "female");
    if (busca.genero === "masculina") q.set("gender", "male");
    if (busca.texto && busca.texto.trim() !== "") q.set("search", busca.texto.trim().slice(0, 80));
    const res = await fetchComTempo(`${BASE}/shared-voices?${q.toString()}`, { headers: { "xi-api-key": apiKey } }, 20_000);
    if (!res.ok) throw await erroDaResposta(res, "biblioteca");
    const json = (await res.json().catch(() => ({}))) as { voices?: VozCompartilhadaDaApi[] };
    return vozesDaBiblioteca(json.voices ?? []);
  },

  async adicionarDaBiblioteca(apiKey, p) {
    const res = await fetchComTempo(
      `${BASE}/voices/add/${encodeURIComponent(p.publicOwnerId)}/${encodeURIComponent(p.vozId)}`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: p.nome }),
      },
      20_000,
    );
    if (!res.ok) throw await erroDaResposta(res, "biblioteca");
    const json = (await res.json().catch(() => ({}))) as { voice_id?: string };
    if (!json.voice_id) throw new ErroDeVoz("recusado", res.status);
    return { provedor: "elevenlabs", id: json.voice_id, nome: p.nome, genero: "neutra", categoria: "pronta" };
  },

  async validarChave(apiKey) {
    try {
      const res = await fetchComTempo(`${BASE}/voices`, { headers: { "xi-api-key": apiKey } }, 8_000);
      if (res.status === 401 || res.status === 403) return { ok: false, error: "auth_failed_401" };
      return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
    } catch {
      return { ok: false, error: "network_error" };
    }
  },

  async clonar(p: PedidoDeClonagem): Promise<VozDisponivel> {
    if (p.amostras.length === 0) throw new ErroDeVoz("amostra_invalida");
    const form = new FormData();
    form.set("name", p.nome);
    if (p.descricao) form.set("description", p.descricao);
    form.set(
      "labels",
      JSON.stringify({
        gender: p.genero === "feminina" ? "female" : p.genero === "masculina" ? "male" : "neutral",
        language: "pt",
      }),
    );
    // Tira ruído de fundo da gravação: quase toda amostra caseira tem.
    form.set("remove_background_noise", "true");
    for (const a of p.amostras) {
      form.append("files", new Blob([a.dados as BlobPart], { type: a.tipo }), a.nome);
    }
    const res = await fetchComTempo(
      `${BASE}/voices/add`,
      { method: "POST", headers: { "xi-api-key": p.apiKey }, body: form },
      90_000,
    );
    if (!res.ok) throw await erroDaResposta(res, "clonagem");
    const json = (await res.json().catch(() => ({}))) as { voice_id?: string };
    if (!json.voice_id) throw new ErroDeVoz("recusado", res.status);
    return {
      provedor: "elevenlabs",
      id: json.voice_id,
      nome: p.nome,
      genero: p.genero,
      categoria: "clonada",
      ...(p.descricao ? { descricao: p.descricao } : {}),
    };
  },

  async apagarVoz(apiKey, vozId) {
    const res = await fetchComTempo(
      `${BASE}/voices/${encodeURIComponent(vozId)}`,
      { method: "DELETE", headers: { "xi-api-key": apiKey } },
      15_000,
    );
    // 404 = já não existe: o desfecho pedido (a voz sumiu) já é verdade.
    if (!res.ok && res.status !== 404) throw await erroDaResposta(res);
  },
};
