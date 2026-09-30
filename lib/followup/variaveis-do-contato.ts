/**
 * Variáveis do contato nas mensagens do fluxo, com chave simples ou dupla
 * (`{full_name}` / `{{full_name}}`) — os formulários do editor oferecem as duas
 * grafias, e em inglês e em português, e o dono do fluxo cola a que vê:
 *
 *   nome completo  `full_name`  `nome_completo`  `nome`
 *   primeiro nome  `first_name` `primeiro_nome`
 *   telefone       `phone_number` `telefone`
 *   e-mail         `email`
 *
 * Variável que o contato não tem (nome vazio, sem e-mail) vira texto vazio, nunca
 * o token cru: "Olá {full_name}!" chegando ao cliente é pior que "Olá !". Token
 * DESCONHECIDO fica como está — pode ser outro mecanismo (`{{volta}}`), e apagar
 * o que não entendemos esconde erro de digitação.
 */
export interface ContatoParaVariaveis {
  name: string | null;
  phone: string | null;
  email: string | null;
}

const NOMES = [
  "full_name",
  "nome_completo",
  "nome",
  "first_name",
  "primeiro_nome",
  "phone_number",
  "telefone",
  "email",
] as const;

const TOKEN = new RegExp(String.raw`\{\{?\s*(${NOMES.join("|")})\s*\}\}?`, "g");

export function preencherVariaveisDoContato(texto: string, contato: ContatoParaVariaveis): string {
  const completo = (contato.name ?? "").trim();
  const primeiro = completo.split(/\s+/)[0] ?? "";
  const telefone = (contato.phone ?? "").trim();
  const valores: Record<(typeof NOMES)[number], string> = {
    full_name: completo,
    nome_completo: completo,
    nome: completo,
    first_name: primeiro,
    primeiro_nome: primeiro,
    phone_number: telefone,
    telefone,
    email: (contato.email ?? "").trim(),
  };
  return texto.replace(TOKEN, (_m, chave: (typeof NOMES)[number]) => valores[chave]);
}
