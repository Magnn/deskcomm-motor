/**
 * Os números da organização e QUEM atende cada um, do ponto de vista de um fluxo.
 *
 * Mora em `lib/channels/` porque lê as colunas do canal — inclusive o nome da
 * sessão no transporte, que só este diretório pode citar. Para fora sai um
 * `nome` já resolvido, sem coluna de provedor e sem o `metadata` cru.
 */
import { capabilitiesOf, PROVIDERS_DE_MENSAGEM, type ChannelProvider } from "@/lib/channels/capabilities";
import { lerConfigDeFluxoDoCanal, quemAtendeONumero } from "@/lib/channels/channel-flow-config";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export type DonoDoNumero = "este_fluxo" | "outro_fluxo" | "agente" | "humano";

export interface NumeroDoFluxo {
  id: string;
  /** Apelido do número (ou o nome da sessão, na falta dele). Null: só o telefone identifica. */
  nome: string | null;
  phone_number: string | null;
  dono: DonoDoNumero;
  /** Nome do outro fluxo, quando `dono === "outro_fluxo"` (null se ele foi apagado). */
  outro_fluxo: string | null;
  /**
   * O canal deste número tem risco de banimento (o pareado por QR)? Então valem
   * nele as travas anti-banimento — texto repetido barrado, limite diário —, e um
   * roteiro fixo em volume esbarra nelas. A tela avisa antes de o dono vincular.
   */
  com_risco_de_banimento: boolean;
}

export type NumerosDoFluxoResult = { ok: true; numeros: NumeroDoFluxo[] } | { ok: false; message: string };

export async function listarNumerosDoFluxo(admin: Admin, orgId: string, flowId: string): Promise<NumerosDoFluxoResult> {
  const { data: canais, error: canaisErr } = await admin
    .from("channel_sessions")
    .select("id, provider, display_name, phone_number, waha_session_name, metadata")
    .eq("organization_id", orgId)
    .in("provider", [...PROVIDERS_DE_MENSAGEM])
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (canaisErr) return { ok: false, message: canaisErr.message };

  const donos = (canais ?? []).map((c) => ({ canal: c, dono: quemAtendeONumero(lerConfigDeFluxoDoCanal(c.metadata)) }));

  const outros = [
    ...new Set(donos.flatMap((d) => (d.dono.quem === "fluxo" && d.dono.flowId !== flowId ? [d.dono.flowId] : []))),
  ];
  const nomes = new Map<string, string>();
  if (outros.length > 0) {
    const { data: fluxos, error: nomesErr } = await admin
      .from("followup_flow_pointers")
      .select("id, name")
      .eq("organization_id", orgId)
      .in("id", outros);
    if (nomesErr) return { ok: false, message: nomesErr.message };
    for (const f of fluxos ?? []) nomes.set(f.id, f.name);
  }

  return {
    ok: true,
    numeros: donos.map(({ canal, dono }) => ({
      id: canal.id,
      nome: canal.display_name || canal.waha_session_name || null,
      phone_number: canal.phone_number,
      dono:
        dono.quem === "fluxo"
          ? dono.flowId === flowId
            ? "este_fluxo"
            : "outro_fluxo"
          : dono.quem === "agente"
            ? "agente"
            : "humano",
      outro_fluxo: dono.quem === "fluxo" && dono.flowId !== flowId ? (nomes.get(dono.flowId) ?? null) : null,
      com_risco_de_banimento: capabilitiesOf(canal.provider as ChannelProvider).banRisk,
    })),
  };
}
