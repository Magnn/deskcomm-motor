/**
 * OS AVISOS DA ÁREA DO CLIENTE — as regras puras (pedido do dono em 19/10/2026).
 *
 * A área vira um app no celular e quem quiser recebe UM aviso por dia, na hora que a empresa escolheu:
 * "a sua carta de hoje abriu". É o motivo diário de voltar, sem depender do WhatsApp.
 *
 * Contenção: um por dia, só para quem pediu, desligável na própria área, e sem culpa — o aviso convida,
 * nunca cobra ("você perdeu…" não existe aqui).
 */

/** A hora padrão do aviso, no relógio de parede da empresa. */
export const HORA_PADRAO_DO_AVISO = 8;

export interface ConfigDosAvisos {
  ativo: boolean;
  hora: number;
}

/** O aviso sai na rodada da hora marcada, uma vez por dia por aparelho. */
export function deveAvisarAgora(p: { horaLocal: number; horaDoAviso: number; hojeLocal: string; ultimoAvisoDia: string | null }): boolean {
  return p.horaLocal === p.horaDoAviso && p.ultimoAvisoDia !== p.hojeLocal;
}

export interface AvisoDoDia {
  title: string;
  body: string;
  tag: string;
  href: string;
}

/** O que aparece na tela de bloqueio. Convida, não cobra. */
export function avisoDoDia(p: { titulo: string; slug: string; temCartaDoDia: boolean }): AvisoDoDia {
  return {
    title: p.titulo,
    body: p.temCartaDoDia ? "A sua carta de hoje abriu ✦ Toque para ver o que ela diz." : "Tem novidade esperando por você na sua área ✦",
    tag: "area-do-dia",
    href: `/c/${p.slug}?de=aviso`,
  };
}

export function configDosAvisos(bruto: Partial<ConfigDosAvisos> | undefined): ConfigDosAvisos {
  return { ativo: bruto?.ativo ?? false, hora: bruto?.hora ?? HORA_PADRAO_DO_AVISO };
}
