/**
 * OS CRÉDITOS DA ÁREA (migration 0938) — a carteira nunca fica negativa e nada credita duas vezes.
 *
 * `fn_area_creditos_mover` é o único caminho de escrita em `area_creditos`. Aqui a prova é no Postgres de
 * verdade: entrada aplica e devolve o saldo; a mesma referência de novo não move nada (`repetido`); saída maior
 * que o saldo é recusada (`sem_saldo`) e não grava linha; e só o `service_role` executa — nem `anon` nem
 * `authenticated` (a anon key vai para o navegador).
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

const contato = randomUUID();
const mover = (delta: number, referencia: string, motivo = "pacote") =>
  sql(`select resultado || ':' || saldo from public.fn_area_creditos_mover('${GOV_ORG}', '${contato}', ${delta}, '${motivo}', '${referencia}');`);
const linhas = () => Number(sql(`select count(*) from public.area_creditos where organization_id = '${GOV_ORG}' and contact_id = '${contato}';`));

beforeAll(() => {
  seedGov();
  sql(`insert into public.contacts (id, organization_id, name) values ('${contato}', '${GOV_ORG}', 'Dona da carteira');`);
});

describe("área do cliente: a carteira de créditos", () => {
  it("entrada aplica e devolve o saldo", () => {
    expect(mover(70, `pagamento-${contato}-1`)).toBe("aplicado:70");
    expect(linhas()).toBe(1);
  });

  it("a mesma referência outra vez (aviso reentregue) não move nada", () => {
    expect(mover(70, `pagamento-${contato}-1`)).toBe("repetido:70");
    expect(linhas()).toBe(1);
  });

  it("saída maior que o saldo é recusada e não grava linha", () => {
    expect(mover(-71, `leitura-${contato}-a`, "leitura")).toBe("sem_saldo:70");
    expect(linhas()).toBe(1);
  });

  it("saída que cabe aplica, e o saldo é a soma do extrato", () => {
    expect(mover(-15, `leitura-${contato}-b`, "leitura")).toBe("aplicado:55");
    expect(mover(-55, `leitura-${contato}-c`, "leitura")).toBe("aplicado:0");
    expect(mover(-1, `leitura-${contato}-d`, "leitura")).toBe("sem_saldo:0");
    expect(sql(`select sum(delta) from public.area_creditos where organization_id = '${GOV_ORG}' and contact_id = '${contato}';`)).toBe("0");
    expect(linhas()).toBe(3);
  });

  it("só o service_role executa a função", () => {
    const pode = (papel: string) =>
      sql(`select has_function_privilege('${papel}', 'public.fn_area_creditos_mover(uuid, uuid, integer, text, text)', 'EXECUTE');`);
    expect(pode("anon")).toBe("f");
    expect(pode("authenticated")).toBe("f");
    expect(pode("service_role")).toBe("t");
  });
});
