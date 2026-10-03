/** Display identity belongs to the network, never to the transport vendor. */
export function channelBrand(
  session?: { provider?: string | null; social_platform?: string | null } | null,
) {
  switch (session?.provider) {
    case "waha":
    case "meta_cloud":
    case "zernio":
    case "datafy":
    case "wacalls":
      return "whatsapp";
    case "zernio_social":
      if (session.social_platform === "instagram") return "instagram";
      if (session.social_platform === "facebook") return "messenger";
      return "unknown";
    case "meta_messenger":
      return "messenger";
    case "telegram_bot":
      return "telegram";
    default:
      return "unknown";
  }
}

/**
 * As redes que o inbox sabe filtrar, na ordem em que aparecem. `canal` é o
 * valor de `conversations.channel` (o vocabulário do CHECK do banco); `amostra`
 * é um canal fictício da rede, só para o logotipo sair pelo MESMO caminho das
 * conversas (`ChannelLogo`) em vez de um segundo mapa de ícones.
 */
export const REDES_DO_INBOX = [
  { marca: "whatsapp", canal: "whatsapp", rotulo: "WhatsApp", amostra: { provider: "waha" } },
  { marca: "messenger", canal: "facebook", rotulo: "Messenger", amostra: { provider: "meta_messenger" } },
  { marca: "instagram", canal: "instagram", rotulo: "Instagram", amostra: { provider: "zernio_social", social_platform: "instagram" } },
  { marca: "telegram", canal: "telegram", rotulo: "Telegram", amostra: { provider: "telegram_bot" } },
] as const;

/** A rede de um canal conectado, ou `null` quando ele não é canal de conversa conhecido. */
export function redeDoCanal(
  session: { provider?: string | null; social_platform?: string | null } | null | undefined,
): (typeof REDES_DO_INBOX)[number] | null {
  const marca = channelBrand(session);
  return REDES_DO_INBOX.find((r) => r.marca === marca) ?? null;
}
