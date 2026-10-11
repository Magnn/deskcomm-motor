/**
 * A FALA EM TEXTO SOLTO — a resposta que o modelo escreveu e não enviou.
 *
 * O agente fala com a pessoa pela ferramenta `send_message`. Às vezes o modelo escreve a resposta
 * inteira como texto do turno e não aciona ferramenta nenhuma: o turno termina `ok`, com
 * `messages_sent: 0`, e a pessoa fica sem resposta. Medido em produção em 06/10/2026: a cliente
 * respondeu à leitura, o modelo gerou 338 tokens de resposta num passo só, e nada saiu.
 *
 * A regra é estreita de propósito:
 *   - só vale quando NADA foi enviado no turno;
 *   - só vale quando o modelo não acionou NENHUMA ferramenta. Quem acionou ferramenta (passou para uma
 *     pessoa, atualizou o funil, consultou o conhecimento) e não falou, escolheu não falar — e esse
 *     silêncio é respeitado;
 *   - o texto precisa existir;
 *   - o turno precisa RESPONDER a uma mensagem da pessoa. Turno que o próprio sistema abriu (retomada
 *     de silêncio, retorno agendado) não tem ninguém esperando resposta: ali o texto solto é quase
 *     sempre o modelo explicando por que não vai chamar — e o silêncio é um desfecho legítimo;
 *   - o texto precisa ser FALA, e não a explicação de por que o agente decidiu não falar
 *     (`ehNarracaoDoProprioAgente`).
 *
 * Quem envia é o MESMO `send_message` do turno, com a cadeia inteira de travas (opt-out, janela, piso de
 * preço, vocabulário interno, etapa da jornada, balões). Esta função só decide SE há o que enviar.
 */
export interface PassoDoTurno {
  toolCalls?: readonly unknown[] | null;
}

export interface ResultadoDoTurno {
  text?: string | null;
  steps?: readonly PassoDoTurno[] | null;
}

/**
 * A NARRAÇÃO DO PRÓPRIO AGENTE — o texto em que o modelo explica, para o sistema, o que decidiu.
 *
 * ⚠️ Medido em produção de 07 a 09/10/2026: quando o modelo decidia NÃO falar (retomada de silêncio
 * de quem já se despediu, lead marcado como perdido), ele escrevia a decisão como texto do turno —
 * "Não envio nada. O lead encerrou cordialmente, já está marcado como lost e registrado 'não
 * procurar'." — e a regra abaixo mandava esse texto PARA A PESSOA, por WhatsApp. Foram 63 num dia,
 * e pelo menos uma conversa terminou com "Adeus!" depois de a cliente ler que o atendimento era
 * automático.
 *
 * Reconhecida pela FORMA, não pelo assunto: ela fala DA pessoa (terceira pessoa) e do funcionamento
 * do atendimento, nunca COM a pessoa. Um sinal forte basta; sinal fraco precisa de companhia — "o
 * lead" sozinho pode ser fala legítima de quem vende geração de contatos.
 *
 * Errar para este lado custa um silêncio (o comportamento de antes de 06/10); errar para o outro
 * custa a pessoa lendo o raciocínio da máquina. Por isso a rede é larga.
 */
const NARRACAO_FORTE: readonly RegExp[] = [
  /\bn[ãa]o\s+(?:vou\s+(?:enviar|mandar|responder)|envio|enviarei|mando)\s+(?:nada|nenhuma?|mensagem|toque|resposta)/i,
  /\bnenhuma\s+mensagem\s+(?:foi\s+)?enviada\b/i,
  /\bsem\s+enviar\s+(?:nada|nenhuma|mensagem|resposta)\b/i,
  /\b(?:encerro|encerrando|finalizo|concluo)\s+o\s+turno\b/i,
  /\bo\s+hist[óo]rico\s+mostra\b/i,
  /\b(?:nada|nenhum\s+avan[çc]o)\b[^.]{0,30}\b(?:a|para)\s+(?:marcar|salvar|registrar|enviar)\b/i,
  /\bn[ãa]o\s+(?:vou|devo)\s+(?:reengajar|reativar|reabrir)\b/i,
  /\bnenhuma\s+(?:a[çc][ãa]o|mensagem)\b[^.]{0,40}\b(?:turno|envio|necess[áa]ria|agora)\b/i,
  /\b(?:neste|este|pr[óo]ximo|nesse)\s+turno\b/i,
  /\b(?:toque|chamada)\s+(?:de\s+sil[êe]ncio|de\s+retomada|de\s+resgate|autom[áa]tic[oa])/i,
  /\breabrir\s+a\s+cad[êe]ncia\b/i,
  /\bn[ãa]o\s+vou\s+reabrir\s+a\s+(?:conversa|oferta|leitura)\b/i,
  /\bn[ãa]o\s+h[áa]\s+nada\s+(?:novo\s+)?a\s+(?:responder|enviar)\b/i,
  /\b(?:s[óo]\s+)?retomo\s+(?:se\b|d[oe]\s+ponto\b)/i,
  /\bencerrad[oa]\s+com\s+dignidade\b/i,
  /\bmarcad[oa]\s+como\s+(?:lost|won|perdid[oa]|ganh[oa])\b/i,
  /`[a-z][a-z0-9_]{2,}`/,
  /\bn[ãa]o\s+procurar\b[^.]{0,30}\b(?:registr|marcad|nota|mem[óo]ria)/i,
  /\b(?:registr|marcad|nota|mem[óo]ria)[^.]{0,40}\bn[ãa]o\s+procurar\b/i,
];
const NARRACAO_FRACA: readonly RegExp[] = [
  /\b[oa]\s+lead\b/i,
  /\b[oa]\s+(?:cliente|contato)\s+(?:encerrou|recusou|pediu|respondeu|disse|est[áa]|j[áa]|n[ãa]o)\b/i,
  /\bcad[êe]ncia\b/i,
  /\bnota\s+(?:nova|registrada|dur[áa]vel)\b/i,
  /\bfunil\b/i,
  /\bMotor\s+\d+\b/,
  /\bconduta\s+correta\b/i,
  /\bturno\b/i,
  /\b(?:lost|won)\b/,
  /\breengaj/i,
  /\baprendizado\s+(?:novo|dur[áa]vel)\b/i,
  /\b(?:checkpoint|playbook|inbound|follow-?up)\b/i,
  /\best[áa]gio\b/i,
  /\btoque\b[^.]{0,30}\b(?:sil[êe]ncio|recupera[çc][ãa]o|[1-9]\/[1-9])/i,
  // "A mensagem veio vazia" dita SOBRE a pessoa. Dita À pessoa ("a sua última mensagem chegou sem
  // texto") é fala, e o interlocutor abaixo a distingue.
  /(?:mensagem|intera[çc][ãa]o)\b[^.]{0,40}\b(?:vazia|sem\s+texto|n[ãa]o\s+cont[ée]m\s+texto)/i,
];

/**
 * A fala se dirige a alguém. Medido em produção em 10 e 11/10/2026: as narrações que a lista acima
 * deixou passar ("Nenhuma mensagem enviada: a conversa já estava encerrada e a lead pediu…") tinham
 * um sinal fraco só — e nenhuma palavra dita À pessoa. Texto com sinal fraco e sem interlocutor é
 * relato, não conversa.
 */
const FALA_COM_A_PESSOA =
  /(?:^|[^\p{L}])(?:voc[êe]s?|vc|te|ti|contigo|seus?|suas?|teus?|tuas?|meu\s+bem|minha\s+flor|querid[oa]|usted|tu)(?![\p{L}])/iu;

export function ehNarracaoDoProprioAgente(texto: string): boolean {
  if (NARRACAO_FORTE.some((re) => re.test(texto))) return true;
  const fracos = NARRACAO_FRACA.filter((re) => re.test(texto)).length;
  if (fracos >= 2) return true;
  return fracos === 1 && !FALA_COM_A_PESSOA.test(texto);
}

/** O texto a enviar, ou `null` quando o silêncio do turno deve ser respeitado. Pura. */
export function falaEmTextoSolto(
  resultado: ResultadoDoTurno,
  mensagensEnviadas: number,
  respondeAUmaMensagem = true,
): string | null {
  if (mensagensEnviadas > 0) return null;
  // Ninguém escreveu: o turno foi aberto pelo sistema, e não falar é um desfecho legítimo dele.
  if (!respondeAUmaMensagem) return null;
  const acionouFerramenta = (resultado.steps ?? []).some((p) => (p.toolCalls?.length ?? 0) > 0);
  if (acionouFerramenta) return null;
  const texto = (resultado.text ?? "").trim();
  if (texto === "") return null;
  // Texto que narra a decisão do agente não é fala: é o silêncio dele, explicado. Respeita-se.
  return ehNarracaoDoProprioAgente(texto) ? null : texto;
}
