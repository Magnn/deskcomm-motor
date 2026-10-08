/**
 * O TETO DE MEMÓRIA DO WORKER É CONFIGURÁVEL — E O PADRÃO NÃO MUDOU.
 *
 * Medido em produção (08/10/2026): com 16 atendimentos simultâneos e o teto fixo de 512m, o worker
 * morreu com "JavaScript heap out of memory". O Node dimensiona o heap pela metade do teto do
 * contêiner (259 MiB com 512m), e não havia como subi-lo sem editar o compose à mão — que é
 * exatamente o que a doutrina de packaging proíbe pedir ao operador.
 *
 * O que este arquivo segura:
 *  - o teto vem de WORKER_MEM_LIMIT, com padrão 512m (quem não define nada segue como estava,
 *    e a soma documentada em `docs/runbooks/deploy.md` continua verdadeira);
 *  - a variável está documentada no `.env.example`, junto do porquê;
 *  - os outros serviços não ganharam variável de carona.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compose = readFileSync("docker-compose.prod.yml", "utf8");

/** O bloco de UM serviço: da linha `  nome:` até o próximo serviço de mesmo nível. */
function bloco(servico: string): string {
  const inicio = compose.indexOf(`\n  ${servico}:\n`);
  if (inicio < 0) throw new Error(`serviço ${servico} não encontrado no compose — a sonda ficou cega`);
  const resto = compose.slice(inicio + 1);
  const fim = resto.slice(1).search(/\n {2}[a-z][a-z-]*:\n/);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

describe("o teto de memória do worker", () => {
  it("⭐ vem de WORKER_MEM_LIMIT, com o padrão de sempre (512m)", () => {
    const limites = bloco("worker").match(/^\s*mem_limit:.*$/gm) ?? [];
    expect(limites).toHaveLength(1);
    expect(limites[0]!.trim()).toBe("mem_limit: ${WORKER_MEM_LIMIT:-512m}");
  });

  it("os outros serviços seguem com o teto fixo — nenhuma variável de carona", () => {
    expect(bloco("app")).toMatch(/^\s*mem_limit: 768m$/m);
    expect(bloco("waha")).toMatch(/^\s*mem_limit: 1280m$/m);
    expect(compose.match(/\$\{[A-Z_]*MEM_LIMIT/g)).toEqual(["${WORKER_MEM_LIMIT"]);
  });

  it("a variável está no .env.example, comentada (o padrão é o do compose)", () => {
    const exemplo = readFileSync(".env.example", "utf8");
    expect(exemplo).toMatch(/^# WORKER_MEM_LIMIT=512m$/m);
    expect(exemplo).toContain("QUEUE_MAX_CONCURRENCY");
  });
});
