/**
 * O transporte de conversões da plataforma de anúncios da Meta.
 *
 * ESTE é o único arquivo do repo, fora de `lib/channels/`, que pode escrever o
 * nome do endpoint — e é por isso que ele existe separado: tudo que sabe o
 * formato do fio mora aqui, e some daqui para dentro se a plataforma mudar.
 *
 * ─── O que a plataforma exige, e o que ela perdoa ───────────────────────────
 *
 * Três regras que não são opinião e que quebram em produção quando ignoradas:
 *
 * 1. `Purchase` exige `value` E `currency`. Não é opcional. Mandar sem valor é
 *    rejeição; mandar `0` para "resolver" é pior, porque é ACEITO e ensina ao
 *    otimizador que a venda não vale nada. Por isso o chamador nem chega aqui
 *    sem valor — ele registra `sem_valor` e deixa visível na tela.
 *
 * 2. Evento com mais de 7 dias é recusado. O `event_time` é o `closed_at` do
 *    lead, então um backlog de drain maior que isso não vira "atrasado", vira
 *    PERDIDO. O teto está aqui e não no chamador porque o número é da
 *    plataforma, não da nossa feature.
 *
 * 3. Identidade. Para conversão vinda de anúncio clique-para-WhatsApp, o
 *    `ctwa_clid` é o que liga a venda ao clique — é ele que carrega a atribuição,
 *    e o telefone hasheado só reforça. Sem o clique não há o que reportar, e é
 *    isso que o chamador chama de `sem_atribuicao`.
 *
 * ─── Por que `business_messaging` e não `website` ───────────────────────────
 *
 * `action_source` descreve ONDE a conversão aconteceu, e a plataforma valida a
 * combinação: `business_messaging` é o que aceita `ctwa_clid` como identidade e
 * exige o `messaging_channel` junto. Declarar `website` passaria no envio e a
 * conversão não seria atribuída ao anúncio — o pior desfecho possível, porque
 * devolve 200 e não produz efeito nenhum.
 */
import { createHash } from "node:crypto";

import { enviarConversaoPelaZernio } from "@/lib/channels/zernio/conversoes";
import { VERSAO_PADRAO_DA_GRAPH } from "@/lib/graph-version";
import { logger } from "@/lib/logger";
import { estadoDoTelefone } from "../estado-do-telefone";
import type {
  ConversaoOffline,
  CredencialDeConversao,
  ResultadoDeEnvio,
  TransporteDeConversao,
} from "../types";

/**
 * Fixada no código, e não em env nova (item 9 do DoD pede env em dois lugares e
 * este eixo não deve herdar a variável do canal de mensagem — são credenciais e
 * ciclos de vida diferentes). Referencia o número do módulo único
 * (`lib/graph-version.ts`) em vez de copiá-lo: o eixo de anúncio usa a MESMA
 * versão do transporte de mensagens, mas não a variável dele.
 */
const VERSAO_DA_API = VERSAO_PADRAO_DA_GRAPH;

/** O teto da plataforma. Evento mais velho que isto é recusado. */
const IDADE_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;

const TEMPO_LIMITE_MS = 10_000;

/** SHA-256 hex do valor normalizado, como a plataforma exige para dado pessoal. */
function hash(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}

/**
 * Um 4xx pode ser das duas naturezas, e a diferença decide retry vs. avisar o
 * humano. O código 190 (e a família 102/463) é token — humano. O 613 é
 * throttle: 4xx que se resolve sozinho, e tratá-lo como permanente faria o
 * sistema desistir de uma venda por causa de um pico de tráfego.
 */
function classifica4xx(codigo: number | null, mensagem: string): ResultadoDeEnvio {
  if (codigo === 613 || codigo === 80004) {
    return { tipo: "transitorio", detalhe: `limite de chamadas (${codigo}): ${mensagem}` };
  }
  return { tipo: "permanente", detalhe: mensagem };
}

/** A recusa da mensageria para venda sem conversa de anúncio aberta — direta ou pelo intermediário. */
const SEM_CONVERSA_DE_ANUNCIO = /No CTWA-attributed conversation found/i;

/**
 * Manda pela mensageria e, se a Meta recusar por não achar a conversa do anúncio, manda UMA vez pelo pixel da tela,
 * com o telefone e a identidade (`action_source: chat`). Não é atribuída ao clique, mas a compra volta a contar no
 * pixel e na otimização por compradora. Mesmo `event_id`: se a mensageria aceitar depois, a Meta deduplica.
 */
async function enviar(credencial: CredencialDeConversao, conversao: ConversaoOffline): Promise<ResultadoDeEnvio> {
  const primeiro = await enviarUmaVez(credencial, conversao);
  if (primeiro.tipo !== "permanente" || !SEM_CONVERSA_DE_ANUNCIO.test(primeiro.detalhe)) return primeiro;
  if (conversao.pixelDoSite || conversao.paginaDoSite) return primeiro;
  const { intermediario: _i, reservaNoPixel, ...semIntermediario } = credencial;
  const pixel = credencial.intermediario ? semIntermediario : reservaNoPixel ? { ...semIntermediario, ...reservaNoPixel } : null;
  if (!pixel?.datasetId || !pixel.accessToken) return primeiro;
  const reserva = await enviarUmaVez(pixel, { ...conversao, pixelDoSite: true });
  return reserva.tipo === "ok"
    ? { tipo: "ok", detalhe: `pelo pixel: a mensageria não achou a conversa do anúncio; ${reserva.detalhe ?? ""}`.slice(0, 400) }
    : { ...reserva, detalhe: `${primeiro.detalhe} | pixel: ${reserva.detalhe}`.slice(0, 400) };
}

async function enviarUmaVez(
  credencial: CredencialDeConversao,
  conversao: ConversaoOffline,
): Promise<ResultadoDeEnvio> {
  const idadeMs = Date.now() - conversao.ocorridoEm.getTime();
  if (idadeMs > IDADE_MAXIMA_MS) {
    const dias = Math.floor(idadeMs / (24 * 60 * 60 * 1000));
    return {
      tipo: "permanente",
      detalhe:
        `evento com ${dias} dias — a plataforma recusa acima de 7. ` +
        `A venda fechou em ${conversao.ocorridoEm.toISOString()} e não pode mais ser reportada.`,
    };
  }

  // Número do intermediário: ele tem o token da conta do WhatsApp e o clique, e manda por `business_messaging`.
  if (credencial.intermediario) {
    return enviarConversaoPelaZernio(
      credencial.intermediario,
      {
        evento: conversao.evento,
        eventoId: conversao.eventoId,
        ocorridoEm: conversao.ocorridoEm,
        telefone: conversao.telefone ?? "",
        conversaId: credencial.intermediario.conversaId ?? null,
        valorCentavos: conversao.valorCentavos,
        moeda: conversao.moeda,
        idExterno: conversao.identidade?.idExterno ?? null,
        email: conversao.identidade?.email ?? null,
        testEventCode: credencial.testEventCode,
      },
    );
  }

  // PIXEL DO SITE (conversa fora de número oficial): `ctwa_clid` e a conta do WhatsApp só valem em
  // `business_messaging`; aqui a identidade é o telefone, e o país reforça o casamento.
  // Evento do site (o Lead da página) segue a mesma identidade do pixel do site.
  const doSite = Boolean(conversao.pixelDoSite || conversao.paginaDoSite);
  const userData: Record<string, unknown> = doSite
    ? {}
    : {
        ctwa_clid: conversao.cliqueDeOrigem,
        // Obrigatório em `business_messaging`: sem a conta do WhatsApp Business (ou a Página) a
        // plataforma devolve 400 / subcódigo 2804116. Tem de ser a conta vinculada ao conjunto de dados.
        ...(conversao.contaDoWhatsApp ? { whatsapp_business_account_id: conversao.contaDoWhatsApp } : {}),
      };
  // Array de propósito: o formato aceita múltiplos valores por campo, e mandar
  // string crua onde ele espera lista é aceito com aviso e ignorado no match.
  if (conversao.telefone) userData.ph = [hash(conversao.telefone)];
  // País: o do telefone; sem telefone, o que a página declarou ao pixel do navegador (o Lead da landing).
  const pais = conversao.telefone?.startsWith("55") ? "br" : doSite ? conversao.cliente?.pais : null;
  if (pais) userData.country = [hash(pais)];
  const estado = estadoDoTelefone(conversao.telefone);
  if (estado) userData.st = [hash(estado)];
  // Quem é o cliente, além do telefone: cada campo sobe a nota de correspondência do evento (medido em
  // 29/10/2026: a Compra com só telefone/país/clique/IP/navegador tinha 7,2/10). Todos com hash; nome em
  // minúsculas e só letras, nascimento AAAAMMDD, como a plataforma pede antes do hash.
  const id = conversao.identidade;
  // O id do contato e, no pixel do site, o visitante da landing: o MESMO valor que o pixel do navegador manda como
  // `external_id`. Com os dois, a Meta liga a visita e o Lead do navegador à venda feita dias depois na conversa.
  const idsExternos = [id?.idExterno, doSite ? conversao.cliente?.visitante : null].filter((v): v is string => Boolean(v));
  if (idsExternos.length) userData.external_id = [...new Set(idsExternos)].map(hash);
  if (id?.email) userData.em = [hash(id.email)];
  if (id?.primeiroNome) userData.fn = [hash(id.primeiroNome)];
  if (id?.sobrenome) userData.ln = [hash(id.sobrenome)];
  if (id?.nascimento && /^\d{4}-\d{2}-\d{2}$/.test(id.nascimento)) userData.db = [hash(id.nascimento.replace(/-/g, ""))];
  // Clique, navegador, IP e agente da landing: vão EM CLARO (a plataforma não aceita hash nestes campos).
  if (doSite && conversao.fbc) userData.fbc = conversao.fbc;
  if (doSite && conversao.fbp) userData.fbp = conversao.fbp;
  if (doSite && conversao.cliente?.ip) userData.client_ip_address = conversao.cliente.ip;
  if (doSite && conversao.cliente?.ua) userData.client_user_agent = conversao.cliente.ua;

  const corpo: Record<string, unknown> = {
    data: [
      {
        event_name: conversao.evento,
        // Segundos, não milissegundos. Em ms o evento cai a ~55 mil anos no
        // futuro, e a resposta é 200 — some sem erro.
        event_time: Math.floor(conversao.ocorridoEm.getTime() / 1000),
        event_id: conversao.eventoId,
        // A venda fechada numa conversa que não é de número oficial: `chat`, sem canal de mensageria.
        ...(conversao.paginaDoSite
          ? { action_source: "website", event_source_url: conversao.paginaDoSite }
          : conversao.pixelDoSite
            ? { action_source: "chat" }
            : { action_source: "business_messaging", messaging_channel: "whatsapp" }),
        user_data: userData,
        // Sem valor, sem custom_data: mandar `value: 0` seria ACEITO e ensinaria ao otimizador que o evento não vale nada.
        ...(conversao.valorCentavos !== null
          ? { custom_data: { value: conversao.valorCentavos / 100, currency: conversao.moeda.toUpperCase() } }
          : {}),
      },
    ],
  };
  if (credencial.testEventCode) corpo.test_event_code = credencial.testEventCode;

  const url =
    `https://graph.facebook.com/${VERSAO_DA_API}/` +
    `${encodeURIComponent(credencial.datasetId)}/events`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // No header, nunca na query string: token em URL vaz(a) para log de
        // proxy e para o Sentry junto do breadcrumb da request.
        authorization: `Bearer ${credencial.accessToken}`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (erro) {
    return {
      tipo: "transitorio",
      detalhe: erro instanceof Error ? erro.message : "falha de rede",
    };
  }

  const texto = await resposta.text().catch(() => "");
  if (resposta.ok) {
    // HTTP 200 confirma o transporte, não o recebimento do evento. Guardar o
    // recibo permite distinguir envio aceito de falha silenciosa no gateway.
    try {
      const recibo = JSON.parse(texto) as { events_received?: unknown; fbtrace_id?: unknown; messages?: unknown };
      if (recibo?.events_received !== 1) {
        return { tipo: "transitorio", detalhe: "Meta não confirmou o recebimento de 1 evento" };
      }
      const trace = typeof recibo.fbtrace_id === "string" && /^[\w-]{1,100}$/.test(recibo.fbtrace_id)
        ? `; trace ${recibo.fbtrace_id}` : "";
      const avisos = Array.isArray(recibo.messages) ? recibo.messages.length : 0;
      return { tipo: "ok", detalhe: `Meta: 1 evento recebido${trace}${avisos ? `; ${avisos} aviso(s)` : ""}` };
    } catch {
      return { tipo: "transitorio", detalhe: "Meta respondeu sem recibo JSON válido" };
    }
  }

  let codigo: number | null = null;
  let mensagem = texto.slice(0, 400);
  try {
    const json = JSON.parse(texto) as { error?: { code?: number; message?: string; error_user_msg?: string } };
    if (typeof json.error?.code === "number") codigo = json.error.code;
    if (json.error?.message) mensagem = json.error.message;
    // `message` costuma ser só "Invalid parameter"; quem diz QUAL parâmetro é `error_user_msg`. Sem
    // ele a tela mostrava uma recusa que ninguém conseguia consertar.
    if (json.error?.error_user_msg) mensagem = `${mensagem}: ${json.error.error_user_msg}`.slice(0, 400);
  } catch {
    // Corpo não-JSON num erro é o caso de gateway/WAF no meio. Fica o texto cru.
  }

  logger.warn("[conversoes.meta] envio recusado", {
    status: resposta.status,
    codigo,
    leadId: conversao.leadId,
  });

  if (resposta.status >= 500) {
    return { tipo: "transitorio", detalhe: `${resposta.status}: ${mensagem}` };
  }
  return classifica4xx(codigo, mensagem);
}

export const transporteMeta: TransporteDeConversao = {
  plataforma: "meta_ads",
  enviar,
};

/** Exportados para o teste poder vigiar as regras sem falar com a rede. */
export const INTERNOS = { hash, classifica4xx, IDADE_MAXIMA_MS, VERSAO_DA_API } as const;
