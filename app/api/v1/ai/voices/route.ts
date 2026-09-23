/**
 * GET /api/v1/ai/voices — as vozes que a agente pode usar (manager+).
 *
 * Devolve, por provedor de voz, se a organização já tem chave e, quando tem, as
 * vozes disponíveis (a OpenAI tem um catálogo fixo; a ElevenLabs lista as da
 * conta, inclusive as clonadas). Um provedor que falha NÃO derruba a resposta:
 * ele volta com `erro` e os outros seguem — a tela mostra o motivo no cartão dele.
 *
 * Filtros opcionais: `?genero=feminina|masculina|neutra` e `?provedor=…`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { explicarErroDeVoz } from "@/lib/voz/erros";
import { implementacaoDeVoz } from "@/lib/voz/provedores";
import {
  PROVEDORES_DE_VOZ,
  type GeneroDaVoz,
  type IdDeProvedorDeVoz,
  type VozDisponivel,
} from "@/lib/voz/tipos";

export const dynamic = "force-dynamic";

const GENEROS: readonly GeneroDaVoz[] = ["feminina", "masculina", "neutra"];

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "ai_voices" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const params = req.nextUrl.searchParams;
  const generoPedido = params.get("genero");
  const genero = GENEROS.find((g) => g === generoPedido);
  const provedorPedido = params.get("provedor");

  const provedores = PROVEDORES_DE_VOZ.filter((p) => provedorPedido === null || p.id === provedorPedido);

  const resultados = await Promise.all(
    provedores.map(async (p) => {
      const chave = await resolverChaveDeVoz(org.orgId, p.id as IdDeProvedorDeVoz);
      const base = {
        id: p.id,
        rotulo: p.rotulo,
        quandoUsar: p.quandoUsar,
        clona: p.clona,
        ondePegarAChave: p.ondePegarAChave,
        prefixoDaChave: p.prefixoDaChave,
        configurado: chave !== null,
      };
      if (chave === null) return { provedor: base, vozes: [] as VozDisponivel[] };
      try {
        const vozes = await implementacaoDeVoz(p.id).listarVozes(chave);
        return { provedor: base, vozes };
      } catch (err) {
        return { provedor: { ...base, erro: explicarErroDeVoz(err) }, vozes: [] as VozDisponivel[] };
      }
    }),
  );

  const vozes = resultados
    .flatMap((r) => r.vozes)
    .filter((v) => genero === undefined || v.genero === genero);

  return ok(
    { provedores: resultados.map((r) => r.provedor), vozes },
    { requestId },
  );
}
