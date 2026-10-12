/**
 * O recibo que a conversa mostra ao lado da hora: enviada, entregue ou lida.
 *
 * O canal oficial guarda `status` colapsado em `sent | failed` (`lib/channels/meta/status-update.ts`) e o detalhe
 * em `delivered_at` / `read_at`. A tela lia só `status`, então neste canal toda mensagem aparecia com um tique só,
 * para sempre — medido em 12/10/2026: 360 de 366 mensagens tinham hora de entrega gravada e nenhuma mostrava.
 * As duas colunas de hora valem para qualquer canal; `status` segue valendo para quem grava o detalhe nele.
 */
export type ReciboDeEntrega = "sent" | "delivered" | "read";

export function reciboDeEntrega(m: {
  status: string;
  delivered_at?: string | null | undefined;
  read_at?: string | null | undefined;
}): ReciboDeEntrega | null {
  if (m.status === "failed") return null;
  if (m.read_at || m.status === "read") return "read";
  if (m.delivered_at || m.status === "delivered") return "delivered";
  return m.status === "sent" ? "sent" : null;
}
