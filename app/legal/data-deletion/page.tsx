import type { Metadata } from "next";

import { nomeDoOperador, resolverOperador } from "@/lib/legal/operador";
import { createClient } from "@/lib/supabase/server";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exclusão de dados" };

/**
 * As instruções de exclusão de dados que a Meta exige de todo app com Login do
 * Facebook (campo "URL de instruções de exclusão de dados" do painel do app).
 *
 * É página pública pelo mesmo motivo de `privacy`/`terms`: quem pede a
 * exclusão pode nem ter conta, e o revisor da Meta a abre sem sessão. Diz só o
 * que o sistema faz de fato — a anonimização do fluxo LGPD e o corte de acesso
 * que a própria Meta oferece —, sem prometer apagamento que o código não faz.
 */
export default async function DataDeletionPage() {
  const op = await resolverOperador();
  const operador = nomeDoOperador(op);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = await idiomaDoVisitante(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Exclusão de dados")}</h1>
        <p className="text-muted-foreground">
          {t("Como pedir a exclusão dos seus dados no")} {op.sistema}.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("1. Quem responde pelo pedido")}</h2>
        <p>
          {t("Os pedidos são atendidos por")} <strong>{operador}</strong>
          {op.cnpj ? ` (CNPJ ${op.cnpj})` : ""}.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("2. Se você conectou o Facebook ou o WhatsApp")}</h2>
        <p>
          {t(
            "Para cortar o acesso na hora, remova o aplicativo em Configurações do Facebook › Integrações comerciais, ou nas configurações do seu portfólio empresarial. A partir daí o sistema não consegue mais ler nem enviar nada pela sua conta.",
          )}
        </p>
        <p>
          {t(
            "Para apagar também o que já foi guardado (conversas, contatos e a credencial da conexão), envie o pedido para o contato abaixo, a partir do e-mail da conta.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("3. Se você foi atendido por uma empresa que usa o sistema")}</h2>
        <p>
          {t(
            "Seus dados pertencem à empresa que conversou com você. Peça a ela a exclusão; se preferir, escreva para o contato abaixo e o pedido é encaminhado.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("4. O que acontece com o pedido")}</h2>
        <p>
          {t(
            "Os dados que identificam a pessoa são anonimizados: o nome vira um código, e telefone, e-mail, arquivos de mídia e o conteúdo identificável deixam de existir. Isso não pode ser desfeito. O prazo é de até 15 dias a partir do pedido.",
          )}
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t("5. Contato")}</h2>
        <p>
          {op.dpoEmail ? (
            <>
              {t("Envie o pedido para o encarregado de dados:")}{" "}
              <a className="underline underline-offset-2" href={`mailto:${op.dpoEmail}`}>
                {op.dpoEmail}
              </a>
              .
            </>
          ) : (
            <>
              {t(
                "O operador ainda não publicou um endereço de contato do encarregado de dados nesta instalação. Os pedidos devem ser feitos pelos canais de atendimento da própria organização.",
              )}
            </>
          )}
        </p>
      </section>
    </>
  );
}
