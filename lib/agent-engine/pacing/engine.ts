/**
 * Motor de pacing anti-ban (F2-11) — decisão PURA: dado (relógio, knobs, estado
 * de envios do número, limite diário do CRM, rng) devolve {allow, waitMs} ou
 * {veto, nextAllowedAt, reason pt-br instrutivo}. Roda ANTES de chamar o CRM
 * (regra dura nº 3); a integração na cadeia de envio é da F2-13 — aqui não há
 * I/O nenhum. Clock e RNG são injetáveis (testes com clock fake e jitter
 * determinístico); em produção o chamador passa `new Date()` e omite o rng.
 *
 * Ordem de avaliação: janela horária (tz do tenant, domingo conforme `allowSunday`) → caps
 * diários (warm-up por idade do número, contra os envios INICIADOS; limite do CRM injetado,
 * contra todos) → teto por hora (todos os envios) → throttle+jitter.
 */
import type { PacingKnobs, WarmupStep } from './defaults';

export interface PacingState {
  /** Último envio deste número (qualquer dia) — base do throttle. */
  lastSentAt: Date | null;
  /** Envios deste número desde a meia-noite LOCAL do tenant (todos os tipos) — base do teto do CRM. */
  sentToday: number;
  /**
   * Envios INICIADOS por nós desde a meia-noite local (`pacing_ledger.tipo = iniciada`) —
   * base do teto de aquecimento. Ausente = `sentToday` (o leitor antigo, que não separa).
   */
  initiatedToday?: number;
  /** Envios (todos os tipos) nos últimos 60 minutos — base do teto por hora. Ausente = 0. */
  sentLastHour?: number;
  /** O envio mais antigo dentre os da última hora: quando ele sair da janela, abre vaga. */
  oldestInLastHourAt?: Date | null;
  /** Ativação do número (channel_knobs.number_activated_at); null = idade 0 (conservador). */
  numberActivatedAt: Date | null;
}

export interface PacingInput {
  now: Date;
  knobs: PacingKnobs;
  state: PacingState;
  /**
   * channel_sessions.daily_message_limit (fonte única do cap diário absoluto) —
   * mesmo banco agora: o chamador lê por query direta, não por edge HTTP.
   * null = sem limite conhecido. O Deskcomm também tem channel_sessions
   * warmup_started_at/warmup_completed_at/is_warmup_complete, mas o warm-up DESTE
   * motor é o cálculo próprio por idade (channel_knobs.number_activated_at +
   * degraus) — não os campos do CRM.
   */
  crmDailyLimit: number | null;
  /**
   * O canal tem risco de BANIMENTO por volume/padrão? (capability do provider).
   * `false` desarma SÓ o que é anti-ban (warm-up, cap diário, throttle+jitter);
   * janela horária/domingo/fuso são CORTESIA e continuam valendo em todo canal
   * (doutrina `docs/doctrine/restricao-de-canal.md`, invariante 3).
   * Omitir = `true`: nenhum chamador existente muda de comportamento.
   */
  banRisk?: boolean;
  /**
   * `false` desarma SÓ os tetos de volume do dia (aquecimento e limite diário).
   * Janela horária e intervalo entre envios continuam valendo. Quem desarma é o
   * envio de FLUXO: lá o volume é decisão do dono do número (ele controla quantos
   * leads entram), e um teto do sistema deixava lead de anúncio sem resposta.
   * Omitir = `true`: nenhum chamador existente muda de comportamento.
   */
  enforceDailyCaps?: boolean;
  /**
   * `false` desarma SÓ o teto por hora NESTA decisão. Quem desarma é o turno de entrada,
   * que já fez a mesma pergunta no COMEÇO do turno (`proximaVagaNaHora`) e adiou o turno
   * inteiro se preciso: vetar a segunda bolha de uma resposta já começada cortaria a
   * resposta no meio. Omitir = armado.
   */
  enforceHourlyCap?: boolean;
  /** [0,1) — injetável nos testes; default Math.random. */
  rng?: () => number;
}

export type PacingVetoCode = 'outside_window' | 'warmup_cap' | 'daily_cap' | 'hourly_cap';

export type PacingDecision =
  | { allow: true; waitMs: number }
  | { allow: false; code: PacingVetoCode; nextAllowedAt: Date; reason: string };

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export function decidePacing(input: PacingInput): PacingDecision {
  const { now, knobs, state, crmDailyLimit } = input;
  const rng = input.rng ?? Math.random;
  const banRisk = input.banRisk ?? true; // default preserva o comportamento atual
  const wall = wallClock(now, knobs.timezone);

  if (!insideWindow(wall, knobs)) {
    const nextAllowedAt = addMs(nextWindowOpen(now, knobs), jitterOf(rng, knobs));
    return {
      allow: false,
      code: 'outside_window',
      nextAllowedAt,
      reason:
        `fora da janela de envio (${knobs.windowStartHour}h-${knobs.windowEndHour}h` +
        `${knobs.allowSunday ? '' : ', sem domingo'}, ${knobs.timezone}); ` +
        `agende para ${formatInTz(nextAllowedAt, knobs.timezone)} (abertura da janela + jitter)`,
    };
  }

  // Daqui para baixo tudo é ANTI-BAN (warm-up, cap diário, teto por hora, throttle+jitter): só
  // arma onde há risco de banimento. A janela horária acima é CORTESIA e roda
  // SEMPRE — desarmar as duas juntas acordaria cliente às 3h (invariante 3).
  if (!banRisk) return { allow: true, waitMs: 0 };

  // Clamp em >= 0: number_activated_at no futuro (typo do admin / clock skew
  // daemon↔DB) cai no degrau MAIS conservador — warm-up falha FECHADO, nunca
  // vira "número formado" por idade negativa.
  const ageDays = state.numberActivatedAt
    ? Math.max(0, Math.floor((now.getTime() - state.numberActivatedAt.getTime()) / DAY_MS))
    : 0;
  const wCap = warmupCapFor(ageDays, knobs.warmupDailyCaps);
  // Os dois tetos do dia contam coisas DIFERENTES (migration 0963): o aquecimento é contra
  // disparo e conta só o que NÓS iniciamos; o limite do CRM é o teto absoluto e conta tudo.
  const iniciadosHoje = state.initiatedToday ?? state.sentToday;
  const estourouAquecimento = wCap !== null && iniciadosHoje >= wCap;
  const estourouCrm = crmDailyLimit !== null && state.sentToday >= crmDailyLimit;
  if (input.enforceDailyCaps !== false && (estourouAquecimento || estourouCrm)) {
    const nextAllowedAt = addMs(nextDayOpen(now, knobs), jitterOf(rng, knobs));
    // Os dois estouraram: o rótulo é do MENOR teto, como sempre foi — é ele que o operador mexe.
    const porAquecimento =
      estourouAquecimento && (!estourouCrm || (wCap as number) < (crmDailyLimit as number));
    return {
      allow: false,
      code: porAquecimento ? 'warmup_cap' : 'daily_cap',
      nextAllowedAt,
      reason: porAquecimento
        ? `cap de warm-up atingido (${wCap} envios iniciados/dia para número com ${ageDays} dia(s) de idade); ` +
          `agende para ${formatInTz(nextAllowedAt, knobs.timezone)} (próxima abertura + jitter)`
        : `cap diário do número atingido (${crmDailyLimit}/dia, limite do CRM); ` +
          `agende para ${formatInTz(nextAllowedAt, knobs.timezone)} (próxima abertura + jitter)`,
    };
  }

  const vagaPorHora = proximaVagaNaHora(now, knobs, state, rng);
  if (vagaPorHora !== null && input.enforceHourlyCap !== false) {
    return {
      allow: false,
      code: 'hourly_cap',
      nextAllowedAt: vagaPorHora,
      reason:
        `teto por hora do número atingido (${knobs.maxPerHour} envios na última hora); ` +
        `agende para ${formatInTz(vagaPorHora, knobs.timezone)} (quando abre vaga + jitter)`,
    };
  }

  let waitMs = 0;
  if (state.lastSentAt) {
    const requiredGapMs = knobs.throttleMs + jitterOf(rng, knobs);
    waitMs = Math.max(0, requiredGapMs - (now.getTime() - state.lastSentAt.getTime()));
  }
  return { allow: true, waitMs };
}

/**
 * Degrau vigente para a idade (degraus ordenados por minAgeDays crescente).
 * Falha FECHADO: idade aquém do primeiro degrau usa o cap do PRIMEIRO degrau
 * (o mais conservador) — configuração com furo nunca vira "sem cap".
 *
 * Exportada para a TELA poder dizer ao operador qual é o teto de hoje. A regra
 * tem de ser esta mesma função: uma segunda cópia na UI é a receita para a tela
 * prometer um número e o motor aplicar outro.
 */
export function warmupCapFor(ageDays: number, steps: WarmupStep[]): number | null {
  let cap: number | null = steps[0]?.cap ?? null;
  for (const step of steps) {
    if (ageDays >= step.minAgeDays) cap = step.cap;
  }
  return cap;
}

/**
 * O teto por hora está cheio? Devolve QUANDO abre a próxima vaga (o envio mais antigo da
 * última hora completa 60 minutos, mais o jitter), ou `null` se dá para enviar agora.
 *
 * Exportada porque o turno de entrada faz esta pergunta ANTES de chamar o modelo: uma
 * resposta ou sai inteira, ou espera inteira. É a mesma regra do gate — nunca uma cópia.
 * Sem teto configurado (`maxPerHour: null`) é sempre `null`.
 */
export function proximaVagaNaHora(
  now: Date,
  knobs: Pick<PacingKnobs, 'maxPerHour' | 'jitterMaxMs'>,
  state: Pick<PacingState, 'sentLastHour' | 'oldestInLastHourAt'>,
  rng: () => number = Math.random,
): Date | null {
  if (knobs.maxPerHour === null) return null;
  if ((state.sentLastHour ?? 0) < knobs.maxPerHour) return null;
  // Sem o instante do mais antigo (leitor que não o traz), a espera honesta é a hora inteira.
  const base = state.oldestInLastHourAt ?? now;
  const libera = Math.max(base.getTime() + HOUR_MS, now.getTime() + 1_000);
  return addMs(new Date(libera), jitterOf(rng, knobs));
}

function jitterOf(rng: () => number, knobs: Pick<PacingKnobs, 'jitterMaxMs'>): number {
  return Math.floor(rng() * (knobs.jitterMaxMs + 1));
}

function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}

// ---------------------------------------------------------------------------
// Relógio de parede na tz do tenant — Intl puro, sem dependência nova.

interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  weekday: string; // 'Sun'..'Sat'
}

function wallClock(instant: Date, timezone: string): Wall {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24, // algumas ICU rendem '24' à meia-noite
    mi: Number(get('minute')),
    s: Number(get('second')),
    weekday: get('weekday'),
  };
}

/**
 * Instante UTC cuja hora de parede na tz é (y, mo, d, h):00 — técnica clássica
 * de duas passadas pelo offset (correta inclusive sob DST).
 */
function instantFromWall(y: number, mo: number, d: number, h: number, timezone: string): Date {
  const targetAsUtc = Date.UTC(y, mo - 1, d, h);
  let guess = targetAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const w = wallClock(new Date(guess), timezone);
    const guessAsUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
    guess += targetAsUtc - guessAsUtc;
  }
  return new Date(guess);
}

/** Meia-noite LOCAL do tenant contendo `instant` — o corte do "hoje" dos caps diários. */
export function dayStartInTz(instant: Date, timezone: string): Date {
  const w = wallClock(instant, timezone);
  return instantFromWall(w.y, w.mo, w.d, 0, timezone);
}

/**
 * A janela horária está aberta agora? Exportada para quem precisa da pergunta
 * ANTES de ter uma mensagem para enviar — hoje o turno inbound, que adia o job
 * inteiro em vez de gastar uma chamada de modelo cujo texto o gate vetaria na
 * saída (ver `inbound-turn.ts`). O gate de envio continua sendo o que decide de
 * verdade: isto é só o atalho barato, sem tocar em caps nem em throttle.
 */
export function janelaDeEnvioAberta(now: Date, knobs: PacingKnobs): boolean {
  return insideWindow(wallClock(now, knobs.timezone), knobs);
}

/** Próxima abertura da janela + jitter — o instante para o qual se adia. */
export function proximaAberturaDaJanela(
  now: Date,
  knobs: PacingKnobs,
  rng: () => number = Math.random,
): Date {
  return addMs(nextWindowOpen(now, knobs), jitterOf(rng, knobs));
}

function insideWindow(wall: Wall, knobs: PacingKnobs): boolean {
  if (!knobs.allowSunday && wall.weekday === 'Sun') return false;
  return wall.h >= knobs.windowStartHour && wall.h < knobs.windowEndHour;
}

/** Próxima abertura de janela ESTRITAMENTE depois de `now` (pula domingo se evitado). */
function nextWindowOpen(now: Date, knobs: PacingKnobs): Date {
  const w = wallClock(now, knobs.timezone);
  for (let add = 0; ; add += 1) {
    // Date.UTC normaliza overflow de dia/mês em instantFromWall.
    const candidate = instantFromWall(w.y, w.mo, w.d + add, knobs.windowStartHour, knobs.timezone);
    if (candidate.getTime() <= now.getTime()) continue;
    if (!knobs.allowSunday && wallClock(candidate, knobs.timezone).weekday === 'Sun') continue;
    return candidate;
  }
}

/** Abertura do PRÓXIMO dia permitido (cap diário reseta na meia-noite local). */
function nextDayOpen(now: Date, knobs: PacingKnobs): Date {
  const w = wallClock(now, knobs.timezone);
  for (let add = 1; ; add += 1) {
    const candidate = instantFromWall(w.y, w.mo, w.d + add, knobs.windowStartHour, knobs.timezone);
    if (!knobs.allowSunday && wallClock(candidate, knobs.timezone).weekday === 'Sun') continue;
    return candidate;
  }
}

/** Render local legível para a mensagem de veto (pt-br vê hora do SEU fuso). */
function formatInTz(instant: Date, timezone: string): string {
  // sv-SE rende 'YYYY-MM-DD HH:mm:ss' — ISO-like, sem dependência.
  return `${new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(instant)} (${timezone})`;
}
