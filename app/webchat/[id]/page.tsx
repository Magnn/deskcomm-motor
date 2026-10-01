import type { Metadata } from "next";

import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atendimento",
};

/**
 * Página pública do canal Webchat — hoje um AVISO, não um chat.
 *
 * O canal ainda não tem servidor: nenhuma mensagem digitada aqui chegaria a um
 * atendente ou a um agente. A versão anterior desta página respondia sozinha,
 * por temporizador, "Recebi sua mensagem… nosso assistente está processando" —
 * para o visitante do site de um cliente, isso é um atendimento que nunca vem.
 * Enquanto o backend não existir, a página diz a verdade e não aceita mensagem.
 */
export default async function WebchatStandalonePage() {
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-2 text-center" data-testid="webchat-indisponivel">
        <h1 className="text-lg font-semibold text-foreground">{t("Atendimento por chat indisponível")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Este canal de atendimento ainda não está ativo. Fale com a empresa pelos outros canais de contato.")}
        </p>
      </div>
    </main>
  );
}
