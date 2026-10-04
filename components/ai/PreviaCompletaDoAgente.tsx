"use client";
/**
 * O prompt COMPLETO que o agente recebe — a soma das instruções base com os blocos que as abas
 * estruturadas (Identidade, Oferta, Consciência, Objeções, Limites) compilam, na MESMA ordem e com
 * as MESMAS funções puras que o turno usa (`comporSystemDoTurno`, `blocos-do-turno.ts`). Sem mágica,
 * como o `PreviaDoBloco` de cada aba: o que está escrito aqui é o que o agente lê.
 *
 * Blocos que só existem DURANTE um atendimento real (anúncio, estilo, o objetivo de um fluxo,
 * leitura, preço, entrega) entram como '' aqui de propósito — eles dependem da conversa, e uma
 * prévia estática não tem conversa nenhuma para descrever. O aviso na tela diz isso, para o dono
 * não estranhar quando o prompt real de um atendimento for maior que esta prévia.
 *
 * Identidade/Oferta/Consciência/Objeções/Limites vêm de `agent.config`, que é lido pela mesma
 * versão SALVA nas abas correspondentes — não do que está sendo digitado lá agora, se a aba ainda
 * não foi salva.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Eye } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { TokenCounter } from "@/lib/ui/TokenCounter";

import { lerIdentidade } from "@/lib/identidade/tipos";
import { lerOferta } from "@/lib/oferta/tipos";
import { lerConsciencia } from "@/lib/consciencia/tipos";
import { lerObjecoes } from "@/lib/objecoes/tipos";
import { lerLimites } from "@/lib/limites/tipos";
import { lerJornada } from "@/lib/jornada/tipos";
import { estadoDaJornada } from "@/lib/jornada/estado";
import { blocoDaJornada } from "@/lib/jornada/bloco-do-prompt";
import { blocoDeIdentidade } from "@/lib/identidade/bloco-do-prompt";
import { blocoDeOferta } from "@/lib/oferta/bloco-do-prompt";
import { blocoDeConsciencia } from "@/lib/consciencia/bloco-do-prompt";
import { blocoDeObjecoes } from "@/lib/objecoes/bloco-do-prompt";
import { blocoDeLimites } from "@/lib/limites/bloco-do-prompt";
import { comporSystemDoTurno } from "@/lib/agent-engine/agent/blocos-do-turno";

interface ToolMetaMinima {
  id: string;
  rotulo: string;
}

interface ApiResponse {
  data: { tools: Array<{ id: string; rotulo: string }> };
}

interface Props {
  systemPrompt: string;
  /** `agent.config` cru — cada bloco lê a própria fatia de forma defensiva (`ler*`). */
  config: Record<string, unknown> | null | undefined;
  toolIds: string[];
  contextWindow?: number | null;
}

export function PreviaCompletaDoAgente({ systemPrompt, config, toolIds, contextWindow }: Props) {
  const t = useT();

  // Mesma queryKey do ToolPicker: react-query devolve do cache, sem 2ª chamada de rede.
  const query = useQuery({
    queryKey: ["mcp", "tools"],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse>("/api/v1/mcp/tools");
      return res.data.tools as ToolMetaMinima[];
    },
    staleTime: 60_000,
  });
  const rotuloPorId = React.useMemo(
    () => new Map((query.data ?? []).map((tool) => [tool.id, tool.rotulo])),
    [query.data],
  );

  const promptCompleto = React.useMemo(() => {
    const identidade = blocoDeIdentidade(lerIdentidade(config ?? null));
    const oferta = blocoDeOferta(lerOferta(config ?? null));
    const consciencia = blocoDeConsciencia(lerConsciencia(config ?? null));
    const objecoes = blocoDeObjecoes(lerObjecoes(config ?? null));
    const limites = blocoDeLimites(lerLimites(config ?? null));
    // A jornada depende da conversa, mas o COMEÇO dela não: sem mensagem nenhuma, é a etapa 1 — o que o
    // agente lê no primeiro atendimento.
    const jornadaSalva = lerJornada(config ?? null);
    const jornada = blocoDaJornada(jornadaSalva, jornadaSalva ? estadoDaJornada(jornadaSalva, []) : null);
    return comporSystemDoTurno(systemPrompt, {
      identidade,
      oferta,
      consciencia,
      objecoes,
      // Só existem dentro de um atendimento real — ver o cabeçalho do arquivo.
      anuncio: "",
      estilo: "",
      fluxo: "",
      jornada,
      leitura: "",
      preco: "",
      entrega: "",
      limites,
    });
  }, [systemPrompt, config]);

  return (
    <Card className="space-y-3 p-4" data-testid="previa-completa-do-agente">
      <div className="flex items-center gap-2">
        <Eye size={16} aria-hidden className="text-muted-foreground" />
        <h3 className="text-sm font-medium">{t("O prompt completo que o agente recebe")}</h3>
        <TokenCounter text={promptCompleto} contextWindow={contextWindow ?? null} className="ml-auto text-xs" />
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "É a soma das instruções acima com o que as abas Identidade, Oferta, Consciência, Objeções e Limites têm SALVO agora, na mesma ordem que o motor monta em cada atendimento. Blocos que só existem durante uma conversa real — leitura, preço, entrega, estilo, o objetivo de um fluxo — não entram aqui.",
        )}
      </p>
      <pre
        data-testid="previa-completa-texto"
        className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs leading-relaxed"
      >
        {promptCompleto}
      </pre>
      <div className="space-y-1">
        <h4 className="text-xs font-medium text-muted-foreground">{t("O que ele pode fazer")}</h4>
        {toolIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("Nenhuma capacidade ligada.")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5" data-testid="previa-completa-capacidades">
            {toolIds.map((id) => (
              <li
                key={id}
                className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {rotuloPorId.get(id) ?? id}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
