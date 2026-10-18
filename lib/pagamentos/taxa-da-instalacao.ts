/**
 * A regra da taxa da plataforma que ESTA instalação cobra (do `.env`). Separado de `taxa-da-plataforma.ts`
 * porque aquele é puro e vai para a tela; este lê o ambiente e só roda no servidor.
 */
import { env } from "@/lib/env";

import type { RegraDaTaxa } from "./taxa-da-plataforma";

export function regraDaTaxaDaInstalacao(): RegraDaTaxa {
  return {
    fixoCentavos: env.STRIPE_CONNECT_TAXA_CENTAVOS,
    percentualBp: env.STRIPE_CONNECT_TAXA_PERCENTUAL_BP,
    tetoCentavos: env.STRIPE_CONNECT_TAXA_TETO_CENTAVOS,
  };
}
