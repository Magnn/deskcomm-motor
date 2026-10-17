/**
 * QUEM PEDIU PARA PARAR O ACOMPANHAMENTO NÃO RECEBE MAIS OFERTA.
 *
 * ─── O que se via em produção ────────────────────────────────────────────────────────────────────
 * Medido em 17/10/2026: uma cliente respondeu à pergunta "quer seguir com o acompanhamento ou prefere
 * que eu pare?" com "não quero mais continuar". A agente encerrou e prometeu tirá-la dos toques — e no
 * dia seguinte ela recebeu uma oferta. A frase não é opt-out de comunicação (`lib/opt-out/deteccao.ts`
 * só bloqueia pedido de não receber MENSAGEM), e a promessa da agente não deixava rastro nenhum.
 *
 * ─── Como ────────────────────────────────────────────────────────────────────────────────────────
 * Quem decide que é pedido de parar é a agente, que tem a conversa inteira: ela escreve a marca
 * `[[ENCERRAR_ACOMPANHAMENTO]]` na despedida. O envio tira a marca do texto e grava a recusa REGISTRADA
 * que o produto já respeita — `contacts.consent.marketing.declined_at` (campanhas, automações e
 * prospecção já leem; o pós-venda da conversa passa a ler em `inbound-turn.ts`). A pessoa continua
 * podendo escrever e ser atendida: isto corta o que NÓS iniciamos, não a conversa.
 *
 * O bloco ensina a distinguir: "não quero mais saber DELE" fala da história dela, não do atendimento.
 */
import type pg from "pg";

export const MARCA_DE_ENCERRAMENTO = "[[ENCERRAR_ACOMPANHAMENTO]]";

export function temMarcaDeEncerramento(texto: string): boolean {
  return texto.includes(MARCA_DE_ENCERRAMENTO);
}

/** O texto sem a marca, sem sobra de espaço ou de bolha vazia. Puro. */
export function semAMarcaDeEncerramento(texto: string): string {
  return texto
    .split(MARCA_DE_ENCERRAMENTO)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** O bloco do turno para quem já comprou e ainda não pediu para parar. Puro. */
export function blocoDoEncerramento(): string {
  return [
    "",
    "",
    "SE ELA PEDIR PARA PARAR O ATENDIMENTO",
    "- Quando ela pedir para parar o acompanhamento, as mensagens que você manda ou as ofertas (por exemplo, \"não quero mais continuar\" respondendo se ela quer seguir com você, \"pode parar de me mandar\", \"não quero mais nada\"): respeite sem argumentar, despeça-se com carinho em 1 ou 2 balões e, no fim da mensagem, escreva a marca " +
      `${MARCA_DE_ENCERRAMENTO} (ela não aparece para a pessoa e faz o sistema parar de oferecer qualquer coisa a ela).`,
    `- NÃO use a marca quando ela fala de parar com a OUTRA pessoa ou com a própria história ("não quero mais saber dele", "vou esquecer", "deu, vou cuidar de mim"): isso é sobre a vida dela, não sobre o atendimento.`,
  ].join("\n");
}

/**
 * Grava a recusa no contato: `consent.marketing.declined_at` (e de onde veio). Mantém o que já houver
 * em `consent`; a recusa mais antiga não é sobrescrita.
 */
export async function registrarEncerramento(
  pool: pg.Pool,
  args: { organizationId: string; contactId: string; agora?: Date },
): Promise<void> {
  await pool.query(
    `update contacts
        set consent = jsonb_set(
              coalesce(consent, '{}'::jsonb),
              '{marketing}',
              coalesce(consent->'marketing', '{}'::jsonb)
                || jsonb_build_object(
                     'declined_at', coalesce(consent->'marketing'->>'declined_at', $3::text),
                     'declined_source', coalesce(consent->'marketing'->>'declined_source', 'conversa')
                   ),
              true)
      where organization_id = $1 and id = $2`,
    [args.organizationId, args.contactId, (args.agora ?? new Date()).toISOString()],
  );
}
