/**
 * ENTREGA O ACESSO A QUEM ACABOU DE ASSINAR.
 *
 * Quando o aviso de pagamento chega direto da plataforma (sem um orquestrador no
 * meio), ninguém lê a resposta da rota — o link de acesso que ela devolveria se
 * perde. Quem leva o link ao cliente é este e-mail.
 *
 * Nunca lança: a empresa já foi criada, e uma falha de e-mail não desfaz isso.
 * O resultado volta para a rota registrar — sem e-mail configurado na instalação
 * o cliente fica sem o link, e isso precisa aparecer no log com o motivo.
 */
import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail, type EmailDeliveryError } from "@/lib/email/roteador";
import { buildBoasVindasDaAssinaturaEmail } from "@/lib/email/templates/boas-vindas-da-assinatura";
import { env } from "@/lib/env";

export async function enviarBoasVindasDaAssinatura(p: {
  organizationId: string;
  nome: string;
  email: string;
  linkDeAcesso: string;
}): Promise<{ enviado: true } | { enviado: false; motivo: EmailDeliveryError | "erro_inesperado"; detalhe?: string }> {
  try {
    const marca = await marcaDaSaida(p.organizationId);
    const urlDeEntrada = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/login`;
    const mensagem = buildBoasVindasDaAssinaturaEmail({
      nome: p.nome,
      email: p.email,
      linkDeAcesso: p.linkDeAcesso,
      urlDeEntrada,
      marca,
    });
    const r = await sendEmail({
      to: p.email,
      ...mensagem,
      fromName: marca.nome,
      tags: [
        { name: "kind", value: "subscription_welcome" },
        { name: "org", value: p.organizationId },
      ],
    });
    return r.ok ? { enviado: true } : { enviado: false, motivo: r.error ?? "send_failed", detalhe: r.details };
  } catch (err) {
    return { enviado: false, motivo: "erro_inesperado", detalhe: err instanceof Error ? err.message : String(err) };
  }
}
