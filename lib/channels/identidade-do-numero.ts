/**
 * Quem o agente é NESTE número: o nome do perfil do WhatsApp e o telefone do número.
 *
 * O mesmo agente atende vários números (`ai_agent_numeros`, migration 0962), e cada número pode ter um
 * nome de perfil diferente (Esmeralda, Estela, Suzana). A pessoa vê o nome do perfil, então o agente se
 * apresenta por ele. O cartão "salve meu número" sai com o número em que a conversa está, não com um
 * telefone fixo no fluxo, e ele mesmo é o número que o cartão mostra.
 *
 * O nome vem do transporte (`me.pushName`) e é gravado pelo reconciliador de sessões em
 * `channel_sessions.metadata.nome_no_perfil`. Ele é derivado e refeito a cada tick, nunca é
 * digitado, por isso não ocupa `display_name`, que é o apelido do operador.
 */
import type pg from 'pg';

export interface IdentidadeDoNumero {
  nome: string | null;
  telefone: string | null;
}

/** Nome do perfil e telefone do número. Falha de leitura devolve nulos: o turno segue sem o bloco. */
export async function lerIdentidadeDoNumero(
  pool: pg.Pool,
  organizationId: string,
  channelSessionId: string,
): Promise<IdentidadeDoNumero> {
  try {
    const { rows } = await pool.query<{ nome: string | null; telefone: string | null }>(
      `select nullif(trim(metadata->>'nome_no_perfil'), '') as nome, phone_number as telefone
         from channel_sessions where organization_id = $1 and id = $2`,
      [organizationId, channelSessionId],
    );
    return { nome: rows[0]?.nome ?? null, telefone: rows[0]?.telefone ?? null };
  } catch {
    return { nome: null, telefone: null };
  }
}

/** Telefone para cartão e texto: `+55…` a partir do que a sessão guarda (só dígitos ou já com `+`). */
export function telefoneParaExibir(telefone: string | null): string {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  return digitos.length >= 10 ? `+${digitos}` : '';
}

/**
 * Bloco do prompt com o nome do perfil. Vai junto dos limites (fim da fila) porque o prompt-base
 * pode dizer outro nome. É o mesmo agente em vários números, e o nome deste número tem de vencer.
 */
export function blocoDoNomeNoNumero(identidade: IdentidadeDoNumero): string {
  const nome = identidade.nome?.replace(/\s+/g, ' ').trim();
  if (!nome) return '';
  const telefone = telefoneParaExibir(identidade.telefone);
  return (
    `\n\nSEU NOME NESTE WHATSAPP: ${nome}.` +
    ` É o nome que a pessoa vê no perfil deste número${telefone ? ` (${telefone})` : ''}.` +
    ` Apresente-se e assine SEMPRE como ${nome}. Onde as instruções acima derem outro nome para você, use ${nome}.` +
    ` Se precisar dizer o seu número, é este${telefone ? `: ${telefone}` : ''}, nunca outro.` +
    // 16/11/2026: "Está escrito [nome]" falava do nome no perfil do número, e a agente passou a chamar a pessoa por ele.
    ` Quando a pessoa disser que "está escrito", "aparece" ou "aqui diz" um nome, ela fala do que vê no SEU perfil, não do nome dela:` +
    ` explique em meia frase que ${nome} é o nome com que você atende neste número, e nunca chame a pessoa por esse nome.\n`
  );
}
