/**
 * De onde sai o identificador da sessão/número no provider.
 *
 * Esta é a pergunta que NÃO pode viver numa feature: com dois providers o
 * `sessionRef` vem de `waha_session_name` **ou** de `meta_phone_number_id`, e
 * quem escolher isso fora daqui vira o `if (provider === ...)` que o invariante
 * 1 da doutrina existe para proibir. O chamador pede o ref; a coluna é detalhe.
 *
 * O tipo é a tagged union que a migration 0087 já enforça no banco
 * (`channel_sessions_provider_ref_check`): a coluna do provider da vez é NOT
 * NULL, a do outro é NULL. Por isso o retorno é `string`, não `string | null` —
 * a garantia é do CHECK, não de otimismo.
 */
export type ChannelSessionRef =
  | { provider: "waha"; waha_session_name: string }
  | { provider: "meta_cloud"; meta_phone_number_id: string }
  | { provider: "zernio" | "zernio_social"; zernio_account_id: string }
  | { provider: "datafy"; datafy_phone_number_id: string }
  | { provider: "meta_messenger"; messenger_page_id: string }
  | { provider: "telegram_bot"; telegram_bot_id: string };

/**
 * Colunas que um `select` do PostgREST precisa trazer para `resolveSessionRef`
 * funcionar. Fica aqui pelo mesmo motivo da função: a string do `select` também
 * nomeia coluna de provider, e ela some da feature junto com a decisão.
 */
export const CHANNEL_SESSION_REF_COLUMNS =
  "provider, waha_session_name, meta_phone_number_id, zernio_account_id, datafy_phone_number_id, messenger_page_id, telegram_bot_id";

export function resolveSessionRef(session: ChannelSessionRef): string {
  switch (session.provider) {
    case "meta_cloud":
      return session.meta_phone_number_id;
    // O `phone_number_id` da WABA, como no canal oficial — mas pela coluna do
    // parceiro, porque os dois podem conviver e endereçam servidores diferentes.
    case "datafy":
      return session.datafy_phone_number_id;
    case "waha":
      return session.waha_session_name;
    // O `accountId` que o provider devolve ao conectar a WABA. NÃO é o
    // phone_number_id da Meta: quem intermedeia guarda o número por dentro e
    // endereça pelo id dele. Mandar o id da Meta aqui responde 404.
    case "zernio_social":
    case "zernio":
      return session.zernio_account_id;
    // O id da PÁGINA do Facebook: é por ela que o envio sai (`/{page}/messages`)
    // e por ela que o webhook único do app acha a sessão (`entry.id`).
    case "meta_messenger":
      return session.messenger_page_id;
    // O id numérico do bot (getMe). Quem endereça o envio é o `chat.id` da
    // conversa; o bot só diz por qual token falar.
    case "telegram_bot":
      return session.telegram_bot_id;
  }
}
