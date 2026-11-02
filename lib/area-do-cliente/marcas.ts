/**
 * As marcas do chat da área nas mensagens, sem dependência nenhuma: o envio (`_handler.ts`) e a regra do
 * destino (`canal-da-resposta.ts`) as leem sem puxar a entrada da área (`chat.ts`) e o que ela importa.
 */
/** A marca da mensagem que nasceu na área (`metadata.origem`). É o que decide para onde a resposta vai. */
export const ORIGEM_DA_AREA = "area";
/** A marca do aviso pelo canal ("a Cigana te respondeu na sua área"): não aparece no chat da área. */
export const MARCA_DO_AVISO = "aviso_da_area";
