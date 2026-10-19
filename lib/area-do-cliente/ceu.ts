/**
 * O CÉU DO NASCIMENTO da área do cliente: o Sol e a Lua do dia em que a pessoa nasceu, calculados de verdade
 * (`lib/relatorio/astrologia.ts`, astronomy-engine). Só no servidor: a astronomia é pesada para o celular.
 */
import { dataDeNascimentoValida, mapaDoDia } from "@/lib/relatorio/astrologia";

export interface CeuDoNascimento {
  sol: string;
  /** Sem a hora do nascimento, a Lua pode estar entre dois signos no mesmo dia. */
  lua: string;
  luaCerta: boolean;
  luaOutra: string | null;
}

/** O Sol e a Lua do dia do nascimento. `null` se a data não serve. */
export function ceuDoNascimento(iso: string | null | undefined): CeuDoNascimento | null {
  if (!iso || !dataDeNascimentoValida(iso)) return null;
  const mapa = mapaDoDia(iso);
  const lua = mapa.Lua;
  return {
    sol: mapa.Sol.signo,
    lua: lua.signo,
    luaCerta: lua.signoCerto,
    luaOutra: lua.signoCerto ? null : lua.noComecoDoDia === lua.signo ? lua.noFimDoDia : lua.noComecoDoDia,
  };
}
