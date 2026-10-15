/**
 * ÁREA DO CLIENTE — o vocabulário e os prazos, num lugar só.
 *
 * A área é a página onde quem já comprou vê o que é seu (compras, leitura,
 * materiais), compra outro serviço e fala com a empresa — fora do WhatsApp.
 * Até 15/10/2026 tudo isso morava na conversa, e quando o número oficial foi
 * banido 46 pessoas que tinham pagado na semana perderam o acesso.
 *
 * Os tipos de evento são o MESMO conjunto do CHECK de `area_eventos.tipo`
 * (migration 0928), vigiado por `tests/invariants/vocabulario-banco-x-typescript`.
 */

export const TIPOS_DE_EVENTO_DA_AREA = [
  "convite_criado",
  "entrou",
  "visitou",
  "material_aberto",
  "servico_visto",
  "checkout_clicado",
  "desejo",
  "email_salvo",
  "saiu",
  "carta_do_dia",
  "diario_escrito",
  "aniversario_salvo",
  "circulo_checkout",
  "circulo_ativado",
  "pergunta_enviada",
  "presente_checkout",
  "presente_pago",
  "presente_usado",
  "ano_pessoal_checkout",
  "ano_pessoal_pago",
] as const;
export type TipoDeEventoDaArea = (typeof TIPOS_DE_EVENTO_DA_AREA)[number];

/** Os eventos que o NAVEGADOR pode mandar. Os demais só o servidor registra. */
export const EVENTOS_DO_NAVEGADOR = ["servico_visto", "desejo", "carta_do_dia"] as const satisfies readonly TipoDeEventoDaArea[];
export type EventoDoNavegador = (typeof EVENTOS_DO_NAVEGADOR)[number];

/** Mesmo conjunto do CHECK de `area_sessoes.origem`. */
export const ORIGENS_DE_SESSAO_DA_AREA = ["convite", "codigo"] as const;
export type OrigemDeSessaoDaArea = (typeof ORIGENS_DE_SESSAO_DA_AREA)[number];

/** O link de acesso vale 30 dias: dá tempo de a pessoa abrir quando puder, em mais de um aparelho. */
export const VALIDADE_DO_CONVITE_DIAS = 30;
/** Quem entrou fica dentro por 90 dias no mesmo aparelho. */
export const VALIDADE_DA_SESSAO_DIAS = 90;
/** O código por e-mail vale 10 minutos e aceita 5 tentativas. */
export const VALIDADE_DO_CODIGO_MIN = 10;
export const TENTATIVAS_DO_CODIGO = 5;
/** Uma compra conta para o clique em "comprar" se acontecer até 7 dias depois dele. */
export const JANELA_DE_ATRIBUICAO_DIAS = 7;

/** O cookie é por organização: a mesma pessoa pode ser cliente de duas empresas na mesma instalação. */
export function nomeDoCookieDaArea(slugDaOrganizacao: string): string {
  return `area_${slugDaOrganizacao.replace(/[^a-z0-9]/g, "_")}`;
}

/** Forma do slug da organização na URL (`/c/<slug>`). */
export const FORMA_DO_SLUG_DA_AREA = /^[a-z0-9][a-z0-9-]{1,62}$/;

export function caminhoDaArea(slugDaOrganizacao: string): string {
  return `/c/${slugDaOrganizacao}`;
}
