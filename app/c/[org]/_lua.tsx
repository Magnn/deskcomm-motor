/**
 * A lua desenhada como ela está no céu hoje: a parte iluminada sai da idade da
 * lua (`lib/area-do-cliente/lua.ts`), não de um emoji de quatro fases.
 *
 * Geometria: o disco tem a borda iluminada como meia-circunferência (direita na
 * crescente, esquerda na minguante) e o terminador como meia-elipse de raio
 * horizontal `r·|cos(2π·fração)|` — encolhe até zero no quarto e cresce de novo
 * do outro lado.
 */
import { MES_SINODICO_DIAS, idadeDaLua } from "@/lib/area-do-cliente/lua";

export function caminhoDaParteIluminada(fracao: number, r: number): string {
  const k = Math.cos(2 * Math.PI * fracao);
  const rx = Math.abs(k) * r;
  const crescendo = fracao < 0.5;
  const fino = k > 0; // menos da metade iluminada
  if (crescendo) {
    return `M ${r} 0 A ${r} ${r} 0 0 1 ${r} ${2 * r} A ${rx} ${r} 0 0 ${fino ? 0 : 1} ${r} 0 Z`;
  }
  return `M ${r} 0 A ${r} ${r} 0 0 0 ${r} ${2 * r} A ${rx} ${r} 0 0 ${fino ? 1 : 0} ${r} 0 Z`;
}

export function LuaDeHoje({ quando, tamanho = 56 }: { quando: Date; tamanho?: number }) {
  const r = 50;
  const fracao = idadeDaLua(quando) / MES_SINODICO_DIAS;
  return (
    <svg viewBox="-6 -6 112 112" width={tamanho} height={tamanho} aria-hidden className="shrink-0 drop-shadow-[0_0_14px_rgba(240,214,150,0.35)]">
      <defs>
        <radialGradient id="lua-luz" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fbf3dc" />
          <stop offset="100%" stopColor="#e6cf93" />
        </radialGradient>
      </defs>
      <circle cx={r} cy={r} r={r} fill="#2b2148" stroke="rgba(240,214,150,0.35)" strokeWidth="1.5" />
      <path d={caminhoDaParteIluminada(fracao, r)} fill="url(#lua-luz)" />
    </svg>
  );
}
