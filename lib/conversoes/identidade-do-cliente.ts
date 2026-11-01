/**
 * QUEM É O CLIENTE, para a plataforma de anúncios casar o evento com uma conta dela.
 *
 * A nota de "qualidade da correspondência" de cada evento sobe com cada dado do cliente que vai junto.
 * Medido em 29/10/2026 no pixel de uma organização: a Compra tinha nota 7,2/10 e ia só com telefone, país,
 * clique, IP e navegador. Dos 581 contatos que geraram evento em 30 dias, 16 tinham e-mail e NENHUM tinha
 * nome ou nascimento gravados, embora o atendimento peça "nome completo e data de nascimento" em toda
 * leitura: a resposta ficava como texto livre num campo do lead ("Ana Maria Souza 29/04/72").
 *
 * Este arquivo junta o que existe, nesta ordem de confiança: o que está gravado no contato; o que se lê,
 * com regra estrita, da resposta do cliente nos campos do lead; o que o próprio cliente escreveu na conversa
 * (só quando faltou algo, e com regra mais estrita ainda); e, só para o primeiro nome, o nome do perfil do
 * WhatsApp. Nada aqui grava: é leitura para o envio.
 *
 * Medido em 01/11/2026: na Compra, nascimento em 56% dos eventos e sobrenome em 50%.
 *
 * Puro, exceto `lerIdentidade` (uma consulta).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { IdentidadeDoCliente } from "@/lib/plataformas-de-anuncio/types";

/** Uma data dd/mm/aa(aa) com barra, ponto ou hífen. */
const DATA = /(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})/;

/**
 * Nome e nascimento de uma resposta como "Ana Maria Souza 29/04/72" ou "Ana Souza - 01.07.1985".
 * Regra estrita, porque dado errado é pior que dado nenhum: a data tem de existir no calendário e dar
 * entre 10 e 110 anos; o nome é o que vem ANTES da data, só com letras, e com 2 letras ou mais.
 */
export function identidadeDaResposta(texto: unknown, hoje: Date = new Date()): { nome: string | null; nascimento: string | null } {
  if (typeof texto !== "string") return { nome: null, nascimento: null };
  const linha = texto.replace(/\s+/g, " ").trim();
  const m = DATA.exec(linha);
  if (!m) return { nome: null, nascimento: null };

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = Number(m[3]);
  if (m[3]!.length === 2) ano += ano > hoje.getFullYear() % 100 ? 1900 : 2000;
  else if (m[3]!.length === 3) return { nome: null, nascimento: null };

  const data = new Date(Date.UTC(ano, mes - 1, dia));
  const existe = data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
  const idade = hoje.getFullYear() - ano;
  const nascimento = existe && idade >= 10 && idade <= 110
    ? `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
    : null;

  const nome = somenteLetras(linha.slice(0, m.index));
  return { nome: nome.length >= 2 ? nome : null, nascimento };
}

/** Palavras que mostram que a frase fala de outra pessoa ou de outra data, e não é "nome e nascimento". */
const FORA_DE_NOME = /(?<![\p{L}])(meu|minha|dele|dela|filho|filha|marido|esposo|esposa|namorado|namorada|nasceu|dia|hoje|paguei|pago|pagamento|pix|vence|vencimento)(?![\p{L}])/iu;

/**
 * A mensagem do cliente que é, inteira, "Nome Sobrenome dd/mm/aaaa". Mais estrita que a resposta guardada no
 * lead, porque aqui o texto é livre: tem de ter pelo menos duas palavras antes da data, nada depois dela e
 * nenhuma palavra de `FORA_DE_NOME`. Devolve o texto para seguir o caminho das respostas, ou `null`.
 */
export function nomeENascimentoDaMensagem(corpo: unknown, hoje: Date = new Date()): string | null {
  if (typeof corpo !== "string") return null;
  const linha = corpo.replace(/\s+/g, " ").trim();
  if (linha.length > 80 || FORA_DE_NOME.test(linha)) return null;
  const m = DATA.exec(linha);
  if (!m || m.index + m[0].length !== linha.length) return null;
  const { nome, nascimento } = identidadeDaResposta(linha, hoje);
  return nome && nascimento && nome.split(" ").length >= 2 ? linha : null;
}

/** Letras (com acento) e espaços; o resto vira espaço. */
function somenteLetras(s: string): string {
  return s.replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Primeiro nome e sobrenome, já no formato da plataforma: minúsculas e só letras. "Ana Maria Souza" →
 * `ana` / `souza`. Uma palavra só vira só o primeiro nome.
 */
export function partesDoNome(nome: string | null | undefined): { primeiro: string | null; sobrenome: string | null } {
  const palavras = somenteLetras(nome ?? "").toLowerCase().split(" ").filter((p) => p.length >= 2);
  if (palavras.length === 0) return { primeiro: null, sobrenome: null };
  return { primeiro: palavras[0]!, sobrenome: palavras.length > 1 ? palavras[palavras.length - 1]! : null };
}

interface LinhaDoContato {
  id: string;
  email: string | null;
  name: string | null;
  display_name: string | null;
  birthdate: string | null;
}

/** A identidade a partir do contato e das respostas guardadas nos leads dele. Pura. */
export function montarIdentidade(contato: LinhaDoContato, respostas: unknown[], hoje: Date = new Date()): IdentidadeDoCliente {
  let nomeDaResposta: string | null = null;
  let nascimentoDaResposta: string | null = null;
  for (const r of respostas) {
    const lida = identidadeDaResposta(r, hoje);
    nomeDaResposta ??= lida.nome;
    nascimentoDaResposta ??= lida.nascimento;
    if (nomeDaResposta && nascimentoDaResposta) break;
  }

  const nomeCompleto = contato.name?.trim() || nomeDaResposta;
  const { primeiro, sobrenome } = nomeCompleto
    ? partesDoNome(nomeCompleto)
    // O nome do perfil do WhatsApp é apelido muitas vezes ("Filha Do Dono 😍"): serve só para o primeiro nome.
    : { primeiro: partesDoNome(contato.display_name).primeiro, sobrenome: null };

  const email = contato.email?.trim().toLowerCase() || null;
  return {
    idExterno: contato.id,
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    primeiroNome: primeiro,
    sobrenome,
    nascimento: contato.birthdate?.slice(0, 10) || nascimentoDaResposta,
  };
}

/** O começo da conversa basta: nome e nascimento são pedidos antes da leitura. */
const MENSAGENS_LIDAS = 60;

/** Lê o contato, as respostas de texto dos leads dele e, se faltar dado, o começo da conversa. Falha de leitura = identidade só com o id. */
export async function lerIdentidade(admin: SupabaseClient, organizationId: string, contactId: string): Promise<IdentidadeDoCliente> {
  try {
    const [{ data: contato }, { data: leads }] = await Promise.all([
      admin
        .from("contacts")
        .select("id, email, name, display_name, birthdate")
        .eq("id", contactId)
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin
        .from("crm_leads")
        .select("custom_fields")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (!contato) return { idExterno: contactId };
    const respostas = ((leads ?? []) as Array<{ custom_fields: Record<string, unknown> | null }>)
      .flatMap((l) => Object.values(l.custom_fields ?? {}))
      .filter((v): v is string => typeof v === "string");
    const identidade = montarIdentidade(contato as LinhaDoContato, respostas);
    if (identidade.sobrenome && identidade.nascimento) return identidade;

    // Faltou algo: as primeiras mensagens do cliente, em ordem, porque o dado dele vem antes do de outra pessoa.
    const { data: mensagens } = await admin
      .from("messages")
      .select("body")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: true })
      .limit(MENSAGENS_LIDAS);
    const daConversa = ((mensagens ?? []) as Array<{ body: string | null }>)
      .map((m) => nomeENascimentoDaMensagem(m.body))
      .filter((v): v is string => v !== null);
    return montarIdentidade(contato as LinhaDoContato, [...respostas, ...daConversa]);
  } catch {
    return { idExterno: contactId };
  }
}
