/**
 * O QUE A PESSOA VÊ na área do cliente — tudo derivado do que o Desk já tem.
 * A área não é um segundo cadastro: ela mostra.
 *
 *   • compras    ← `revenue_ledger` (Cakto, Stripe e o pagamento registrado pela equipe);
 *   • leitura    ← as IMAGENS que a empresa mandou na conversa (as cartas tiradas);
 *   • materiais  ← os DOCUMENTOS, os ÁUDIOS mandados como arquivo e os VÍDEOS;
 *   • vitrine    ← `area_servicos`, marcando o que ela já comprou.
 *
 * O áudio de voz da agente (nota de voz da resposta) NÃO é material: é a fala
 * da conversa. Só entra o áudio enviado como arquivo (`metadata.audio_as_file`),
 * que é como os fluxos de entrega mandam um material em áudio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKET_DAS_FOTOS } from "@/lib/catalogo/fotos";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { caminhoDaCarta } from "@/lib/leitura/imagens";
import { slugDoProduto } from "@/lib/preco/pos-venda";

import { lerEtapas, linhaDoTempo, type EtapaNaLinhaDoTempo } from "./etapas";

const BUCKET = "whatsapp-media";
/** Os links dos arquivos valem 1 hora; a página os gera de novo a cada visita. */
const VALIDADE_DO_ARQUIVO_S = 3600;
const MAX_MIDIAS = 300;
/** As últimas falas da conversa de WhatsApp que a área mostra. */
const MAX_FALAS = 400;

/**
 * Regra pura: as falas da conversa que a área mostra, da mais antiga para a mais
 * nova. Texto entra como está; áudio entra pela transcrição (sem transcrição,
 * fica de fora — "[áudio]" solto não diz nada a quem lê).
 */
export function falasDaConversa(
  linhas: ReadonlyArray<{
    id: string;
    direction: string;
    type: string;
    body: string | null;
    media_derived_text: string | null;
    created_at: string;
    sent_via?: string | null;
  }>,
): FalaDaConversa[] {
  const falas: FalaDaConversa[] = [];
  for (const l of linhas) {
    const texto = (l.type === "audio" ? (l.media_derived_text ?? "") : (l.body ?? "")).trim();
    if (texto === "") continue;
    falas.push({
      id: l.id,
      de: l.direction === "inbound" ? "voce" : "empresa",
      texto: l.type === "audio" ? `🎤 ${texto}` : texto,
      quando: l.created_at,
      automatica: l.sent_via === "automation",
    });
  }
  falas.sort((a, b) => (a.quando < b.quando ? -1 : 1));
  // O mesmo texto, do mesmo lado, logo em seguida é reenvio (retentativa, envio
  // pelo número novo), não fala nova: quem relê vê uma vez só.
  return falas.filter((f, i) => {
    const antes = falas[i - 1];
    return !(
      antes &&
      antes.de === f.de &&
      antes.texto === f.texto &&
      new Date(f.quando).getTime() - new Date(antes.quando).getTime() < REENVIO_DENTRO_DE_MS
    );
  });
}

/** Até quanto tempo depois o mesmo texto repetido ainda conta como reenvio. */
const REENVIO_DENTRO_DE_MS = 6 * 3_600_000;

export interface MensagemComMidia {
  id: string;
  type: string;
  body: string | null;
  media_mime: string | null;
  media_storage_path: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type ClasseDaMidia = "leitura" | "material";

/** Regra pura: o que desta mensagem (já saída da empresa, com arquivo) aparece na área, e onde. */
export function classificarMidia(m: Pick<MensagemComMidia, "type" | "media_storage_path" | "metadata">): ClasseDaMidia | null {
  if (!m.media_storage_path) return null;
  if (m.type === "image") return /(^|\/)leitura-[^/]+$/.test(m.media_storage_path) ? "leitura" : null;
  if (m.type === "document" || m.type === "video") return "material";
  // Áudio só é material quando foi mandado como ARQUIVO e não é a voz da agente: a resposta
  // falada da agente também pode sair como arquivo, e ela é fala da conversa, não entrega.
  // Medido em 15/10/2026: os dois "materiais" de uma compradora eram recados de voz da agente.
  if (m.type === "audio") return m.metadata?.audio_as_file === true && !m.metadata?.ai_actor_id ? "material" : null;
  return null;
}

export interface Compra {
  id: string;
  /** `null` = o pagamento veio sem nome de produto. */
  produto: string | null;
  valor_cents: number;
  currency: string;
  quando: string;
  estornada: boolean;
}

export interface ItemDaLeitura {
  id: string;
  url: string;
  quando: string;
}

export interface Material {
  id: string;
  tipo: "documento" | "audio" | "video";
  /** A legenda com que foi enviado; `null` = sem legenda (a tela mostra o tipo). */
  nome: string | null;
  quando: string;
}

export interface ServicoDaVitrine {
  id: string;
  nome: string;
  descricao: string | null;
  recebe: string | null;
  preco_cents: number;
  currency: string;
  destaque: boolean;
  ja_comprado: boolean;
}

export interface EntradaDoDiario {
  id: string;
  texto: string;
  quando: string;
}

export interface FalaDaConversa {
  id: string;
  /** Quem falou: a pessoa ou a empresa. */
  de: "voce" | "empresa";
  texto: string;
  quando: string;
  /** Saiu de campanha ou automação, não de quem atende. */
  automatica?: boolean;
}

/**
 * O que é cobrança ou insistência, e não cuidado: a régua de retomada sai como fala da própria agente
 * (`sent_via = ai`), então a origem não basta — o texto decide.
 */
const FALA_DE_COBRANCA =
  /\b(pix|pagamento|pagar|pague|paga|acerto|cobran\w*|boleto|cart[aã]o|link|valor)\b|r\$|parar? de te procurar|que eu pare|ainda tem interesse|quer continuar/i;

/** Curto demais para ser recado ("Oi", "Tudo bem?"). */
const RECADO_MINIMO = 25;

/**
 * Regra pura: o RECADO da empresa que a aba Hoje mostra — a fala mais recente de quem atende que é de
 * cuidado, nunca uma cobrança, uma retomada ("prefere que eu pare de te procurar?") ou um disparo de
 * campanha. Medido em 18/10/2026: a "última mensagem" da área de um contato era a régua de cobrança de
 * 11/10, e é a primeira coisa que a pessoa lê ao entrar.
 */
export function recadoDaEmpresa(falas: readonly FalaDaConversa[]): FalaDaConversa | null {
  for (let i = falas.length - 1; i >= 0; i--) {
    const f = falas[i]!;
    if (f.de !== "empresa" || f.automatica) continue;
    if (f.texto.startsWith("🎤")) continue;
    if (f.texto.length < RECADO_MINIMO || FALA_DE_COBRANCA.test(f.texto)) continue;
    return f;
  }
  return null;
}

export interface MensagemDaArea {
  id: string;
  autor: "cliente" | "equipe";
  texto: string;
  quando: string;
}

/**
 * As chaves pelas quais uma compra se liga a um serviço: o nome inteiro e, quando
 * o checkout prefixa uma categoria ("Trabalho Espiritual: Abertura do Coração"),
 * também o que vem depois dos dois-pontos. Medido em 17/10/2026: 33 das 41
 * compras da Abertura do Coração vieram com o prefixo.
 */
export function chavesDoProduto(produto: string): string[] {
  const inteiro = slugDoProduto(produto);
  const i = produto.indexOf(":");
  const depois = i >= 0 ? slugDoProduto(produto.slice(i + 1)) : "";
  return depois && depois !== inteiro ? [inteiro, depois] : [inteiro];
}

/** Um trabalho comprado que tem etapas: a linha do tempo dele para esta pessoa. */
export interface TrabalhoComEtapas {
  servicoId: string;
  nome: string;
  etapas: EtapaNaLinhaDoTempo[];
}

/**
 * Regra pura: os trabalhos comprados (não devolvidos) cujo serviço tem etapas,
 * do mais recente para o mais antigo, um por serviço. A compra se liga ao
 * serviço pelo NOME do produto pago, como na vitrine — inclusive serviço que
 * não está mais à venda (as etapas continuam valendo para quem já comprou).
 */
export function trabalhosComEtapas(
  compras: readonly Compra[],
  servicos: ReadonlyArray<{ id: string; nome: string; etapas: unknown }>,
  feitas: ReadonlyArray<{ servico_id: string; indice: number; feita_em: string }>,
): TrabalhoComEtapas[] {
  const porSlug = new Map<string, { id: string; nome: string; etapas: unknown }>();
  for (const sv of servicos) if (!porSlug.has(slugDoProduto(sv.nome))) porSlug.set(slugDoProduto(sv.nome), sv);
  const vistos = new Set<string>();
  const saida: TrabalhoComEtapas[] = [];
  for (const c of [...compras].sort((a, b) => (a.quando < b.quando ? 1 : -1))) {
    if (c.estornada || !c.produto) continue;
    const sv = chavesDoProduto(c.produto).map((k) => porSlug.get(k)).find(Boolean);
    if (!sv || vistos.has(sv.id)) continue;
    const etapas = lerEtapas(sv.etapas);
    if (etapas.length === 0) continue;
    vistos.add(sv.id);
    const marcadas = new Map(feitas.filter((f) => f.servico_id === sv.id).map((f) => [f.indice, f.feita_em] as const));
    saida.push({ servicoId: sv.id, nome: sv.nome, etapas: linhaDoTempo(etapas, marcadas) });
  }
  return saida;
}

export interface DadosDaArea {
  contato: { nome: string; primeiroNome: string; email: string | null; nascimento: string | null };
  /** A conversa de WhatsApp com a empresa, só para ler: é onde a entrega em texto aconteceu. */
  conversa: FalaDaConversa[];
  /** O "Fale com a gente" de dentro da área. */
  mensagens: MensagemDaArea[];
  diario: EntradaDoDiario[];
  compras: Compra[];
  leitura: Array<{ dia: string; itens: ItemDaLeitura[] }>;
  materiais: Material[];
  servicos: ServicoDaVitrine[];
  /** Os trabalhos comprados com etapas, para a linha do tempo. */
  trabalhos: TrabalhoComEtapas[];
}

/** O nome que aparece no "Olá": o primeiro nome de verdade, ou nada (emoji e "." não são nome). */
export function primeiroNome(nome: string | null | undefined): string {
  const limpo = (nome ?? "").replace(/[^\p{L}\s'-]/gu, " ").trim();
  const primeiro = limpo.split(/\s+/)[0] ?? "";
  if (primeiro.length < 2) return "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/** "2026-10-14T…" → "2026-10-14", no fuso da organização. */
export function diaNoFuso(iso: string, fuso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}

export function agruparLeituraPorDia(itens: ItemDaLeitura[], fuso: string): Array<{ dia: string; itens: ItemDaLeitura[] }> {
  const porDia = new Map<string, ItemDaLeitura[]>();
  for (const i of itens) {
    const dia = diaNoFuso(i.quando, fuso);
    porDia.set(dia, [...(porDia.get(dia) ?? []), i]);
  }
  return [...porDia.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([dia, lista]) => ({ dia, itens: lista.sort((x, y) => (x.quando < y.quando ? -1 : 1)) }));
}

/**
 * O mesmo material mandado duas vezes (mesmo tipo e mesma legenda, com menos de uma hora entre
 * eles) aparece uma vez só — a repetição foi do envio, não do que a pessoa recebeu.
 */
export function semRepeticao(materiais: Material[]): Material[] {
  const vistos = new Map<string, number>();
  const saida: Material[] = [];
  for (const m of [...materiais].sort((a, b) => (a.quando < b.quando ? 1 : -1))) {
    const chave = `${m.tipo}|${m.nome ?? ""}`;
    const t = new Date(m.quando).getTime();
    const anterior = vistos.get(chave);
    if (m.nome !== null && anterior !== undefined && Math.abs(anterior - t) < 3_600_000) continue;
    vistos.set(chave, t);
    saida.push(m);
  }
  return saida;
}

function nomeDoMaterial(m: MensagemComMidia): string | null {
  const legenda = (m.body ?? "").replace(/\s+/g, " ").trim();
  return legenda === "" ? null : legenda.slice(0, 80);
}

export async function carregarDadosDaArea(
  admin: SupabaseClient,
  org: { id: string; fuso: string },
  contactId: string,
): Promise<DadosDaArea> {
  const [contatoR, comprasR, midiasR, servicosR, diarioR, conversaR, mensagensR, comEtapasR, feitasR] = await Promise.all([
    admin
      .from("contacts")
      .select("name, display_name, email, birthdate")
      .eq("id", contactId)
      .eq("organization_id", org.id)
      .maybeSingle(),
    admin
      .from("revenue_ledger")
      .select("id, event_type, amount_cents, currency, occurred_at, metadata, related_event_id")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .order("occurred_at", { ascending: false })
      .limit(100),
    admin
      .from("messages")
      .select("id, type, body, media_mime, media_storage_path, metadata, created_at")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .not("media_storage_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_MIDIAS),
    admin
      .from("area_servicos")
      .select("id, nome, descricao, recebe, preco_cents, currency, destaque")
      .eq("organization_id", org.id)
      .eq("ativo", true)
      .order("posicao", { ascending: true })
      .limit(40),
    admin
      .from("area_diario")
      .select("id, texto, created_at")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("messages")
      .select("id, direction, type, body, media_derived_text, created_at, sent_via")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .in("type", ["text", "audio"])
      .order("created_at", { ascending: false })
      .limit(MAX_FALAS),
    admin
      .from("area_mensagens")
      .select("id, autor, texto, created_at")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: true })
      .limit(200),
    // Todos os serviços, também os fora da vitrine: as etapas valem para quem já comprou.
    admin.from("area_servicos").select("id, nome, etapas").eq("organization_id", org.id).limit(100),
    admin
      .from("area_etapas_feitas")
      .select("servico_id, indice, feita_em")
      .eq("organization_id", org.id)
      .eq("contact_id", contactId)
      .limit(400),
  ]);

  const contato = contatoR.data as {
    name: string | null;
    display_name: string | null;
    email: string | null;
    birthdate: string | null;
  } | null;
  const nome = nomeDoContato(contato) ?? "";

  const lancamentos = (comprasR.data ?? []) as Array<{
    id: string;
    event_type: string;
    amount_cents: number;
    currency: string | null;
    occurred_at: string;
    metadata: Record<string, unknown> | null;
    related_event_id: string | null;
  }>;
  const estornados = new Set(
    lancamentos
      .filter((l) => (l.event_type === "refund" || l.event_type === "chargeback") && l.related_event_id)
      .map((l) => l.related_event_id as string),
  );
  const ajustes = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.event_type === "adjustment" && l.related_event_id) {
      ajustes.set(l.related_event_id, (ajustes.get(l.related_event_id) ?? 0) + l.amount_cents);
    }
  }
  const compras: Compra[] = lancamentos
    // O lançamento anulado por ajuste (ex.: o mesmo comprovante registrado duas vezes) não é compra.
    .filter((l) => l.event_type === "charge" && l.amount_cents + (ajustes.get(l.id) ?? 0) > 0)
    .map((l) => ({
      id: l.id,
      produto: typeof l.metadata?.produto === "string" && l.metadata.produto.trim() !== "" ? l.metadata.produto.trim() : null,
      valor_cents: l.amount_cents,
      currency: l.currency ?? "BRL",
      quando: l.occurred_at,
      estornada: estornados.has(l.id),
    }));

  const midias = (midiasR.data ?? []) as MensagemComMidia[];
  const imagens = midias.filter((m) => classificarMidia(m) === "leitura");
  const assinadas = imagens.length
    ? await admin.storage.from(BUCKET).createSignedUrls(
        imagens.map((m) => m.media_storage_path as string),
        VALIDADE_DO_ARQUIVO_S,
      )
    : { data: [] as Array<{ signedUrl: string | null }> };
  const leituraItens: ItemDaLeitura[] = [];
  imagens.forEach((m, i) => {
    const url = assinadas.data?.[i]?.signedUrl;
    if (url) leituraItens.push({ id: m.id, url, quando: m.created_at });
  });

  const materiais: Material[] = semRepeticao(
    midias
      .filter((m) => classificarMidia(m) === "material")
      .map((m) => {
        const tipo: Material["tipo"] = m.type === "document" ? "documento" : m.type === "audio" ? "audio" : "video";
        return { id: m.id, tipo, nome: nomeDoMaterial(m), quando: m.created_at };
      }),
  );

  const comprados = new Set(compras.filter((c) => !c.estornada && c.produto).flatMap((c) => chavesDoProduto(c.produto as string)));
  const servicos: ServicoDaVitrine[] = ((servicosR.data ?? []) as Array<Omit<ServicoDaVitrine, "ja_comprado">>).map((s) => ({
    ...s,
    ja_comprado: comprados.has(slugDoProduto(s.nome)),
  }));

  const conversa = falasDaConversa(
    (conversaR.data ?? []) as Array<{
      id: string;
      direction: string;
      type: string;
      body: string | null;
      media_derived_text: string | null;
      created_at: string;
      sent_via: string | null;
    }>,
  );
  const mensagens = ((mensagensR.data ?? []) as Array<{ id: string; autor: "cliente" | "equipe"; texto: string; created_at: string }>).map(
    (m) => ({ id: m.id, autor: m.autor, texto: m.texto, quando: m.created_at }),
  );

  const trabalhos = trabalhosComEtapas(
    compras,
    (comEtapasR.data ?? []) as Array<{ id: string; nome: string; etapas: unknown }>,
    (feitasR.data ?? []) as Array<{ servico_id: string; indice: number; feita_em: string }>,
  );

  return {
    trabalhos,
    contato: { nome, primeiroNome: primeiroNome(nome), email: contato?.email ?? null, nascimento: contato?.birthdate ?? null },
    conversa,
    mensagens,
    diario: ((diarioR.data ?? []) as Array<{ id: string; texto: string; created_at: string }>).map((d) => ({
      id: d.id,
      texto: d.texto,
      quando: d.created_at,
    })),
    compras,
    leitura: agruparLeituraPorDia(leituraItens, org.fuso),
    materiais,
    servicos,
  };
}

/** O arquivo de UM material, só se a mensagem for mesmo desta pessoa e for material. */
export async function linkDoMaterial(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  messageId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("messages")
    .select("id, type, media_storage_path, metadata")
    .eq("id", messageId)
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("direction", "outbound")
    .maybeSingle();
  const m = data as Pick<MensagemComMidia, "type" | "media_storage_path" | "metadata"> | null;
  if (!m || classificarMidia(m) !== "material") return null;
  const { data: assinado } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(m.media_storage_path as string, VALIDADE_DO_ARQUIVO_S);
  return assinado?.signedUrl ?? null;
}

/** O link da foto de uma carta do baralho da leitura (`catalog-photos/<org>/leitura/cartas/NN.jpg`). */
export async function fotoDaCarta(admin: SupabaseClient, orgId: string, cartaId: number): Promise<string | null> {
  const { data } = await admin.storage.from(BUCKET_DAS_FOTOS).createSignedUrl(caminhoDaCarta(orgId, cartaId), VALIDADE_DO_ARQUIVO_S);
  return data?.signedUrl ?? null;
}
