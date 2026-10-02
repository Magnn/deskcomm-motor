/**
 * OS EFEITOS QUE TRANSFORMAM UMA MENSAGEM EM TRABALHO.
 *
 * ─── Por que este arquivo existe ────────────────────────────────────────────
 *
 * Gravar a mensagem é só metade da ingestão. A outra metade é o que o CRM FAZ
 * com ela: respeitar quem pediu para sair, abrir a demanda no funil e acordar o
 * agente. Esses três efeitos moravam dentro de `lib/waha/ingest.ts`, e por isso
 * só aconteciam no canal por QR — medido em produção:
 *
 *   ai_agent.dispatch_requested   QR 806   oficial 0
 *   leads a partir da conversa    QR  19   oficial 1  (em 28 conversas)
 *   contatos bloqueados por STOP           0 em 101
 *
 * A pessoa que escrevia para o número oficial entrava no CRM e parava ali. Sem
 * erro, sem log, sem aviso — que é o pior modo de falhar, porque ninguém
 * procura o que não reclama.
 *
 * ─── A ORDEM é a regra, não um detalhe de implementação ─────────────────────
 *
 * Os três rodam em sequência e a sequência carrega significado:
 *
 *   1. opt-out  — grava `is_blocked` ANTES do lead;
 *   2. lead     — `garantirLeadDaConversa` RELÊ o contato e recusa criar card
 *                 para bloqueado. Inverter 1 e 2 faz quem acabou de pedir para
 *                 sair virar oportunidade nova no funil;
 *   3. despacho — o turno do agente resolve o lead ativo do contato. Emitir
 *                 antes do passo 2 faria o primeiro turno rodar sem lead.
 *
 * Trocar a ordem não quebra teste de tipo nem derruba nada em runtime: quebra
 * em silêncio, semanas depois, num card que não devia existir. Por isso está
 * escrito aqui e vigiado por `tests/unit/pos-entrada-*.test.ts`.
 *
 * ─── Nada aqui pode derrubar a ingestão ─────────────────────────────────────
 *
 * A mensagem do cliente JÁ está gravada quando esta função roda. Uma exceção
 * que suba daqui viraria 500 para o provider, e ele reenviaria tudo — trocaria
 * um efeito faltando por uma tempestade de reentregas. Cada passo falha para
 * dentro, com log, e o seguinte roda mesmo assim.
 */
import { assinaturaCaiu } from "@/lib/planos/assinatura-da-organizacao";
import { audit } from "@/lib/audit";
import { garantirLeadDaConversa } from "@/lib/leads/nascimento-do-lead";
import {
  ehAPrimeiraMensagemDoContato,
  estamparOrigemDaPagina,
  extrairOrigemDaPagina,
} from "@/lib/leads/origem-do-site";
import { logger } from "@/lib/logger";
import { PADRAO_DO_REF } from "@/lib/plataformas-de-anuncio/captura-de-clique";
import { casarClickRef } from "@/lib/plataformas-de-anuncio/meta/captura-de-clique";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ehPedidoDeOptOut } from "@/lib/opt-out/deteccao";
import { ehContatoDoNumeroInterno } from "@/lib/escalacao/numero-interno-de-aviso";
import { acelerarFluxoDoContato, acelerarPipelineDeEventos } from "@/lib/dev/kick-local-pipeline";
import { autorizarContatoParaIA } from "@/lib/ai/elegibilidade/autorizacao";
import { casarCampanha, lerCampanhas } from "@/lib/ai/elegibilidade/campanha";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { configDoInicio, eventoWhatsappDoInicio, mensagemAbreOFluxo } from "@/lib/followup/gatilho-do-inicio";
import { flowGraphSchema, type TriggerNodeConfig } from "@/lib/followup/graph-schema";
import { lerConfigDeFluxoDoCanal, quemAtendeONumero, type QuemAtende } from "@/lib/channels/channel-flow-config";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Quem pediu para sair, sai — mas quem só usou a palavra, não.
 *
 * A regra mora em `lib/opt-out/deteccao.ts`, e não aqui, porque o vocabulário do
 * opt-out é regra de negócio (e de LGPD) do produto inteiro — não característica
 * de um transporte. Uma cópia por canal diverge na primeira vez que alguém
 * acrescentar um termo, e foi exatamente o que aconteceu: o runtime tinha um
 * detector calibrado enquanto ESTE caminho, o que grava o bloqueio, usava uma
 * regex de palavra solta.
 *
 * ─── A história deste ponto, em duas correções ──────────────────────────────
 *
 * A primeira versão usava `\b`, que em JavaScript é ASCII: "amanhã ele sairá" e
 * "pararão as obras" bloqueavam o contato, porque a letra acentuada vira
 * fronteira. Trocou-se por lookarounds Unicode e a colagem parou de casar.
 *
 * Mas o falso positivo continuou, porque o alvo estava errado: a regex caçava a
 * PALAVRA em qualquer posição da frase. Medido numa clínica em produção,
 * "tem como parar a dor?" e "posso sair antes das 15h?" bloqueavam o paciente na
 * ingestão — e todo envio seguinte voltava `contato_bloqueado`. Ele sumia sem
 * ninguém saber. O mesmo erro escondia o outro lado: "não quero mais receber",
 * que é opt-out inequívoco, passava batido.
 *
 * O que vale agora é a INTENÇÃO — verbo de cessação com objeto de comunicação,
 * ou a palavra sozinha. O falso positivo continua sendo o pior dos dois erros
 * possíveis aqui: quem pede para sair e não é atendido reclama de novo; quem é
 * bloqueado sem pedir simplesmente some.
 */

export interface EntradaDeMensagem {
  organizationId: string;
  contactId: string;
  conversationId: string;
  /**
   * `null` quando a linha não nasceu agora (reentrega).
   *
   * Sem id não há o que despachar: o agente precisa da mensagem que disparou o
   * turno, e inventar um id faria o worker buscar uma linha inexistente.
   */
  messageId: string | null;
  channelSessionId: string;
  /** O texto que o cliente escreveu — é onde se procura o pedido de saída. */
  texto: string | null;
  /** Nome exibido pelo canal, quando houver. Serve para batizar o card novo. */
  nomeDoContato: string | null;
  /** Correlaciona a linha de auditoria com a request que a originou. */
  requestId?: string;
  /**
   * Rótulo da origem, só para `metadata` e log.
   *
   * Não é decisão: nenhum passo abaixo ramifica por este valor. Serve para que,
   * lendo o `event_log` meses depois, se saiba por onde a mensagem entrou.
   */
  origem: string;
}

/**
 * Roda os três efeitos, em ordem, para uma mensagem de ENTRADA recém-gravada.
 *
 * Só para `inbound`: um envio nosso (ou feito do celular do operador) não pede
 * para sair, não abre demanda e não acorda o agente.
 */
export async function aplicarEfeitosPosEntrada(
  admin: Admin,
  entrada: EntradaDeMensagem,
): Promise<void> {
  // ── CINTO DE SEGURANÇA, nunca a defesa principal ────────────────────────
  //
  // Os ingestores cortam o número interno de avisos ANTES de `upsertContact`,
  // que é o que importa (é o INSERT da conversa que dispara o rodízio). Este
  // aqui existe para o caminho que alguém venha a esquecer — um ingestor novo,
  // um provedor novo, uma reentrega por outro caminho. Chegando até aqui, o
  // contato e a conversa já nasceram; o que ainda dá para impedir é o resto:
  // opt-out, demanda, campanha, follow-up e o despacho do agente.
  //
  // Custo zero para quem nunca ligou o aviso: a leitura vem do memo de 30 s e
  // sai sem tocar o banco quando não há número interno configurado.
  if (await ehContatoDoNumeroInterno(admin, entrada.organizationId, entrada.contactId)) {
    logger.info("[pos-entrada] efeitos pulados: mensagem do número interno de avisos", {
      organizationId: entrada.organizationId,
      origem: entrada.origem,
    });
    return;
  }

  await aplicarOptOut(admin, entrada);
  await guardarOrigemDaPagina(admin, entrada);
  await abrirDemanda(admin, entrada);

  // EMPRESA SUSPENSA NÃO AUTOMATIZA. A mensagem está gravada, o pedido de saída
  // foi honrado e o card nasceu (nada disso depende de assinatura, e é o que a
  // empresa encontra em ordem ao ser reativada). Daqui para baixo é automação —
  // campanha, fluxo e agente —, que só roda com o acesso em dia. Sem esta guarda,
  // "suspender" fechava a tela e deixava o número continuar respondendo.
  if (await empresaSuspensa(admin, entrada.organizationId)) {
    logger.info("[pos-entrada] automações puladas: empresa suspensa", { organizationId: entrada.organizationId });
    return;
  }
  // ASSINATURA QUE CAIU TAMBÉM NÃO AUTOMATIZA. Diferente da suspensão, a conta
  // continua aberta (a pessoa entra, vê as conversas e regulariza) — o que para
  // é o número respondendo sozinho. Só vale com a cobrança de plano ligada.
  if (await assinaturaCaiu(admin, entrada.organizationId)) {
    logger.info("[pos-entrada] automações puladas: assinatura inativa", { organizationId: entrada.organizationId });
    return;
  }

  await avaliarCampanha(admin, entrada);
  // A resposta do lead avança o follow-up AQUI. O despacho do agente (LLM)
  // vem depois: no Hobby ele estoura o tempo da request e o próximo texto
  // do fluxo ficava esperando o relógio.
  await acelerarPipelineDeEventos(admin, {
    organizationId: entrada.organizationId,
    contactId: entrada.contactId,
    messageId: entrada.messageId,
    texto: entrada.texto,
  });
  await processarFluxoOuDespachoDoCanal(admin, entrada);
}

/**
 * A empresa está suspensa? Memo curto por organização: a pergunta é feita a cada
 * mensagem recebida, e a resposta só muda quando alguém suspende ou reativa.
 * Falha de leitura NÃO suspende ninguém — calar um cliente em dia por causa de
 * um soluço do banco é o erro caro aqui.
 */
const SUSPENSA_TTL_MS = 30_000;
const memoDeSuspensa = new Map<string, { em: number; suspensa: boolean }>();
async function empresaSuspensa(admin: Admin, organizationId: string): Promise<boolean> {
  const agora = Date.now();
  const memo = memoDeSuspensa.get(organizationId);
  if (memo && agora - memo.em < SUSPENSA_TTL_MS) return memo.suspensa;
  try {
    const { data, error } = await admin.from("organizations").select("status").eq("id", organizationId).maybeSingle();
    if (error) return memo?.suspensa ?? false;
    const suspensa = data?.status === "suspended";
    memoDeSuspensa.set(organizationId, { em: agora, suspensa });
    return suspensa;
  } catch {
    return memo?.suspensa ?? false;
  }
}

/**
 * 3 · Executa o Fluxo Direto (sem IA) ou despacha o Agente de IA.
 *
 * Permite ao usuário escolher por canal se o número roda um fluxo direto
 * sem IA, se usa agente de IA ou se vai direto para atendimento humano.
 */
/**
 * A configuração da caixa "Início" da versão PUBLICADA do fluxo. `null` quando não
 * dá para ler (fluxo sem versão ativa, grafo fora do schema): quem chama segue
 * para a inscrição, que é quem sabe recusar e dizer por quê.
 */
async function lerInicioDoFluxoPublicado(
  admin: Admin,
  organizationId: string,
  pointerId: string,
): Promise<TriggerNodeConfig | null> {
  const { data: pointer } = await admin
    .from("followup_flow_pointers")
    .select("active_version_id")
    .eq("organization_id", organizationId)
    .eq("id", pointerId)
    .maybeSingle();
  if (!pointer?.active_version_id) return null;
  const { data: version } = await admin
    .from("followup_flow_versions")
    .select("graph")
    .eq("organization_id", organizationId)
    .eq("id", pointer.active_version_id)
    .maybeSingle();
  const parsed = flowGraphSchema.safeParse(version?.graph);
  if (!parsed.success) return null;
  return configDoInicio(parsed.data) ?? null;
}

async function processarFluxoOuDespachoDoCanal(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  let dono: QuemAtende | null = null;
  try {
    const { data: channelSession } = await admin
      .from("channel_sessions")
      .select("metadata")
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.channelSessionId)
      .maybeSingle();

    // Um número, um dono: a regra está em `quemAtendeONumero`.
    dono = quemAtendeONumero(lerConfigDeFluxoDoCanal(channelSession?.metadata));

    if (dono.quem === "humano") {
      logger.info("[pos-entrada] número sem automação: nem fluxo nem IA respondem", {
        channelId: entrada.channelSessionId,
        contactId: entrada.contactId,
      });
      return;
    }

    if (dono.quem === "fluxo") {
      const targetFlowId = dono.flowId;
      const { data: activeEnrollment } = await admin
        .from("followup_enrollments")
        .select("id")
        .eq("organization_id", entrada.organizationId)
        .eq("contact_id", entrada.contactId)
        .eq("pointer_id", targetFlowId)
        .in("status", ["active", "waiting_reply", "coletando"])
        .maybeSingle();

      if (!activeEnrollment) {
        // A caixa "Início" do fluxo publicado diz QUAL mensagem abre o fluxo
        // (palavra-chave, qualquer mensagem, primeiro contato). Mensagem que não
        // abre fica no inbox, sem resposta automática — o número é do fluxo, o
        // agente de IA não é o plano B.
        const inicio = await lerInicioDoFluxoPublicado(admin, entrada.organizationId, targetFlowId);
        if (inicio !== null) {
          const evento = eventoWhatsappDoInicio(inicio);
          const decisao = mensagemAbreOFluxo(inicio, {
            texto: entrada.texto,
            // Só consulta o histórico quando a caixa pede "primeiro contato".
            primeiraDoContato:
              evento === "inicio_conversa"
                ? await ehAPrimeiraMensagemDoContato(admin, entrada.organizationId, entrada.contactId, entrada.messageId)
                : false,
          });
          if (!decisao.entra) {
            logger.info("[pos-entrada] mensagem não abre o fluxo do número (caixa Início)", {
              channelId: entrada.channelSessionId,
              contactId: entrada.contactId,
              flowId: targetFlowId,
              motivo: decisao.motivo,
            });
            return;
          }
        }

        const enrollResult = await enrollFollowupFlow(admin, {
          organizationId: entrada.organizationId,
          pointerId: targetFlowId,
          contactId: entrada.contactId,
          actorUserId: null,
          requestId: entrada.requestId ?? entrada.conversationId,
        });

        if (enrollResult.ok) {
          logger.info("[pos-entrada] contato inscrito no fluxo do canal (sem IA)", {
            channelId: entrada.channelSessionId,
            contactId: entrada.contactId,
            flowId: targetFlowId,
          });
          // O `acelerarPipelineDeEventos` desta mensagem já rodou ANTES da
          // inscrição existir. Sem este passo, a primeira resposta do fluxo só
          // sairia quando o relógio de um minuto passasse.
          await acelerarFluxoDoContato(admin, {
            organizationId: entrada.organizationId,
            contactId: entrada.contactId,
          });
        } else {
          // O número aponta para um fluxo que não roda (desativado, apagado). A
          // mensagem entra no inbox e NINGUÉM automático responde — é `error`
          // porque é um número mudo que alguém precisa ver.
          logger.error("[pos-entrada] número vinculado a um fluxo que não roda — ninguém responde", {
            channelId: entrada.channelSessionId,
            contactId: entrada.contactId,
            flowId: targetFlowId,
            code: enrollResult.code,
          });
        }
      }

      // Em modo fluxo direto, encerra aqui sem acordar o LLM/Agente de IA
      return;
    }

    // Modo padrão / 'ai': pede o despacho do agente de IA
    await pedirDespachoDoAgente(admin, entrada);
  } catch (err) {
    // Número de FLUXO não cai no agente por causa de uma falha: o dono tirou o
    // agente dali de propósito. Só quem é do agente (ou cuja configuração nem
    // chegou a ser lida) segue para o despacho.
    if (dono?.quem === "fluxo") {
      logger.error("[pos-entrada] falha ao inscrever no fluxo do número — agente NÃO acionado (número isolado)", {
        channelId: entrada.channelSessionId,
        flowId: dono.flowId,
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    logger.warn("[pos-entrada] falha ao avaliar fluxo do canal, fallback para despacho", {
      error: err instanceof Error ? err.message : String(err),
    });
    await pedirDespachoDoAgente(admin, entrada);
  }
}

/**
 * 2b · A mensagem casa uma campanha registrada? (caso 2 da elegibilidade)
 *
 * Campanhas de Meta/Google que levam direto para o WhatsApp: o lead chega com
 * uma mensagem identificadora ("Quero saber mais sobre X"). Se ela casar uma
 * campanha em `organizations.settings.campanhas_whatsapp`, o contato fica
 * elegível para a IA. Só faz sentido consultar quando o canal tem o gate
 * `allowlist` ligado — no gate 'open' a IA já responde todo mundo. Roda ANTES do
 * despacho: o evento `ai_agent.dispatch_requested` desta mesma mensagem precisa
 * já encontrar o contato autorizado.
 *
 * Best-effort: qualquer falha aqui vira log e o despacho segue (e cai no
 * atendimento humano, o lado seguro).
 */
async function avaliarCampanha(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  if (!entrada.texto || entrada.texto.trim() === "") return;
  try {
    const { data: sess } = await admin
      .from("channel_sessions")
      .select("metadata")
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.channelSessionId)
      .maybeSingle();
    const gate = (sess?.metadata as Record<string, unknown> | null)?.ai_gate;
    if (gate !== "allowlist") return;

    const { data: contato } = await admin
      .from("contacts")
      .select("ai_authorized_at")
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.contactId)
      .maybeSingle();
    if (contato?.ai_authorized_at != null) return; // já elegível — não reescreve a origem

    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", entrada.organizationId)
      .maybeSingle();
    const campanhas = lerCampanhas(org?.settings ?? null);
    const casada = casarCampanha(entrada.texto, campanhas, entrada.channelSessionId);
    if (casada === null) return;

    await autorizarContatoParaIA(admin, {
      organizationId: entrada.organizationId,
      contactId: entrada.contactId,
      reason: `campanha:${casada.id}`,
      apenasSeNaoAutorizado: true,
    });
    logger.info("pos-entrada: contato autorizado para IA por campanha", {
      organization_id: entrada.organizationId,
      conversation_id: entrada.conversationId,
      campanha: casada.id,
    });
  } catch (err) {
    logger.warn("pos-entrada: avaliação de campanha falhou (o despacho segue)", {
      organization_id: entrada.organizationId,
      conversation_id: entrada.conversationId,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/**
 * 1 · Quem pediu para sair, sai.
 *
 * O update é incondicional (não filtra por `is_blocked` atual) de propósito:
 * regravar `true` sobre `true` é barato, e a linha de auditoria de cada pedido
 * é justamente o que prova, depois, que o pedido chegou e foi respeitado.
 */
async function aplicarOptOut(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  if (!ehPedidoDeOptOut(entrada.texto)) return;

  try {
    const agora = new Date().toISOString();
    const { error } = await admin
      .from("contacts")
      .update({ is_blocked: true, blocked_reason: "stop_keyword", blocked_at: agora })
      .eq("organization_id", entrada.organizationId)
      .eq("id", entrada.contactId);

    if (error) {
      // Falhar em silêncio aqui é o pior desfecho possível do arquivo inteiro:
      // o cliente pediu para sair, o sistema não gravou, e a campanha segue
      // escrevendo. Por isso é `error` e não `warn`.
      logger.error("pos-entrada: opt-out NAO gravado — o contato segue recebendo", {
        organization_id: entrada.organizationId,
        contact_id: entrada.contactId,
        origem: entrada.origem,
        detail: error.message.slice(0, 160),
      });
      return;
    }

    await audit({
      action: "contact.blocked",
      organizationId: entrada.organizationId,
      resourceType: "contact",
      requestId: entrada.requestId,
      metadata: { reason: "stop_keyword", contact_id: entrada.contactId, origem: entrada.origem },
    });
  } catch (err) {
    logger.error("pos-entrada: opt-out NAO gravado — o contato segue recebendo", {
      organization_id: entrada.organizationId,
      contact_id: entrada.contactId,
      origem: entrada.origem,
      detail: err instanceof Error ? err.message.slice(0, 160) : "desconhecido",
    });
  }
}

/**
 * 2 · A conversa vira demanda no funil.
 *
 * `garantirLeadDaConversa` é idempotente por contato e já recusa contato
 * bloqueado — por isso o passo 1 vem antes.
 */
async function abrirDemanda(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  try {
    const nascimento = await garantirLeadDaConversa(admin, {
      organizationId: entrada.organizationId,
      contactId: entrada.contactId,
      conversationId: entrada.conversationId,
      nomeDoContato: entrada.nomeDoContato,
    });

    // Os DOIS desfechos viram log. Sem a linha do "não criou", o silêncio de
    // "já existia" e o de "a organização não tem funil configurado" têm a mesma
    // cara — e o segundo é falha de configuração que alguém precisa ver.
    logger.info(nascimento.criado ? "pos-entrada: lead criado" : "pos-entrada: lead nao criado", {
      organization_id: entrada.organizationId,
      conversation_id: entrada.conversationId,
      origem: entrada.origem,
      ...(nascimento.criado ? { lead_id: nascimento.leadId } : { motivo: nascimento.motivo }),
    });
  } catch (err) {
    logger.error("pos-entrada: nascimento do lead falhou (a mensagem entra assim mesmo)", {
      organization_id: entrada.organizationId,
      conversation_id: entrada.conversationId,
      origem: entrada.origem,
      error: err instanceof Error ? err.message.slice(0, 120) : "unknown",
    });
  }
}

/**
 * 3 · Acorda o agente.
 *
 * Emitir o evento NÃO faz o assistente responder: o consumidor só abre turno se
 * a organização tiver versão publicada apontando para esta sessão. Sem versão
 * publicada, o evento é gravado e nada acontece — que é o estado de quem atende
 * à mão. O que este passo conserta é a cañería, não a decisão de ligar o robô.
 *
 * O payload é o MESMO dos dois canais, campo a campo. Um payload por canal
 * faria o consumidor adivinhar de quem veio — e o consumidor é um só
 * (`lib/agent-engine/edge/crm/drain.ts`).
 */
async function pedirDespachoDoAgente(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  if (!entrada.messageId) return;

  const { error } = await admin.rpc("emit_event" as never, {
    p_event_type: "ai_agent.dispatch_requested",
    p_entity_kind: "message",
    p_entity_id: entrada.messageId,
    p_payload: {
      organization_id: entrada.organizationId,
      conversation_id: entrada.conversationId,
      contact_id: entrada.contactId,
      channel_session_id: entrada.channelSessionId,
      inbound_message_id: entrada.messageId,
    },
    p_metadata: { source: entrada.origem, request_id: entrada.requestId },
    p_organization_id: entrada.organizationId,
  } as never);

  if (error) {
    logger.warn("pos-entrada: emit ai_agent.dispatch_requested falhou", {
      organization_id: entrada.organizationId,
      message_id: entrada.messageId,
      origem: entrada.origem,
      detail: error.message.slice(0, 160),
    });
  }
}

/**
 * 4 · A origem de site/landing page veio junto com o texto? (#924)
 *
 * Roda ANTES de `abrirDemanda`: o card COPIA a origem do contato quando nasce
 * (ver `ROTULO_DE_ANUNCIO` em `lib/leads/nascimento-do-lead.ts`). Estampar
 * depois deixaria o card com a origem de sempre e o dado só no contato — que é
 * exatamente onde ninguém olha.
 *
 * Duas condições da decisão da #924 estão aqui, e nenhuma delas é re-medida:
 * (a) a origem vale SÓ na PRIMEIRA mensagem do contato — um link encaminhado
 * adiante não vira atribuição de quem o recebeu (o filtro roda no banco, em
 * `ehAPrimeiraMensagemDoContato`); (b) o PRIMEIRO TOQUE nunca é sobrescrito, e
 * isso continua sendo da `fn_estampar_atribuicao_de_anuncio`, não deste arquivo.
 *
 * Falha aqui é LOG, nunca exceção: a mensagem do cliente JÁ está gravada, e
 * devolver erro ao provider faria ele reenviar a mensagem. Trocar um rótulo de
 * origem faltando por uma tempestade de reentregas é um péssimo negócio.
 *
 * ─── Dois transportes para a MESMA origem ──────────────────────────────────
 *
 * `[dk1:<base64url>]` carrega as UTMs dentro do próprio texto, e `[ref:XXXXXX]`
 * carrega só um ref de seis caracteres, cujas UTMs ficaram no servidor quando a
 * rota de captura recebeu o clique. O resto — primeira mensagem, primeiro
 * toque, formato do que é gravado — é idêntico nos dois, e é por isso que eles
 * compartilham este bloco em vez de ganharem um caminho cada.
 *
 * O `[dk1:]` é tentado PRIMEIRO porque é o que não custa consulta nenhuma: ele
 * se resolve no texto. O ref só vai ao banco quando o texto não trouxe UTM.
 */
async function guardarOrigemDaPagina(admin: Admin, entrada: EntradaDeMensagem): Promise<void> {
  const achada = extrairOrigemDaPagina(entrada.texto);
  // O ref não é lido no banco aqui: a leitura CONSOME o clique, e consumir um
  // clique fora da primeira mensagem o queimaria sem estampar ninguém.
  const ref = achada ? null : (PADRAO_DO_REF.exec(entrada.texto ?? "")?.[1] ?? null);
  // O caso comum: quase nenhuma mensagem traz código de página nem ref.
  if (!achada && !ref) return;

  try {
    // A consulta vem ANTES de qualquer escrita, e DENTRO do try: falha de
    // leitura não pode virar estampa. O `estampar` só roda depois de a
    // primeira mensagem estar confirmada.
    if (
      !(await ehAPrimeiraMensagemDoContato(
        admin,
        entrada.organizationId,
        entrada.contactId,
        entrada.messageId,
      ))
    ) {
      logger.info("pos-entrada: código de origem fora da primeira mensagem (ignorado)", {
        contactId: entrada.contactId,
        messageId: entrada.messageId,
      });
      return;
    }

    const utm = achada
      ? achada.utm
      : ref
        ? (await casarClickRef(admin, entrada.organizationId, ref, entrada.contactId))?.utm
        : undefined;
    if (!utm) {
      // Ref que não casa é sinal NOSSO que não fechou: já consumido, de outra
      // organização, ou de um clique que nunca foi gravado. Não é tráfego
      // orgânico, então vale um aviso — ao contrário da mensagem sem marcador
      // nenhum, que nem chega aqui.
      logger.warn("pos-entrada: ref da página não casou (a mensagem entra assim mesmo)", {
        contactId: entrada.contactId,
      });
      return;
    }

    const origem = { utm, capturadaEm: new Date().toISOString() };

    const gravou = await estamparOrigemDaPagina(admin, entrada.organizationId, entrada.contactId, origem);
    if (!gravou) {
      logger.warn("pos-entrada: origem da página NÃO gravada (a mensagem entra assim mesmo)", {
        contactId: entrada.contactId,
        utm_source: origem.utm.utm_source ?? null,
      });
      return;
    }
    logger.info("pos-entrada: origem da página gravada", {
      contactId: entrada.contactId,
      utm: Object.keys(origem.utm),
    });
  } catch (erro) {
    logger.error("pos-entrada: origem da página falhou (a mensagem entra assim mesmo)", {
      contactId: entrada.contactId,
      error: erro instanceof Error ? erro.message.slice(0, 160) : String(erro).slice(0, 160),
    });
  }
}
