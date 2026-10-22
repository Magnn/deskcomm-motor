/**
 * O LEAD DO QUIZ: quem dá o e-mail para ver a prévia vira contato NA HORA — não só quando pede o pagamento.
 *
 * Até 22/10/2026 o e-mail digitado antes da prévia só ia ao servidor no clique em pagar: quem via a prévia e
 * não comprava (a maior parte) ia embora sem deixar nada, e o "lead" que a Meta contava não existia no CRM. A
 * tela do e-mail avisa que ele fica guardado para mandar o resultado e conteúdos (`_textos.ts`, `avisoDoEmail`).
 */
import { z } from "zod";

import { QUIZZES_DA_PAGINA } from "./passos-do-quiz";

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leadDoQuizSchema = z.strictObject({
  visita: z.string().uuid(),
  quiz: z.enum(QUIZZES_DA_PAGINA),
  nome: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  nascimento: data.optional(),
  /** A sinastria: a outra pessoa. Vai só para a origem do contato, não vira contato. */
  nome_dele: z.string().trim().max(80).optional(),
  nascimento_dele: data.optional(),
  respostas: z.record(z.string().max(20), z.string().max(80)).default({}),
  campanha: z.string().trim().max(80).optional(),
});
export type LeadDoQuiz = z.infer<typeof leadDoQuizSchema>;

/** O que fica em `contacts.source_metadata` de quem nasce pelo quiz — o contexto do lead, sem dado a mais. */
export function origemDoLead(l: LeadDoQuiz): Record<string, unknown> {
  return {
    origem: "quiz",
    quiz: l.quiz,
    momento: "previa",
    ...(l.campanha ? { campanha: l.campanha } : {}),
    ...(Object.keys(l.respostas).length > 0 ? { respostas: l.respostas } : {}),
    ...(l.nome_dele ? { nome_dele: l.nome_dele } : {}),
    ...(l.nascimento_dele ? { nascimento_dele: l.nascimento_dele } : {}),
  };
}
