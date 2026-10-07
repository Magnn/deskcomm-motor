/**
 * VAGAS DO ENVIO — quantos envios podem segurar conexão do pool ao mesmo tempo.
 *
 * O envio (`runBeforeSend`) toma UMA conexão, abre transação e espera o lock do número. Quem tem a vez
 * precisa de uma SEGUNDA conexão, do mesmo pool, para as escritas que têm de sobreviver ao rollback (o
 * trace, a atividade de veto) e para o que o `send` grava. Com tantos envios simultâneos quanto conexões,
 * todas ficam na mão de quem espera o lock, a segunda nunca chega e o worker para inteiro, sem erro e sem
 * prazo — até o healthcheck, que usa o mesmo pool, deixa de responder (medido em produção em 07/10/2026:
 * fila de 10 com pool de 10, worker mudo menos de um minuto depois de subir).
 *
 * A trava deixa de depender de configuração: no máximo `max − RESERVA` envios seguram conexão; os outros
 * esperam AQUI, sem conexão na mão. Sobra sempre conexão para quem tem a vez terminar e soltar o lock.
 */
import type pg from 'pg';

/** Conexões que nunca ficam com quem espera o lock do número. */
const RESERVA = 2;

class Vagas {
  private livres: number;
  private readonly fila: Array<() => void> = [];

  constructor(total: number) {
    this.livres = total;
  }

  async entrar(): Promise<void> {
    if (this.livres > 0) {
      this.livres -= 1;
      return;
    }
    await new Promise<void>((resolve) => this.fila.push(resolve));
  }

  sair(): void {
    const proximo = this.fila.shift();
    // A vaga passa direto para o próximo da fila: `livres` não sobe e ninguém fura.
    if (proximo) proximo();
    else this.livres += 1;
  }
}

const vagasPorPool = new WeakMap<object, Vagas>();

/** O teto de envios com conexão na mão para um pool de `max` conexões. Pura. */
export function tetoDeEnviosComConexao(max: number): number {
  return Math.max(1, max - RESERVA);
}

/**
 * Roda `fn` com uma vaga de envio. Pool sem `options.max` (dublê de teste) roda direto: o pool real do
 * `pg` sempre tem o campo preenchido.
 */
export async function comVagaDeEnvio<T>(pool: pg.Pool, fn: () => Promise<T>): Promise<T> {
  const max = (pool as { options?: { max?: unknown } }).options?.max;
  if (typeof max !== 'number' || !Number.isInteger(max) || max <= 0) return fn();
  let vagas = vagasPorPool.get(pool);
  if (!vagas) {
    vagas = new Vagas(tetoDeEnviosComConexao(max));
    vagasPorPool.set(pool, vagas);
  }
  await vagas.entrar();
  try {
    return await fn();
  } finally {
    vagas.sair();
  }
}
