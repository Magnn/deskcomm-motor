/**
 * Falhas da voz, com a CAUSA nomeada.
 *
 * Quem chama decide o que fazer com cada uma: a tela mostra o motivo em
 * português; o turno da agente cai para TEXTO (a pessoa nunca fica sem
 * resposta por causa de uma nota de voz que não saiu). Por isso o código é um
 * vocabulário fechado, e não a mensagem crua do provedor — a mensagem crua pode
 * conter trecho do texto que a pessoa recebeu, e não vai para log nem tela.
 */
export type CodigoDeErroDeVoz =
  | "sem_chave" // nenhuma chave cadastrada para o provedor
  | "chave_invalida" // 401/403
  | "sem_permissao_de_clonagem" // plano do provedor não inclui clonagem
  | "limite_do_provedor" // 429 ou cota esgotada
  | "voz_inexistente" // 404 na voz escolhida
  | "recusado" // 4xx que não é nenhum dos acima
  | "provedor_fora_do_ar" // 5xx, timeout, rede
  | "formato_invalido" // o áudio devolvido não é Ogg/Opus
  | "sem_conversor" // precisaria converter e não há ffmpeg
  | "amostra_invalida"; // arquivo de clonagem que o provedor não aceita

export class ErroDeVoz extends Error {
  readonly codigo: CodigoDeErroDeVoz;
  readonly httpStatus: number | null;

  constructor(codigo: CodigoDeErroDeVoz, httpStatus: number | null = null, detalhe?: string) {
    super(detalhe ? `${codigo}: ${detalhe}` : codigo);
    this.name = "ErroDeVoz";
    this.codigo = codigo;
    this.httpStatus = httpStatus;
  }
}

/** A frase que a tela mostra para cada causa. */
export function explicarErroDeVoz(e: unknown): string {
  if (!(e instanceof ErroDeVoz)) return "Não consegui gerar a voz agora.";
  switch (e.codigo) {
    case "sem_chave":
      return "Cadastre a chave do provedor de voz antes de usar.";
    case "chave_invalida":
      return "O provedor recusou a chave. Confira se ela está ativa e tem permissão de voz.";
    case "sem_permissao_de_clonagem":
      return "O plano da sua conta no provedor não inclui clonagem de voz.";
    case "limite_do_provedor":
      return "O provedor atingiu o limite de uso. Tente de novo em instantes ou confira a cota.";
    case "voz_inexistente":
      return "Essa voz não existe mais na conta do provedor. Escolha outra.";
    case "provedor_fora_do_ar":
      return "O provedor de voz não respondeu. Tente de novo.";
    case "formato_invalido":
    case "sem_conversor":
      return "O áudio gerado não está num formato que o WhatsApp aceita.";
    case "amostra_invalida":
      return "O provedor não aceitou a gravação. Use um áudio limpo, de 1 a 3 minutos, em mp3, wav ou ogg.";
    default:
      return "O provedor recusou o pedido de voz.";
  }
}
