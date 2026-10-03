"use client";
import { useT } from "@/hooks/i18n/useT";
import { capabilitiesOf, transportaMensagem, type ChannelProvider } from "@/lib/channels/capabilities";

/**
 * O que muda no público conforme o canal escolhido. Num canal por conversa a
 * campanha não tem para quem "mandar a frio": só recebe quem já falou com a
 * conta. Dizer isto ANTES de preparar evita a surpresa de uma lista vazia.
 * A pergunta vai à capacidade do canal, não ao nome dele.
 */
export function AvisoDoCanal({ provider }: { provider: string | null | undefined }) {
  const t = useT();
  if (!provider || !transportaMensagem(provider)) return null;
  const caps = capabilitiesOf(provider as ChannelProvider);
  if (caps.enderecamento !== "conversa") return null;
  return (
    <p className="text-sm text-muted-foreground" data-testid="aviso-canal-por-conversa">
      {caps.freeformOutsideWindow
        ? t("Neste canal a campanha alcança só quem já conversou com esta conta — ele não começa conversa com quem nunca escreveu. O rodízio entre números não se aplica.")
        : t("Este canal só deixa responder até 24 horas depois da última mensagem da pessoa, então não serve para campanha. Escolha um número de WhatsApp ou um bot do Telegram.")}
    </p>
  );
}
