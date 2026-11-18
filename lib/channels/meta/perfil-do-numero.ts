/**
 * Perfil do número oficial pela Graph API: o que o Gerenciador do WhatsApp faz,
 * sem sair do CRM. Nome de exibição, perfil comercial, foto e reverificação por
 * SMS.
 *
 * Existe porque, em 17/11/2026, um número conectado tinha o nome recusado e a
 * verificação vencida, e nada disso tinha conserto pela tela: era preciso abrir
 * a Meta. Toda função aqui é pura sobre `buscar` (o `fetch` injetável), como em
 * `cadastro-incorporado.ts`, e nenhuma devolve ou registra o token ou o código
 * do SMS.
 */
import { z } from "zod";

import { chamar, pinDoNumero, type Buscar } from "@/lib/channels/meta/cadastro-incorporado";
import { graphVersion } from "@/lib/graph-version";

const GRAPH = "https://graph.facebook.com";
const TETO_MS = 30_000;

/** Categorias que a Meta aceita em `vertical` (documentação do perfil comercial). */
export const CATEGORIAS_DO_PERFIL = [
  "UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE",
  "GROCERY", "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL",
  "RESTAURANT", "NOT_A_BIZ",
] as const;

export const FOTO_TIPOS = ["image/jpeg", "image/png"] as const;
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

const site = z.url().max(256).refine((u) => /^https?:\/\//i.test(u), "Use um endereço com http:// ou https://");

/** Os limites são os da Meta: campo maior que isso é recusado lá, com mensagem pior. */
export const perfilComercialSchema = z.object({
  about: z.string().trim().min(1).max(139).optional(),
  description: z.string().trim().max(512).optional(),
  address: z.string().trim().max(256).optional(),
  email: z.union([z.email().max(128), z.literal("")]).optional(),
  websites: z.array(site).max(2).optional(),
  vertical: z.enum(CATEGORIAS_DO_PERFIL).optional(),
});
export type PerfilComercial = z.infer<typeof perfilComercialSchema>;

/** Regra de nome que a Meta aplica antes da análise humana; aqui só o que dá para checar sem ela. */
export const nomeDeExibicaoSchema = z.string().trim().min(3).max(256);
export const codigoSmsSchema = z.string().trim().regex(/^\d{6}$/, "O código tem 6 números.");

export interface EstadoDoNumero {
  telefone: string | null;
  nome: string | null;
  situacaoDoNome: string | null;
  nomePedido: string | null;
  situacaoDoNomePedido: string | null;
  conexao: string | null;
  verificacao: string | null;
  qualidade: string | null;
}

export interface PerfilDoNumero {
  estado: EstadoDoNumero;
  perfil: PerfilComercial & { fotoUrl: string | null };
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };

/** O motivo da Meta numa frase que diz o que fazer. O detalhe original vai junto. */
export function motivoLegivel(motivo: string): string {
  if (/needs to be verified|re-verification/i.test(motivo)) {
    return `o número precisa ser verificado de novo por SMS (use "Enviar código"). Detalhe da Meta: ${motivo}`;
  }
  if (/limit|too many/i.test(motivo) && /name/i.test(motivo)) {
    return `a Meta limita as trocas de nome (10 a cada 30 dias). Detalhe da Meta: ${motivo}`;
  }
  return motivo;
}

const id = (phoneNumberId: string) => encodeURIComponent(phoneNumberId);

export async function lerPerfilDoNumero(
  p: { phoneNumberId: string; token: string },
  buscar: Buscar = fetch,
): Promise<Resultado<PerfilDoNumero>> {
  const numero = await chamar<{
    display_phone_number?: string; verified_name?: string; name_status?: string; new_display_name?: string;
    new_name_status?: string; status?: string; code_verification_status?: string; quality_rating?: string;
  }>(buscar, id(p.phoneNumberId), {
    parametros: {
      fields:
        "display_phone_number,verified_name,name_status,new_display_name,new_name_status,status,code_verification_status,quality_rating",
    },
    token: p.token,
  });
  if (!numero.ok) return { ok: false, motivo: motivoLegivel(numero.motivo) };

  const perfil = await chamar<{ data?: Array<Record<string, unknown>> }>(
    buscar,
    `${id(p.phoneNumberId)}/whatsapp_business_profile`,
    { parametros: { fields: "about,address,description,email,profile_picture_url,websites,vertical" }, token: p.token },
  );
  if (!perfil.ok) return { ok: false, motivo: motivoLegivel(perfil.motivo) };
  const bruto = perfil.corpo?.data?.[0] ?? {};
  const texto = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  const n = numero.corpo ?? {};
  // O nome que a Meta está analisando — do NÚMERO, não de contato.
  const nomeNovo = n.new_display_name;

  return {
    ok: true,
    valor: {
      estado: {
        telefone: n.display_phone_number ?? null,
        nome: n.verified_name ?? null,
        situacaoDoNome: n.name_status ?? null,
        nomePedido: nomeNovo ?? null,
        situacaoDoNomePedido: n.new_name_status ?? null,
        conexao: n.status ?? null,
        verificacao: n.code_verification_status ?? null,
        qualidade: n.quality_rating ?? null,
      },
      perfil: {
        about: texto(bruto.about),
        description: texto(bruto.description),
        address: texto(bruto.address),
        email: texto(bruto.email),
        websites: Array.isArray(bruto.websites) ? bruto.websites.filter((w): w is string => typeof w === "string") : undefined,
        vertical: CATEGORIAS_DO_PERFIL.find((c) => c === bruto.vertical),
        fotoUrl: texto(bruto.profile_picture_url) ?? null,
      },
    },
  };
}

export async function salvarPerfilComercial(
  p: { phoneNumberId: string; token: string; perfil: PerfilComercial; fotoHandle?: string },
  buscar: Buscar = fetch,
): Promise<Resultado<null>> {
  const parametros: Record<string, string> = { messaging_product: "whatsapp" };
  for (const [chave, valor] of Object.entries(p.perfil)) {
    if (valor === undefined) continue;
    // A Graph lê lista em parâmetro de formulário como JSON.
    parametros[chave] = Array.isArray(valor) ? JSON.stringify(valor) : String(valor);
  }
  if (p.fotoHandle) parametros.profile_picture_handle = p.fotoHandle;
  const r = await chamar(buscar, `${id(p.phoneNumberId)}/whatsapp_business_profile`, {
    metodo: "POST",
    parametros,
    token: p.token,
  });
  return r.ok ? { ok: true, valor: null } : { ok: false, motivo: motivoLegivel(r.motivo) };
}

export async function pedirNovoNome(
  p: { phoneNumberId: string; token: string; nome: string },
  buscar: Buscar = fetch,
): Promise<Resultado<null>> {
  const r = await chamar(buscar, id(p.phoneNumberId), {
    metodo: "POST",
    parametros: { new_display_name: p.nome },
    token: p.token,
  });
  return r.ok ? { ok: true, valor: null } : { ok: false, motivo: motivoLegivel(r.motivo) };
}

export async function pedirCodigo(
  p: { phoneNumberId: string; token: string },
  buscar: Buscar = fetch,
): Promise<Resultado<null>> {
  const r = await chamar(buscar, `${id(p.phoneNumberId)}/request_code`, {
    metodo: "POST",
    parametros: { code_method: "SMS", language: "pt_BR" },
    token: p.token,
  });
  return r.ok ? { ok: true, valor: null } : { ok: false, motivo: motivoLegivel(r.motivo) };
}

export async function conferirCodigo(
  p: { phoneNumberId: string; token: string; codigo: string },
  buscar: Buscar = fetch,
): Promise<Resultado<null>> {
  const r = await chamar(buscar, `${id(p.phoneNumberId)}/verify_code`, {
    metodo: "POST",
    parametros: { code: p.codigo },
    token: p.token,
  });
  return r.ok ? { ok: true, valor: null } : { ok: false, motivo: motivoLegivel(r.motivo) };
}

/**
 * Registra o número sem perguntar se já está na Cloud API. É o passo que a Meta
 * exige depois de aprovar um nome novo (até 14 dias) e depois de reverificar por
 * SMS; `garantirNumeroRegistrado` pula número que já está lá.
 */
export async function registrarNumero(
  p: { phoneNumberId: string; token: string; segredoDoPin: string },
  buscar: Buscar = fetch,
): Promise<Resultado<null>> {
  const r = await chamar(buscar, `${id(p.phoneNumberId)}/register`, {
    metodo: "POST",
    parametros: { messaging_product: "whatsapp", pin: pinDoNumero(p.phoneNumberId, p.segredoDoPin) },
    token: p.token,
  });
  return r.ok ? { ok: true, valor: null } : { ok: false, motivo: motivoLegivel(r.motivo) };
}

/**
 * Sobe a foto pelo upload retomável da Meta e devolve o handle que vai em
 * `profile_picture_handle`. O app é o do próprio token (`GET /app`), salvo quando
 * a sessão já sabe por qual app entrou.
 */
export async function enviarFoto(
  p: { token: string; appId: string | null; bytes: Uint8Array; tipo: (typeof FOTO_TIPOS)[number] },
  buscar: Buscar = fetch,
): Promise<Resultado<string>> {
  if (p.bytes.byteLength === 0 || p.bytes.byteLength > FOTO_MAX_BYTES) {
    return { ok: false, motivo: "a foto precisa ter até 5 MB" };
  }
  let appId = p.appId;
  if (!appId) {
    const app = await chamar<{ id?: string }>(buscar, "app", { parametros: { fields: "id" }, token: p.token });
    if (!app.ok || !app.corpo?.id) return { ok: false, motivo: app.motivo || "não foi possível descobrir o app do token" };
    appId = app.corpo.id;
  }

  const sessao = await chamar<{ id?: string }>(buscar, `${encodeURIComponent(appId)}/uploads`, {
    metodo: "POST",
    parametros: {
      file_name: p.tipo === "image/png" ? "perfil.png" : "perfil.jpg",
      file_length: String(p.bytes.byteLength),
      file_type: p.tipo,
    },
    token: p.token,
  });
  if (!sessao.ok || !sessao.corpo?.id) return { ok: false, motivo: sessao.motivo || "a Meta não abriu o envio da foto" };

  // O envio do arquivo não aceita formulário: o corpo é o próprio arquivo.
  let res: Response;
  try {
    res = await buscar(`${GRAPH}/${graphVersion()}/${sessao.corpo.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${p.token}`, file_offset: "0", "Content-Type": p.tipo },
      body: p.bytes as unknown as BodyInit,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    return { ok: false, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
  const corpo = (await res.json().catch(() => null)) as { h?: string; error?: { message?: string } } | null;
  if (!res.ok || !corpo?.h) return { ok: false, motivo: corpo?.error?.message ?? `http_${res.status}` };
  return { ok: true, valor: corpo.h };
}
