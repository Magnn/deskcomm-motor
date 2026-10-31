/**
 * RISCO DE VIDA NÃO ESPERA NA CENTRAL — o alerta fora da tela.
 *
 * ## O defeito
 *
 * Quando alguém fala em tirar a própria vida, a agente para de vender e passa a
 * conversa para uma pessoa. Isso estava certo; o que vinha depois não. O aviso
 * ficava só na Central e o sino só toca em navegador aberto. Medido em produção
 * em 31/10/2026: das conversas passadas por risco de vida nos 7 dias anteriores,
 * nenhuma recebeu resposta, e a pessoa tinha ouvido que alguém viria.
 *
 * ## O que este arquivo faz
 *
 * Varre as passagens que ninguém reconheceu, reconhece as de risco de vida e
 * avisa quem administra por e-mail e pelo WhatsApp da equipe
 * (`config_aviso_de_caso`, tela `/app/ai/cases/avisos`), até três vezes.
 *
 * ## Por que repete no WhatsApp, ao contrário do `case-stale-watcher`
 *
 * Aquele vigia cobra só na Central para não gastar o número em caso esquecido, e
 * essa decisão continua de pé para ele. Aqui a decisão é outra: quem pode estar
 * em perigo justifica três mensagens internas.
 *
 * ## Por que o texto não leva as palavras da pessoa
 *
 * O e-mail e o WhatsApp saem do CRM. O que ela disse fica na conversa, atrás do
 * login; o alerta leva o nome e o link.
 *
 * Pura: banco, e-mail e WhatsApp entram por `DepsDoAlerta`.
 */
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

/** Quem ignorou três vezes não atende no quarto (mesma régua de `cobrancas`). */
export const TETO_DE_ALERTAS = 3;
/** Espera antes do 2º e do 3º alerta. */
export const ESPERAS_ENTRE_ALERTAS_MS = [15 * 60 * 1000, 60 * 60 * 1000] as const;
/** Passagem mais velha que isto não alerta: o caso precisa de outra conversa. */
export const JANELA_DO_ALERTA_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O léxico fica em expressões inteiras de propósito: "morrer" sozinho casa com
 * "morrendo de saudade", e "fundo do poço" com quem só está sem dinheiro.
 */
const SINAL_DE_RISCO = new RegExp(
  [
    "ideacao suicida",
    "suicid",
    "autoexterm",
    "autolesa",
    "risco de vida",
    "tirar a (minha |propria |sua )?vida",
    "desistir da vida",
    "dar um tiro",
    "(me|se) matar",
    "(me|se) machucar",
    "quero morrer",
    "vontade de morrer",
    "nao quero mais viver",
    "sofrimento emocional intenso",
  ].join("|"),
);

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function ehRiscoDeVida(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return SINAL_DE_RISCO.test(normalizar(texto));
}

export interface PassagemEmAberto {
  id: string;
  organization_id: string;
  contact_id: string;
  conversation_id: string;
  criado_em: string;
  title: string | null;
  notes: string | null;
  content: string | null;
  alertas_de_risco: number;
  ultimo_alerta_de_risco_em: string | null;
}

export function passagemDeRisco(p: PassagemEmAberto): boolean {
  return ehRiscoDeVida([p.content, p.title, p.notes].filter(Boolean).join(" "));
}

/** `true` quando esta passagem já pode receber o próximo alerta. */
export function alertaVencido(p: PassagemEmAberto, agora: Date): boolean {
  if (p.alertas_de_risco >= TETO_DE_ALERTAS) return false;
  if (agora.getTime() - Date.parse(p.criado_em) > JANELA_DO_ALERTA_MS) return false;
  if (p.alertas_de_risco === 0 || !p.ultimo_alerta_de_risco_em) return true;
  const espera = ESPERAS_ENTRE_ALERTAS_MS[p.alertas_de_risco - 1] ?? 0;
  return agora.getTime() - Date.parse(p.ultimo_alerta_de_risco_em) >= espera;
}

export interface TextoDoAlerta {
  assunto: string;
  corpo: string;
}

export function textoDoAlerta(entrada: {
  nome: string | null;
  link: string;
  tentativa: number;
  idioma: Idioma;
}): TextoDoAlerta {
  const t = (texto: string) => traduzir(texto, entrada.idioma);
  const quem = entrada.nome?.trim() || t("uma pessoa sem nome cadastrado");
  return {
    assunto: `${t("URGENTE: pessoa em risco sem atendimento")} — ${quem}`,
    corpo: [
      `${t("URGENTE: pessoa em risco sem atendimento")} (${entrada.tentativa}/${TETO_DE_ALERTAS})`,
      "",
      `${t("A IA parou de atender porque esta pessoa falou em tirar a própria vida, e ninguém assumiu a conversa.")} ${quem}.`,
      "",
      entrada.link,
      "",
      t("Responda com uma pessoa de verdade, sem falar de venda nem de cobrança. Passe o CVV (188) e, em perigo imediato, o SAMU (192)."),
    ].join("\n"),
  };
}

export type DesfechoDoWhatsapp = "enviado" | "sem_configuracao" | "adiado" | "falhou";

export interface DepsDoAlerta {
  passagensEmAberto(desde: string): Promise<PassagemEmAberto[]>;
  nomeDoContato(orgId: string, contactId: string): Promise<string | null>;
  idiomaDaOrganizacao(orgId: string): Promise<Idioma>;
  /** `true` quando ao menos um e-mail saiu. */
  enviarEmail(orgId: string, alerta: TextoDoAlerta): Promise<boolean>;
  enviarWhatsapp(orgId: string, corpo: string): Promise<DesfechoDoWhatsapp>;
  /** Grava o alerta nas passagens daquela conversa e destaca o aviso na Central. */
  registrarAlerta(p: PassagemEmAberto, ids: string[], tentativa: number, quando: Date): Promise<void>;
  urlPublica: string;
  clock: () => Date;
  log: {
    info(msg: string, dados?: Record<string, unknown>): void;
    warn(msg: string, dados?: Record<string, unknown>): void;
  };
}

export interface ResultadoDoAlerta {
  examinadas: number;
  alertadas: number;
  sem_canal: number;
}

/**
 * Uma rodada. A contagem só sobe quando algum canal entregou: alerta que não saiu
 * tenta de novo na rodada seguinte, em vez de gastar uma das três tentativas.
 */
export async function rodarAlertasDeRisco(deps: DepsDoAlerta): Promise<ResultadoDoAlerta> {
  const agora = deps.clock();
  const desde = new Date(agora.getTime() - JANELA_DO_ALERTA_MS).toISOString();
  const abertas = (await deps.passagensEmAberto(desde)).filter(passagemDeRisco);

  // A mesma conversa pode ter passado duas vezes: é um atendimento, um alerta.
  const porConversa = new Map<string, PassagemEmAberto[]>();
  for (const p of abertas) {
    porConversa.set(p.conversation_id, [...(porConversa.get(p.conversation_id) ?? []), p]);
  }

  let alertadas = 0;
  let semCanal = 0;
  for (const grupo of porConversa.values()) {
    const principal = grupo.reduce((a, b) => (b.alertas_de_risco > a.alertas_de_risco ? b : a));
    if (!alertaVencido(principal, agora)) continue;

    const orgId = principal.organization_id;
    const tentativa = principal.alertas_de_risco + 1;
    const alerta = textoDoAlerta({
      nome: await deps.nomeDoContato(orgId, principal.contact_id),
      link: `${deps.urlPublica.replace(/\/+$/, "")}/app/inbox/${principal.conversation_id}`,
      tentativa,
      idioma: await deps.idiomaDaOrganizacao(orgId),
    });

    const email = await deps.enviarEmail(orgId, alerta).catch(() => false);
    const whatsapp = await deps
      .enviarWhatsapp(orgId, alerta.corpo)
      .catch((): DesfechoDoWhatsapp => "falhou");

    if (!email && whatsapp !== "enviado") {
      semCanal += 1;
      deps.log.warn("alerta de risco não saiu por nenhum canal", {
        organization_id: orgId,
        conversation_id: principal.conversation_id,
        whatsapp,
      });
      continue;
    }

    await deps.registrarAlerta(principal, grupo.map((p) => p.id), tentativa, agora);
    alertadas += 1;
    deps.log.info("alerta de risco enviado", {
      organization_id: orgId,
      conversation_id: principal.conversation_id,
      tentativa,
      email,
      whatsapp,
    });
  }

  return { examinadas: abertas.length, alertadas, sem_canal: semCanal };
}
