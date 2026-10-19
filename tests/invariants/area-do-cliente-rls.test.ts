/**
 * ÁREA DO CLIENTE (migration 0928) — o que é do comprador não vaza para ninguém.
 *
 * Três tabelas são SÓ DO SERVIDOR: `area_codigos` (o código de entrada mandado
 * por e-mail), `area_diario` (o que a pessoa anota) e `area_perguntas` (a
 * pergunta do mês e a resposta). Nem a equipe da própria organização lê — nem
 * o admin. O painel só conta, pelos eventos. Aqui a prova é por JWT de verdade:
 * com linhas da organização gravadas, o admin dela lê zero, e `anon` também.
 *
 * As outras seis (vitrine, convites, sessões, eventos, assinaturas, conteúdos)
 * são lidas pela equipe e estão em TABLES de `rls-isolation.test.ts`.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ADMIN, GOV_ORG, countAs, seedGov, sql } from "./gov-helpers";

const SO_DO_SERVIDOR = ["area_codigos", "area_diario", "area_perguntas", "area_presentes", "area_ano_pessoal", "area_leituras", "area_creditos", "area_avisos", "area_perfis"] as const;

beforeAll(() => {
  seedGov();
  const contato = randomUUID();
  sql(`
    insert into public.contacts (id, organization_id, name) values ('${contato}', '${GOV_ORG}', 'Compradora da área');
    insert into public.area_codigos (organization_id, contact_id, code_hash, expires_at)
      values ('${GOV_ORG}', '${contato}', repeat('a', 64), now() + interval '10 minutes');
    insert into public.area_diario (organization_id, contact_id, texto)
      values ('${GOV_ORG}', '${contato}', 'o que eu anotei');
    insert into public.area_perguntas (organization_id, contact_id, mes, pergunta)
      values ('${GOV_ORG}', '${contato}', date_trunc('month', now())::date, 'minha pergunta');
    insert into public.area_presentes (organization_id, de_contact_id, codigo)
      values ('${GOV_ORG}', '${contato}', 'presente-${contato}');
    insert into public.area_ano_pessoal (organization_id, contact_id, ano)
      values ('${GOV_ORG}', '${contato}', 2026);
    insert into public.area_leituras (organization_id, contact_id, modalidade, pergunta, preco_cents)
      values ('${GOV_ORG}', '${contato}', 'tarot', 'minha pergunta às cartas', 500);
    insert into public.area_creditos (organization_id, contact_id, delta, motivo, referencia)
      values ('${GOV_ORG}', '${contato}', 30, 'pacote', 'pagamento-rls-${contato}');
    insert into public.area_avisos (organization_id, contact_id, endpoint, p256dh, auth)
      values ('${GOV_ORG}', '${contato}', 'https://push.test/${contato}', repeat('p', 20), repeat('a', 12));
    insert into public.area_perfis (organization_id, contact_id, foco, o_que_pesa)
      values ('${GOV_ORG}', '${contato}', 'amor', 'o que me pesa');
  `);
});

describe("área do cliente: o que é do comprador só o servidor lê", () => {
  for (const tabela of SO_DO_SERVIDOR) {
    it(`${tabela}: as linhas existem (controle — sem isto o zero abaixo não prova nada)`, () => {
      expect(Number(sql(`select count(*) from public.${tabela} where organization_id = '${GOV_ORG}';`))).toBeGreaterThanOrEqual(1);
    });

    it(`${tabela}: nem o admin da PRÓPRIA organização lê`, () => {
      // Sem grant a authenticated a leitura falha (-1) ou devolve zero; nunca uma linha.
      const lidas = (() => {
        try {
          return countAs(GOV_ADMIN, `select count(*) from public.${tabela} where organization_id = '${GOV_ORG}';`);
        } catch {
          return 0;
        }
      })();
      expect(lidas).toBe(0);
    });

    it(`${tabela}: anon não tem privilégio nenhum`, () => {
      const privilegios = sql(
        `select count(*) from information_schema.role_table_grants
          where table_schema = 'public' and table_name = '${tabela}' and grantee in ('anon', 'authenticated');`,
      );
      expect(Number(privilegios)).toBe(0);
    });
  }
});
