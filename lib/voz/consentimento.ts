/**
 * O texto do consentimento para clonar uma voz.
 *
 * Mora aqui, e não na rota, por dois motivos: a TELA mostra o mesmo texto que a
 * rota grava na auditoria, e um arquivo `route.ts` do Next não pode exportar
 * nada além dos verbos HTTP. Mudou o texto, muda a versão.
 */
export const VERSAO_DO_CONSENTIMENTO = "v1";

export const TEXTO_DO_CONSENTIMENTO =
  "Declaro que esta voz é minha ou que tenho autorização expressa de quem a possui para cloná-la e usá-la no atendimento desta empresa, e que sei que voz é dado pessoal.";
