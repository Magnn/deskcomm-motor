/**
 * O BLOCO DO COMBINADO — o que o agente lê, a cada mensagem, quando esta pessoa
 * já tem um retorno marcado para uma data (quem só pode pagar no dia tal, quem
 * pediu para ser procurada depois).
 *
 * ── O defeito que ele fecha ────────────────────────────────────────────────
 *
 * O retorno agendado morava só em `cron_jobs`: o turno que DISPARA na data sabe
 * por que voltou, mas os turnos do meio — a pessoa respondendo à mensagem que
 * mantém a janela de 24 horas aberta, ou escrevendo por conta própria — não
 * sabiam que havia um combinado. O agente tratava cada resposta como conversa
 * nova: refazia a oferta, renegociava o valor já acertado ou seguia num assunto
 * que não levava a lugar nenhum.
 *
 * Aqui o combinado é DADO, lido do banco, e o comportamento de espera vem escrito:
 * acolher curto, não refazer o que já foi feito, e voltar ao combinado. Se a
 * pessoa quiser adiantar, o funil segue — o bloco não tranca a venda.
 *
 * Pura: recebe o retorno já lido. Quem lê é `inbound-turn.ts`.
 */

export interface CombinadoDoContato {
  /** O instante que o agente prometeu, como ele escreveu (ISO), ou o do disparo. */
  prometidoPara: string | null;
  /** Quando o sistema vai falar com a pessoa. ISO. */
  quando: string;
  /** O que foi prometido, nas palavras do agente. */
  promessa: string | null;
  /** Por que voltar. */
  motivo: string;
}

function dataLegivel(iso: string, fuso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    // Só NÚMEROS, montados à mão: este texto é lido pelo modelo, não por uma pessoa numa tela, e
    // dia/mês/hora em algarismos não dependem de idioma. O que importa aqui é o FUSO da empresa.
    const partes = new Intl.DateTimeFormat("en-GB", {
      timeZone: fuso,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const p = (tipo: string): string => partes.find((x) => x.type === tipo)?.value ?? "";
    return `o dia ${p("day")}/${p("month")}/${p("year")}, às ${p("hour")}:${p("minute")}`;
  } catch {
    return d.toISOString();
  }
}

/** Uma linha só, sem quebra: o texto vem de um turno anterior do próprio agente. */
function emUmaLinha(texto: string | null | undefined, teto: number): string {
  return (texto ?? "").replace(/\s+/g, " ").trim().slice(0, teto);
}

/**
 * `''` quando não há combinado no futuro — o system segue idêntico.
 *
 * Retorno que já venceu não entra: o turno que dispara na data tem o próprio
 * motivo, e dizer "espere até ontem" a um modelo é pedir resposta sem sentido.
 */
export function blocoDoCombinado(c: CombinadoDoContato | null | undefined, agora: Date, fuso: string): string {
  if (!c) return "";
  const instante = c.prometidoPara ?? c.quando;
  const data = new Date(instante);
  if (Number.isNaN(data.getTime()) || data.getTime() <= agora.getTime()) return "";

  const quando = dataLegivel(instante, fuso) ?? instante;
  const promessa = emUmaLinha(c.promessa, 400);
  const motivo = emUmaLinha(c.motivo, 300);

  const linhas = [
    "",
    "",
    "RETORNO COMBINADO (lido do sistema; enquanto a data não chega, vale mais que o roteiro de venda escrito antes)",
    `- Esta pessoa já tem um retorno seu marcado para ${quando}.${promessa ? ` O que você prometeu: "${promessa}".` : ""}${motivo ? ` Motivo anotado: ${motivo}.` : ""}`,
    "- O que já foi feito NÃO se refaz: não repita a leitura, a oferta nem o valor, e não negocie de novo. Ficou combinado.",
    "- Se ela escrever antes da data: acolha o que ela disse em 1 ou 2 frases, ligadas ao que ELA contou, e volte ao combinado — confirme que segue de pé para a data marcada. Não puxe assunto novo, não faça pergunta solta e não estique a conversa.",
    "- Se ela disser que consegue pagar ou seguir ANTES da data: ótimo — siga o funil normalmente (o bloco de PREÇO E NEGOCIAÇÃO diz o valor e o link).",
    "- Se ela pedir outra data: cancele o retorno atual e agende o novo, e confirme a data nova em uma frase. Se desistir, agradeça e cancele o retorno.",
    "- NÃO agende outro retorno por cima deste e NÃO chame atendimento humano só porque o pagamento ficou para depois.",
  ];
  return linhas.join("\n");
}
