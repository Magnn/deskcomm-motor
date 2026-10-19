/**
 * A LISTA DE CRONS DO AGENDADOR NÃO PODE TER ASPAS DUPLAS.
 *
 * Em `docker/scheduler/entrypoint.sh` a lista mora dentro de `CRONS="…"`. Uma aspa dupla num
 * comentário FECHA o texto, e o resto vira comando: em 19/10/2026 um comentário com uma frase entre
 * aspas fez o agendador morrer no boot (`line 119: sua: not found`) — pego pelo CI da imagem, antes de
 * produção. Sem agendador, nenhum cron roda: follow-up, campanha, lembrete, aviso.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const script = readFileSync(join(process.cwd(), "docker", "scheduler", "entrypoint.sh"), "utf8");

describe("agendador: a lista de crons", () => {
  const inicio = script.indexOf('CRONS="');
  const corpo = script.slice(inicio + 'CRONS="'.length, script.indexOf('\n"', inicio));

  it("o instrumento acha a lista (controle)", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(corpo).toContain("api/v1/cron/");
  });

  it("⭐ nenhuma aspa dupla dentro da lista — nem em comentário", () => {
    const linhas = corpo.split("\n").filter((l) => l.includes('"') || l.includes("`") || l.includes("$("));
    expect(linhas, "aspa dupla, crase ou $( dentro de CRONS=\"…\" quebra o agendador no boot").toEqual([]);
  });

  it("toda linha de cron tem quando|tempo|rota", () => {
    const crons = corpo.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
    for (const l of crons) expect(l, l).toMatch(/^[^|]+\|\d+\|api\/v1\/[a-z0-9/_-]+(\?[a-z0-9_=&]+)?$/);
  });
});
