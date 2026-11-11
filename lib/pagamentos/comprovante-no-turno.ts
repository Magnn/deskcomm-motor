/**
 * O comprovante que acabou de chegar, no começo do turno. Com certeza, registra pelo mesmo caminho do botão Registrar
 * pagamento: entra no faturamento e vai à plataforma de anúncio. Com dúvida, nada é gravado e a agente chama a equipe.
 *
 * O ID da transação é único: a chave do registro nasce dele, e um ID já visto é recusado, seja de outro contato, seja do
 * próprio lead reaproveitando o comprovante de um atendimento anterior.
 *
 * Nunca lança: falha aqui devolve o turno ao caminho de sempre, que é chamar uma pessoa para conferir.
 */
import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { chavePrincipal } from "@/lib/preco/chave-pix";
import { descricaoDaCobranca, extrasDaConfig, slugDoExtra } from "@/lib/preco/extras";
import type { PricingConfig } from "@/lib/preco/tipos";

import {
  blocoDaConferencia,
  cobrancasEnviadas,
  conferirComprovante, entradasCombinadas,
  ID_DO_PIX,
  produtoCitado,
  textoDaMidia,
  type FalaDaConversa,
} from "./comprovante-pix";
import { depsReaisDoPagamento, registrarPagamentoRecebido, sugestoesDePagamento } from "./pagamento-recebido";
import type { PagamentoRecebido, ResultadoDoPagamento } from "./pagamento-recebido-tipos";

interface Log {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
}

/** O turno pode rodar de novo sobre a mesma imagem: dentro desta janela, o mesmo contato não é reaproveitamento. */
const JANELA_DA_REPETICAO_DO_TURNO_MS = 10 * 60 * 1000;

/** O nome no faturamento do Pix conferido cujo valor não fecha com um produto só. */
export const PRODUTO_DO_VALOR_SOLTO = "Pix pela chave (ver o que liberar)";

/** A chave do registro: `manual-<chave>` no livro de receita, com o índice único por trás. */
export const chaveDoComprovante = (idDoPix: string): string => `comprovante-${idDoPix}`;

export interface UsoDoComprovante {
  contactId: string | null;
  criadoEm: Date;
}

export interface DepsDoComprovante {
  lerUso(idDoPix: string): Promise<UsoDoComprovante | null>;
  registrar(contatoId: string, pagamento: PagamentoRecebido): Promise<ResultadoDoPagamento>;
}

export function depsReaisDoComprovante(admin: SupabaseClient, organizationId: string): DepsDoComprovante {
  return {
    async lerUso(idDoPix) {
      const { data, error } = await admin
        .from("revenue_ledger")
        .select("contact_id, created_at")
        .eq("organization_id", organizationId)
        .eq("provider", "manual")
        .eq("event_type", "charge")
        .eq("external_event_id", `manual-${chaveDoComprovante(idDoPix)}`)
        .maybeSingle();
      if (error) throw new Error(`livro de receita: ${error.message}`);
      const uso = data as { contact_id: string | null; created_at: string } | null;
      return uso ? { contactId: uso.contact_id, criadoEm: new Date(uso.created_at) } : null;
    },
    registrar(contatoId, pagamento) {
      const deps = depsReaisDoPagamento(admin, {
        organizationId,
        requestId: randomUUID(),
        userId: null,
        // Quem fecha é o registro do valor no negócio, pelo fechamento do pagamento aprovado (`compra-cakto.ts`).
        fecharComoGanho: async () => true,
      });
      return registrarPagamentoRecebido(deps, { contatoId, pagamento, agora: new Date(), registradoPor: "conferido pelo comprovante" });
    },
  };
}

/**
 * A mídia mais nova que chegou depois da nossa última fala; sem ela, o comprovante mais novo de uma rodada anterior
 * (mídia com ID de Pix). 11/11/2026: com a IA sem saldo, o turno do comprovante falhou, a equipe respondeu à mão, e o
 * comprovante nunca mais foi conferido — a trava do "caiu" segurou a conversa e as vendas ficaram fora do faturamento.
 */
function midiaDaVez(mensagens: readonly FalaDaConversa[]): { texto: string; daRodada: boolean } {
  let daRodada = true;
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction === "outbound") {
      daRodada = false;
      continue;
    }
    if (m.type !== "image" && m.type !== "document") continue;
    const texto = textoDaMidia(m.body ?? "");
    if (daRodada) return { texto, daRodada };
    if (ID_DO_PIX.test(texto)) return { texto, daRodada };
  }
  return { texto: "", daRodada: true };
}

export async function comprovanteDoTurno(
  deps: DepsDoComprovante,
  e: {
    contactId: string;
    conversationId: string;
    pricing: PricingConfig | null | undefined;
    /** `ai_agents.config` inteira: os produtos de pós-venda e do catálogo saem dela (`sugestoesDePagamento`). */
    config?: unknown;
    mensagens: readonly FalaDaConversa[];
    /** A entrada que o turno acabou de ler da pessoa (`entradaImediata`): ela pode pagar antes de a agente cobrar. */
    entradaDoTurnoCents?: number | null;
    /** Chamado quando este comprovante está registrado (agora ou pela mesma imagem há pouco): o turno não cobra de novo. */
    aoConfirmar?: () => void;
    /** Chamado quando o comprovante ficou em dúvida: o envio recusa dizer que caiu (`confirmaPagamentoEmDuvida`). */
    aoDuvidar?: () => void;
    agora: Date;
    log: Log;
  },
): Promise<string> {
  const chave = chavePrincipal(e.pricing);
  if (!chave || !e.pricing) return "";
  try {
    const valoresDoPrincipal = [e.pricing.list_price_cents, ...(e.pricing.steps ?? []).map((s) => s.price_cents)];
    const midia = midiaDaVez(e.mensagens);
    let conferencia = conferirComprovante({
      texto: midia.texto,
      chave,
      cobrancas: cobrancasEnviadas(e.mensagens),
      extras: extrasDaConfig(e.pricing),
      valoresDoPrincipal,
      entradas: [...entradasCombinadas(e.mensagens), ...(e.entradaDoTurnoCents ? [e.entradaDoTurnoCents] : [])],
      outrosProdutos: sugestoesDePagamento([e.config ?? { pricing: e.pricing }]).filter((s) => s.extra === undefined && !valoresDoPrincipal.includes(s.valor_cents)),
      agora: e.agora,
    });
    if (conferencia.tipo === "nenhum") return "";
    // Comprovante de rodada anterior: só a confirmação muda o turno. Já registrado ou em dúvida, a rodada dele já
    // respondeu (e a trava `comprovanteSemRegistro` segura o "caiu"); acusar de novo a cada mensagem não.
    if (!midia.daRodada && conferencia.tipo === "nao_confere") return "";
    if (conferencia.tipo !== "nao_confere") {
      const uso = await deps.lerUso(conferencia.idDoPix);
      if (uso !== null && !midia.daRodada) {
        if (uso.contactId === e.contactId) e.aoConfirmar?.();
        return "";
      }
      if (uso !== null) {
        const repeticaoDoTurno = uso.contactId === e.contactId && e.agora.getTime() - uso.criadoEm.getTime() < JANELA_DA_REPETICAO_DO_TURNO_MS;
        if (repeticaoDoTurno) {
          e.aoConfirmar?.();
          return "";
        }
        conferencia = {
          tipo: "nao_confere",
          motivo: uso.contactId === e.contactId ? "este comprovante já foi usado num atendimento anterior desta pessoa" : "este comprovante já foi usado por outro contato",
        };
      }
    }
    e.log.info("comprovante conferido", {
      conversation_id: e.conversationId,
      ...(midia.daRodada ? {} : { de_rodada_anterior: true }),
      resultado: conferencia.tipo,
      ...(conferencia.tipo === "nao_confere" ? { motivo: conferencia.motivo } : { valor_cents: conferencia.valorCents }),
    });
    if (conferencia.tipo === "nao_confere") {
      e.aoDuvidar?.();
      return blocoDaConferencia(conferencia, chave);
    }
    e.aoConfirmar?.();

    const base = {
      chave: chaveDoComprovante(conferencia.idDoPix),
      valor_cents: conferencia.valorCents,
      metodo: "pix" as const,
      pago_em: conferencia.pagoEm.toISOString(),
      // Valor parecido no mesmo dia é outra compra: o ID da transação já provou que é outro pagamento.
      confirmar_repetido: true,
    };
    if (conferencia.tipo === "confere_extra") {
      await deps.registrar(e.contactId, {
        ...base,
        produto: descricaoDaCobranca(conferencia.extra, conferencia.quantidade),
        iniciar_entrega: false,
        extra: slugDoExtra(conferencia.extra.name),
        ...(conferencia.quantidade > 1 ? { quantidade: conferencia.quantidade } : {}),
      } as PagamentoRecebido);
      return "";
    }
    if (conferencia.tipo === "confere_valor") {
      // O dinheiro entra no faturamento; o que liberar fica com a equipe.
      await deps.registrar(e.contactId, { ...base, produto: PRODUTO_DO_VALOR_SOLTO, iniciar_entrega: false } as PagamentoRecebido);
      return blocoDaConferencia(conferencia, chave);
    }
    if (conferencia.tipo === "confere_produto") {
      await deps.registrar(e.contactId, { ...base, produto: conferencia.produto, iniciar_entrega: false } as PagamentoRecebido);
      return blocoDaConferencia(conferencia, chave, { produto: conferencia.produto, entregaSozinha: false });
    }
    const produto = produtoCitado(e.mensagens, (e.pricing.list_product_links ?? []).map((l) => l.name)) ?? "Trabalho espiritual";
    const r = await deps.registrar(e.contactId, { ...base, produto, iniciar_entrega: true } as PagamentoRecebido);
    return blocoDaConferencia(conferencia, chave, { produto, entregaSozinha: r.resultado === "registrado" && r.entrega === "iniciada" });
  } catch (err) {
    e.log.warn("não consegui conferir o comprovante — segue pela equipe", {
      conversation_id: e.conversationId,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
    });
    return "";
  }
}
