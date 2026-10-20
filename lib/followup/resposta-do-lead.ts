/**
 * A RESPOSTA DO LEAD, COMO O FLUXO A LÊ — texto, áudio, foto.
 *
 * O fluxo lia só `messages.body`. Mensagem de áudio chega com `body` vazio (o conteúdo está no arquivo, e a
 * transcrição vem depois em `media_derived_text`). Medido em 20/10/2026: uma lead respondeu quatro vezes por
 * áudio a uma pergunta do fluxo de entrada; o fluxo acordou a cada resposta (`inbound_woke`), achou o texto
 * vazio, concluiu "não respondeu" e, com o prazo vencido e a saída «Sem resposta» solta, ESTACIONOU a pessoa.
 * Neste público muita gente só manda áudio — alguns não sabem ler.
 *
 * A regra: o texto, quando há; senão a transcrição/descrição da mídia, quando já existe; senão um marcador do
 * tipo de mídia. Uma resposta em áudio É uma resposta, mesmo antes de transcrita. Pura.
 */

/** O que o derivado de mídia grava quando não conseguiu ler: não é conteúdo dela, é o nosso aviso. */
const DERIVADO_SEM_LEITURA = /^\[o cliente enviou/i;

const MARCADOR_DO_TIPO: Readonly<Record<string, string>> = {
  audio: "[áudio]",
  voice: "[áudio]",
  ptt: "[áudio]",
  image: "[imagem]",
  video: "[vídeo]",
  document: "[documento]",
  sticker: "[figurinha]",
};

export interface MensagemDoLead {
  body: string | null | undefined;
  media_derived_text?: string | null | undefined;
  type?: string | null | undefined;
}

/** O texto da resposta do lead para o fluxo; `null` = não há resposta nenhuma (nem texto, nem mídia). */
export function textoDaRespostaDoLead(m: MensagemDoLead | null | undefined): string | null {
  if (!m) return null;
  const corpo = (m.body ?? "").trim();
  if (corpo) return corpo;
  const derivado = (m.media_derived_text ?? "").trim();
  if (derivado && !DERIVADO_SEM_LEITURA.test(derivado)) return derivado;
  const marcador = MARCADOR_DO_TIPO[(m.type ?? "").toLowerCase()];
  return marcador ?? null;
}
