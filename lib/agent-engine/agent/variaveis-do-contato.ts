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
 * ─── Variável DESCONHECIDA fica como está ──────────────────────────────────
 * `{{volta}}`, `{{voltas}}` e os campos de fluxo têm dono próprio; apagar o que
 * este módulo não conhece esconderia o erro de digitação de quem escreveu.
 */
export interface DadosDoContato {
  nome: string | null;
  telefone: string | null;
  email: string | null;
  /** Nome da etapa do funil em que o lead está agora; `null` se não há lead ou etapa. */
  etapa: string | null;
}

const VARIAVEL = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** O vocabulário fechado deste módulo — o mesmo que `CAMPOS_PERSONALIZADOS` oferece na tela. */
export const VARIAVEIS_DO_CONTATO = ['nome', 'primeiro_nome', 'telefone', 'email', 'etapa'] as const;
type VariavelDoContato = (typeof VARIAVEIS_DO_CONTATO)[number];

function ehVariavelDoContato(chave: string): chave is VariavelDoContato {
  return (VARIAVEIS_DO_CONTATO as readonly string[]).includes(chave);
}

/** O texto cita `{{etapa}}`? Quem chama usa isto para só buscar a etapa quando ela é usada. */
export function citaEtapa(texto: string): boolean {
  for (const m of texto.matchAll(VARIAVEL)) {
    if ((m[1] ?? '').toLowerCase() === 'etapa') return true;
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
    if (!ehVariavelDoContato(chave)) return literal;
    const valor = valorDe(chave, dados);
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
