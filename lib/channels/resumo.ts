/**
 * O resumo dos canais para a visão geral de Conexões: "2 números funcionando",
 * "precisa de você". A tela fala em CANAL (WhatsApp, Messenger…), nunca em
 * provider — por isso o agrupamento mora aqui, dentro da cerca de `lib/channels`.
 *
 * Entrada: as linhas de `GET /api/v1/channel-sessions` (já só canais de mensagem e
 * sem arquivados). Provider desconhecido fica de fora: um canal que esta imagem não
 * sabe nomear não vira um número a mais no WhatsApp.
 */
import { STATUS_SAUDAVEL } from "./health";

export type CanalDoResumo = "whatsapp" | "messenger" | "instagram" | "telegram";

export interface ContagemDoCanal {
  total: number;
  funcionando: number;
  precisaDeAtencao: number;
}

export type ResumoDosCanais = Record<CanalDoResumo, ContagemDoCanal>;

const WHATSAPP = new Set(["waha", "meta_cloud", "zernio", "datafy", "kapso"]);

function canalDaLinha(provider: string | undefined, rede: string | null): CanalDoResumo | null {
  if (!provider) return null;
  if (WHATSAPP.has(provider)) return "whatsapp";
  if (provider === "telegram_bot") return "telegram";
  if (provider === "meta_messenger" || provider === "zernio_social") {
    if (rede === "instagram") return "instagram";
    if (provider === "meta_messenger" || rede === "facebook") return "messenger";
  }
  return null;
}

export function resumoDosCanais(
  linhas: ReadonlyArray<{ provider?: string; status: string | null; social_platform?: string | null }>,
): ResumoDosCanais {
  const vazio = (): ContagemDoCanal => ({ total: 0, funcionando: 0, precisaDeAtencao: 0 });
  const resumo: ResumoDosCanais = { whatsapp: vazio(), messenger: vazio(), instagram: vazio(), telegram: vazio() };
  for (const l of linhas) {
    const canal = canalDaLinha(l.provider, l.social_platform ?? null);
    if (!canal) continue;
    const c = resumo[canal];
    c.total += 1;
    if (l.status === STATUS_SAUDAVEL) c.funcionando += 1;
    else c.precisaDeAtencao += 1;
  }
  return resumo;
}
