import { describe, expect, it } from "vitest";

import { leadDoQuizSchema, origemDoLead } from "./lead-do-quiz";
import { csvDosLeads } from "./leads-dos-quizzes";

const VISITA = "11111111-1111-4111-8111-111111111111";

describe("lead do quiz", () => {
  it("aceita o lead da prévia e normaliza o e-mail", () => {
    const l = leadDoQuizSchema.parse({ visita: VISITA, quiz: "caminhos", nome: "Ana", email: " Ana@Exemplo.COM ", respostas: { area: "Amor" } });
    expect(l.email).toBe("ana@exemplo.com");
  });

  it("recusa e-mail inválido e quiz desconhecido", () => {
    expect(leadDoQuizSchema.safeParse({ visita: VISITA, quiz: "caminhos", nome: "Ana", email: "ana" }).success).toBe(false);
    expect(leadDoQuizSchema.safeParse({ visita: VISITA, quiz: "tarot", nome: "Ana", email: "a@b.co" }).success).toBe(false);
  });

  it("a origem guarda o contexto do quiz, sem campo vazio", () => {
    const l = leadDoQuizSchema.parse({ visita: VISITA, quiz: "sinastria", nome: "Ana", email: "a@b.co", nome_dele: "Beto", campanha: "lead-quiz1" });
    expect(origemDoLead(l)).toEqual({ origem: "quiz", quiz: "sinastria", momento: "previa", campanha: "lead-quiz1", nome_dele: "Beto" });
  });

  it("o CSV abre certo no Excel: BOM, ';' e aspas escapadas", () => {
    const csv = csvDosLeads(
      [
        {
          contactId: "c1",
          nome: 'Ana "Lu"; Silva',
          email: "a@b.co",
          nascimento: "1990-05-01",
          quiz: "caminhos",
          ateOnde: "previa",
          campanha: null,
          regiao: "RO",
          celular: true,
          chegouEm: "2026-10-22T18:00:00Z",
          vistoEm: "2026-10-22T18:01:00Z",
        },
      ],
      () => "Viu a prévia",
    );
    expect(csv.startsWith("﻿nome;email;")).toBe(true);
    expect(csv).toContain('"Ana ""Lu""; Silva";a@b.co;1990-05-01;caminhos;Viu a prévia;;RO;celular;');
  });
});
