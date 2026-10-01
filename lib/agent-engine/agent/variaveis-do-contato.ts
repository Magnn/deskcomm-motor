/**
 * As variáveis que o construtor de fluxo oferece no botão "Inserir variável"
 * (`{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`, `{{email}}`, `{{etapa}}`),
 * trocadas pelos dados do contato NA HORA do envio.
 *
 * ─── Por que existe ────────────────────────────────────────────────────────
 * A tela inseria a variável e o motor mandava o texto como estava: o cliente
 * recebia "Olá {{nome}}" literal. O único interpolador que existia
 * (`lib/inbox/template-vars.ts`) é o do composer, onde um HUMANO lê o texto
 * antes de mandar — por isso lá a variável sem valor fica literal, à vista de
 * quem pode consertar. Num fluxo ninguém lê antes: o literal chega ao cliente.
 *
 * ─── Variável sem valor SOME, e a frase é arrumada ─────────────────────────
 * "Olá {{primeiro_nome}}, tudo bem?" sem nome vira "Olá, tudo bem?" — e não
 * "Olá {{primeiro_nome}}, tudo bem?" nem "Olá , tudo bem?". A arrumação só
 * mexe no entorno de uma variável que sumiu; texto sem variável sai intacto,
 * byte a byte.
 *
 * ─── Campos de fluxo ───────────────────────────────────────────────────────
 * `{{qualquer_chave}}` que não é das cinco acima é procurada nos CAMPOS do lead
 * (`crm_leads.custom_fields` — é onde a Pergunta e o nó GPT gravam o que
 * coletam). Achou, troca; o campo existe mas está vazio, some como as outras.
 *
 * ─── Variável DESCONHECIDA fica como está ──────────────────────────────────
 * `{{volta}}` e `{{voltas}}` têm dono próprio (o laço do fluxo), e uma chave que
 * nem é campo do lead fica literal: apagar o que este módulo não conhece
 * esconderia o erro de digitação de quem escreveu.
 */
export interface DadosDoContato {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  /** Nome da etapa do funil em que o lead está agora; `null` se não há lead ou etapa. */
  etapa: string | null;
  /** Campos de fluxo do lead (`custom_fields`), por chave. Ausente = nenhum conhecido. */
  campos?: Readonly<Record<string, string>>;
}

const VARIAVEL = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** O vocabulário fechado deste módulo — o mesmo que `CAMPOS_PERSONALIZADOS` oferece na tela. */
export const VARIAVEIS_DO_CONTATO = ['nome', 'primeiro_nome', 'telefone', 'email', 'etapa'] as const;
type VariavelDoContato = (typeof VARIAVEIS_DO_CONTATO)[number];

function ehVariavelDoContato(chave: string): chave is VariavelDoContato {
  return (VARIAVEIS_DO_CONTATO as readonly string[]).includes(chave);
}

/** Do laço do fluxo (`interpolarVolta`) — nunca são campo do lead. */
const DO_LACO = new Set(['volta', 'voltas']);

/**
 * O texto cita algo que só o LEAD sabe — `{{etapa}}` ou um campo de fluxo?
 * Quem chama usa isto para só consultar o lead quando ele é usado: a maioria
 * dos textos só cita nome/telefone, que já vêm no contexto do turno.
 */
export function citaDadoDoLead(texto: string): boolean {
  for (const m of texto.matchAll(VARIAVEL)) {
    const chave = (m[1] ?? '').toLowerCase();
    if (chave === 'etapa') return true;
    if (!ehVariavelDoContato(chave) && !DO_LACO.has(chave)) return true;
  }
  return false;
}

function valorDe(chave: VariavelDoContato, dados: DadosDoContato): string {
  const nome = (dados.nome ?? '').trim();
  switch (chave) {
    case 'nome':
      return nome;
    case 'primeiro_nome':
      return nome.split(/\s+/)[0] ?? '';
    case 'telefone':
      return (dados.telefone ?? '').trim();
    case 'email':
      return (dados.email ?? '').trim();
    case 'etapa':
      return (dados.etapa ?? '').trim();
  }
}

/** Marca interna de "aqui havia uma variável sem valor" — caractere de uso privado, nunca digitável. */
const BURACO = String.fromCharCode(0xe000);

export function interpolarVariaveisDoContato(texto: string, dados: DadosDoContato): string {
  let sumiuAlguma = false;
  const trocado = texto.replace(VARIAVEL, (literal, bruta: string) => {
    const chave = bruta.toLowerCase();
    let valor: string;
    if (ehVariavelDoContato(chave)) {
      valor = valorDe(chave, dados);
    } else {
      // Campo de fluxo: a chave como foi escrita e, de reserva, em minúsculas.
      const campo = DO_LACO.has(chave) ? undefined : (dados.campos?.[bruta] ?? dados.campos?.[chave]);
      if (campo === undefined) return literal; // nem é campo do lead: fica como está
      valor = campo.trim();
    }
    if (valor !== '') return valor;
    sumiuAlguma = true;
    return BURACO;
  });
  if (!sumiuAlguma) return trocado;

  return trocado
    .split('\n')
    .map((linha) => {
      if (!linha.includes(BURACO)) return linha;
      return linha
        .split(BURACO)
        .join('')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+([,.!?;:])/g, '$1')
        .trim();
    })
    .join('\n')
    .trim();
}
