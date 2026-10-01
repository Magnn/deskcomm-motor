import type { Metadata } from "next";
import { WebchatView } from "./_client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atendimento Deskcomm",
  description: "Canal de atendimento online e interativo via Webchat Deskcomm",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WebchatStandalonePage({ params }: PageProps) {
  const { id } = await params;

  return (
    <WebchatView
      webchatId={id}
      brandColor="#0ea5e9"
      title="Atendimento Deskcomm"
      subtitle="Online agora"
      greetingMessage="Olá! Como podemos te ajudar hoje? Digite sua mensagem abaixo:"
    />
  );
}
