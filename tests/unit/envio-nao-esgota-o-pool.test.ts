/**
 * O ENVIO NÃO PODE ESGOTAR O POOL — a trava que parou o worker de produção em 07/10/2026.
 *
 * Cada envio segura uma conexão esperando o lock do número, e quem tem a vez pede OUTRA ao mesmo pool
 * (o trace). Com tantos envios quanto conexões, a segunda nunca chega. O pool daqui se comporta como o
 * do `pg`: `connect` e `query` só resolvem quando há conexão livre, e o lock do número só é dado a um
 * por vez. Sem as vagas, este teste não termina.
 */
import type pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { runBeforeSend, type RunBeforeSendArgs } from '@/lib/agent-engine/guardrails/before-send';
import { tetoDeEnviosComConexao } from '@/lib/agent-engine/guardrails/vagas-do-envio';

/** Pool com teto de verdade e um lock do número exclusivo. */
function poolComTeto(max: number) {
  let emUso = 0;
  let pico = 0;
  const esperandoConexao: Array<() => void> = [];
  let lockOcupado = false;
  const esperandoLock: Array<() => void> = [];

  const tomar = async (): Promise<void> => {
    if (emUso >= max) await new Promise<void>((resolve) => esperandoConexao.push(resolve));
    else emUso += 1;
    pico = Math.max(pico, emUso);
  };
  const devolver = (): void => {
    const proximo = esperandoConexao.shift();
    if (proximo) proximo();
    else emUso -= 1;
  };
  const soltarLock = (): void => {
    const proximo = esperandoLock.shift();
    if (proximo) proximo();
    else lockOcupado = false;
  };

  const pool = {
    options: { max },
    connect: async () => {
      await tomar();
      let comLock = false;
      return {
        query: async (sql: string): Promise<{ rows: unknown[] }> => {
          const s = String(sql).toLowerCase().trim();
          if (s.includes('pg_advisory_xact_lock')) {
            if (lockOcupado) await new Promise<void>((resolve) => esperandoLock.push(resolve));
            else lockOcupado = true;
            comLock = true;
          }
          if ((s === 'commit' || s === 'rollback') && comLock) {
            comLock = false;
            soltarLock();
          }
          return { rows: [] };
        },
        release: devolver,
      };
    },
    // A escrita autônoma: precisa de uma conexão ALÉM da que o envio já segura.
    query: async (): Promise<{ rows: unknown[] }> => {
      await tomar();
      await new Promise((resolve) => setTimeout(resolve, 1));
      devolver();
      return { rows: [{ id: 'trace-1' }] };
    },
  };
  return { pool: pool as unknown as pg.Pool, pico: () => pico };
}

function argsDoTurno(pool: pg.Pool, n: number): RunBeforeSendArgs {
  return {
    pool,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    tenantId: '00000000-0000-4000-8000-000000000001',
    leadId: '00000000-0000-4000-8000-000000000002',
    jobId: '00000000-0000-4000-8000-000000000003',
    // O MESMO número para todos: é a fila do lock que segura as conexões.
    channelSessionId: '00000000-0000-4000-8000-000000000004',
    body: `Olá! Mensagem ${n}.`,
    optedOutThisTurn: false,
    crmDailyLimit: null,
    now: new Date('2026-10-07T17:30:00.000Z'),
    rng: () => 0,
    sleep: async () => {},
    gates: [],
    send: async () => ({ kind: 'sent', idempotencyKey: `k${n}`, messageId: `m${n}` }),
  };
}

describe('o envio não esgota o pool de conexões', () => {
  it('dez envios no mesmo número com pool de dez terminam todos (em produção travavam para sempre)', async () => {
    const { pool, pico } = poolComTeto(10);
    const envios = Array.from({ length: 10 }, (_, n) => runBeforeSend(argsDoTurno(pool, n)));
    const prazo = new Promise<'travou'>((resolve) => setTimeout(() => resolve('travou'), 3000));

    const desfecho = await Promise.race([Promise.all(envios), prazo]);

    expect(desfecho).not.toBe('travou');
    expect((desfecho as Array<{ status: string }>).map((r) => r.status)).toEqual(Array(10).fill('sent'));
    expect(pico()).toBeLessThanOrEqual(10);
  });

  it('mais envios que conexões também terminam: o excedente espera sem conexão na mão', async () => {
    const { pool } = poolComTeto(3);
    const envios = Array.from({ length: 25 }, (_, n) => runBeforeSend(argsDoTurno(pool, n)));
    const prazo = new Promise<'travou'>((resolve) => setTimeout(() => resolve('travou'), 3000));

    const desfecho = await Promise.race([Promise.all(envios), prazo]);

    expect(desfecho).not.toBe('travou');
    expect(desfecho).toHaveLength(25);
  });

  it('o teto deixa sempre conexão de sobra, e nunca zera', () => {
    expect(tetoDeEnviosComConexao(10)).toBe(8);
    expect(tetoDeEnviosComConexao(25)).toBe(23);
    expect(tetoDeEnviosComConexao(2)).toBe(1);
    expect(tetoDeEnviosComConexao(1)).toBe(1);
  });
});
