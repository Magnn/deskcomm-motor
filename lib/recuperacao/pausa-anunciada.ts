/**
 * PAUSA ANUNCIADA — a pessoa avisou que ia sair e que volta depois. Isso não é silêncio de quem desistiu.
 *
 * A oferta por silêncio (`step_offers_cents`) baixa o valor para quem ouviu o preço e sumiu: é a leitura de
 * que o preço pesou. Quem escreveu "tô indo pra casa, depois a gente se fala" disse por que ia parar, e não
 * foi o preço. Medido em 21/10/2026: um cliente ouviu R$ 130, avisou que estava saindo de carro, e a régua
 * ofereceu R$ 100 três horas depois e R$ 60 seis horas depois; na manhã seguinte ele pagou os R$ 60 sem
 * nunca ter reclamado do valor.
 *
 * Com a pausa anunciada, a retomada continua, mas sem desconto. Folha pura.
 */

const PAUSA =
  /\b(depois (a gente|nois|n[óo]s|eu) (se )?(fala|falamos|conversa|vejo|v[êe]|te chamo|retorno)|mais tarde|daqui a pouco|daqui (um|uma) (pouco|hora|horinha)|j[áa] (j[áa]|volto)|volto (j[áa]|depois|mais tarde|amanh[ãa])|te (chamo|falo|retorno|respondo|aviso) (depois|mais tarde|amanh[ãa]|quando)|(vou|estou|t[ôo]|to) (indo|saindo|chegando|dirigindo|trabalhando|no trabalho|na estrada|no [ôo]nibus)|indo pra casa|chegando em casa|quando (eu )?(chegar|sair do trabalho|receber)|(e|eu) retorno|vou ver (aqui|e te|e retorno)|amanh[ãa] (eu )?(te )?(falo|vejo|chamo|pago|fa[çc]o))\b/i;

/** A fala é um aviso de pausa ("tô indo pra casa, depois a gente se fala"), não uma recusa. */
export function anunciouPausa(texto: string | null | undefined): boolean {
  if (texto === null || texto === undefined) return false;
  return PAUSA.test(texto);
}
