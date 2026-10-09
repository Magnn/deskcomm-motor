/**
 * A FAIXA DE CONEXÃO CAÍDA NÃO ANUNCIA TENTATIVA DE QR QUE NUNCA CONCLUIU.
 *
 * Medido em produção em 09/10/2026: dois QR code não lidos (sessões `FAILED`, sem número) acenderam
 * "2 conexões de WhatsApp estão desconectadas — nenhuma mensagem entra nem sai" numa organização
 * cujo único número atendia normalmente. Sessão sem número nunca recebeu mensagem: não há o que
 * ter parado.
 */
import { describe, expect, it } from "vitest";

import { listarConexoesCaidas } from "@/lib/channels/health";

function adminCom(linhas: Record<string, unknown>[]) {
  const cadeia: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is"]) cadeia[m] = () => cadeia;
  let chamadasDeIn = 0;
  cadeia.in = () => {
    chamadasDeIn += 1;
    return chamadasDeIn === 2 ? Promise.resolve({ data: linhas }) : cadeia;
  };
  return cadeia as never;
}

describe("listarConexoesCaidas", () => {
  it("sessão por QR sem número fica de fora; número que caiu e canal sem sessão continuam avisando", async () => {
    const caidas = await listarConexoesCaidas(
      adminCom([
        { id: "nunca-leu", display_name: null, phone_number: null, status: "FAILED", waha_session_name: "org_x_1" },
        { id: "caiu", display_name: "Vendas", phone_number: "+5511999990000", status: "FAILED", waha_session_name: "org_x_2" },
        { id: "sem-sessao", display_name: "Canal", phone_number: null, status: "STOPPED", waha_session_name: null },
      ]),
      "org",
    );
    expect(caidas.map((c) => c.id)).toEqual(["caiu", "sem-sessao"]);
  });
});
