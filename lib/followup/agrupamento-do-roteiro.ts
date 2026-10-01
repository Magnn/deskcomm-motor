/**
 * «Agrupar respostas em X segundos» do nó Pergunta — o que a opção FAZ.
 *
 * Quem responde uma pergunta costuma mandar em pedaços («sim» / «quero» / «pra março»). O
 * turno do agente espera uma JANELA antes de responder (o debounce de rajada,
 * `lib/agent-engine/edge/crm/debounce.ts`) para ler tudo junto em vez de responder a cada
 * pedaço. Essa janela é uma só por instalação (`knobs.debounceMs`); a Pergunta pode ter a
 * sua: enquanto o roteiro espera a resposta DESTA pergunta, vale a janela dela.
 *
 *   • ausente  → a da instalação (nada muda);
 *   • 0        → sem janela: responde na hora, a cada mensagem;
 *   • N        → N segundos.
 *
 * Só vale para o roteiro de atendimento (`surface = atendimento`), que é onde a Pergunta
 * existe. Fail-open: qualquer falha devolve `null` e o turno usa a janela da instalação —
 * nunca deixa o cliente sem resposta por causa desta leitura.
 */
import {
  carregarEstadoDeAtendimento,
  type BancoDoRoteiro,
  type EstadoDeAtendimento,
} from "./atendimento";

/**
 * A pergunta que está no ar: a primeira ainda sem valor que já FOI FEITA ao cliente. Uma
 * pergunta ainda não feita não pode ditar a janela da resposta que o cliente dá a outra.
 */
export function janelaDaPerguntaAtualMs(
  estado: Pick<EstadoDeAtendimento, "situacao" | "perguntasFeitas">,
): number | null {
  const atual = estado.situacao.pendentes.find((n) => estado.perguntasFeitas.has(n.config.key));
  const segundos = atual?.config.agrupar_respostas_segundos;
  if (segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return null;
  return Math.round(segundos * 1000);
}

export async function debounceDoRoteiroMs(
  db: BancoDoRoteiro,
  alvo: { organizationId: string; contactId: string },
): Promise<number | null> {
  try {
    const estado = await carregarEstadoDeAtendimento(db, alvo);
    return estado === null ? null : janelaDaPerguntaAtualMs(estado);
  } catch {
    return null;
  }
}
