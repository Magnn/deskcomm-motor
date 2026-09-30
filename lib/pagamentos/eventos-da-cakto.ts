/**
 * Os eventos que a Cakto manda, como VOCABULÁRIO — sem nenhuma dependência de servidor.
 *
 * Mora à parte de `lib/webhooks/cakto.ts` (que importa `node:crypto`) porque a tela do
 * construtor de fluxos e o schema do gatilho precisam da lista, e puxar `node:crypto`
 * para o bundle do navegador só para listar nomes quebraria o build do cliente.
 */
export const EVENTOS_DA_CAKTO = [
  "purchase_approved",
  "purchase_refused",
  "pix_gerado",
  "boleto_gerado",
  "picpay_gerado",
  "refund",
  "chargeback",
  "subscription_canceled",
  "subscription_renewed",
  "checkout_abandonment",
] as const;

export type EventoDaCakto = (typeof EVENTOS_DA_CAKTO)[number];

/** Como cada evento se chama para quem monta o fluxo (a tela e o card do gatilho). */
export const ROTULOS_DOS_EVENTOS_DA_CAKTO: Record<EventoDaCakto, string> = {
  purchase_approved: "Compra aprovada",
  purchase_refused: "Compra recusada",
  pix_gerado: "Pix gerado (aguardando pagamento)",
  boleto_gerado: "Boleto gerado (aguardando pagamento)",
  picpay_gerado: "PicPay gerado (aguardando pagamento)",
  refund: "Reembolso",
  chargeback: "Chargeback",
  subscription_canceled: "Assinatura cancelada",
  subscription_renewed: "Assinatura renovada",
  checkout_abandonment: "Carrinho abandonado",
};
