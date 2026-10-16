/**
 * Cria um modelo na conta (WABA) do canal oficial — a outra metade do espelho.
 *
 * O `template-sync.ts` só ESPELHA: o modelo vive na Meta e o banco guarda a
 * cópia. Criar continua respeitando isso — este módulo não grava nada no
 * banco; quem chama sincroniza em seguida, e a linha nasce do que a Meta
 * devolveu (pendente de revisão), nunca do que o operador digitou.
 *
 * O formato do corpo é o da Graph (`name`, `language`, `category`,
 * `components` em MAIÚSCULA) — o mesmo que o parceiro Graph-compatível usa em
 * `graph-parceiro/templates.ts`, montado na tela por `montarComponents`.
 */
export interface NovoModelo {
  name: string;
  language: string;
  category: "AUTHENTICATION" | "MARKETING" | "UTILITY";
  components: Record<string, unknown>[];
}

export interface CriarModeloInput {
  wabaId: string;
  /** Token da Graph API. Resolvido de fonte confiável pelo chamador, nunca do body. */
  token: string;
  /** Ex.: `v22.0` — a mesma versão que o sync usa. */
  graphVersion: string;
  modelo: NovoModelo;
}

export interface ModeloCriado {
  id: string | null;
  status: string | null;
  category: string | null;
}

/**
 * POST em `/{waba}/message_templates`. Recusa da Meta vira `Error` com a
 * mensagem DELA (`error_user_msg` quando existe, que é a que explica ao
 * operador o que corrigir) — nunca o token, que vai no header.
 */
export async function criarModeloNaMeta(input: CriarModeloInput): Promise<ModeloCriado> {
  const url = `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.wabaId)}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input.modelo),
  });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    status?: string;
    category?: string;
    error?: { message?: string; error_user_msg?: string; error_user_title?: string };
  } | null;

  if (!res.ok || json?.error) {
    const e = json?.error;
    const motivo = e?.error_user_msg ?? e?.message ?? `HTTP ${res.status}`;
    throw new Error(e?.error_user_title ? `${e.error_user_title}: ${motivo}` : motivo);
  }

  return { id: json?.id ?? null, status: json?.status ?? null, category: json?.category ?? null };
}
