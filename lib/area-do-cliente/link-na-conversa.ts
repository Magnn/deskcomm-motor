/**
 * O LINK DA ÁREA DO CLIENTE DENTRO DA CONVERSA.
 *
 * ─── Por quê ─────────────────────────────────────────────────────────────────────────────────────
 * Medido em 17/10/2026: 50 pessoas tinham pago e nenhuma tinha recebido o link da área. A tela gera os
 * links em lote, mas só devolve uma lista para alguém mandar à mão — e o link é pessoal, então uma
 * campanha (o mesmo texto para todas) não serve.
 *
 * ─── Como ────────────────────────────────────────────────────────────────────────────────────────
 * Quem já comprou e ainda não recebeu o link pela conversa recebe o link no fim da PRIMEIRA resposta da
 * agente depois da compra: o código anexa `paragrafoDoLinkDaArea` (com a marca `[[AREA_DO_CLIENTE]]`), e só NA
 * HORA DO ENVIO `linkDaAreaNoLugarDaMarca` cria o convite (o mesmo da rota `POST /api/v1/area/convites`: token novo, o banco guarda só o hash) e troca
 * a marca pelo link. Link que não sai não é criado. O envio fica registrado como `convite_criado` com
 * `ref = 'conversa'`, e é esse registro que faz o bloco sumir dos turnos seguintes: uma vez por pessoa.
 *
 * Falha alto: área desligada, quem não pagou ou convite que não grava recusa o envio com a instrução —
 * a marca crua nunca chega à pessoa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerConfigDaArea } from "./config";
import { registrarEvento } from "./eventos";
import { gerarToken, hashDoToken } from "./token";
import { VALIDADE_DO_CONVITE_DIAS, caminhoPublicoDaArea } from "./vocabulario";

export const MARCA_DA_AREA = "[[AREA_DO_CLIENTE]]";
/** O `ref` do convite criado pela conversa — distingue do criado à mão na tela. */
export const REF_DA_CONVERSA = "conversa";

export function temMarcaDaArea(texto: string): boolean {
  return texto.includes(MARCA_DA_AREA);
}

/**
 * JÁ COMPROU — o produto principal (`pago`) ou qualquer cobrança avulsa (`extra:<nome>`, ex. "Corte de Laços",
 * "Pergunta nova"). Até 30/10/2026 só `pago` contava: medido em 10 dias, 17 de 43 compradoras (todas de avulsos
 * pela Stripe) nunca podiam receber o link, embora a área mostre o que elas compraram. Pura.
 */
export function jaComprou(tags: readonly string[]): boolean {
  return tags.includes("pago") || tags.some((t) => t.startsWith("extra:"));
}

/**
 * O LINK SAI PELO CÓDIGO, não pelo juízo do modelo. Até 30/10/2026 a agente recebia a instrução de mandar o
 * link "numa resposta em que a conversa estiver tranquila" — e a conversa de quem compra quase nunca está:
 * medido em 10 dias, 1 de 26 compradoras elegíveis recebeu o link. Agora o parágrafo vai anexado ao fim da
 * primeira resposta depois da compra. Texto fixo, curto, sem oferta. Puro.
 */
export function paragrafoDoLinkDaArea(): string {
  return `Separei um cantinho só seu, com o que você comprou e cada etapa pra ir acompanhando: ${MARCA_DA_AREA}`;
}

/**
 * A resposta pode levar o link no fim? Não quando ela cobra (código Pix, link de pagamento ou valor): o link da
 * área ao lado de uma cobrança confunde qual dos dois tocar. Também não quando a agente já escreveu a marca. Pura.
 */
export function respostaAceitaOLinkDaArea(corpo: string): boolean {
  if (temMarcaDaArea(corpo)) return false;
  return !/(^|\s)000201|buy\.stripe\.com|checkout|\bpix\b|R\$\s?\d/i.test(corpo);
}

/**
 * Esta pessoa deve receber o bloco? Área ligada, já pagou, e nunca recebeu o link pela conversa.
 * Nunca lança: na dúvida, o bloco não entra.
 */
export async function podeReceberOLinkDaArea(
  admin: SupabaseClient,
  args: { organizationId: string; contactId: string; tags: readonly string[] },
): Promise<boolean> {
  if (!jaComprou(args.tags)) return false;
  try {
    const [{ data: org }, { data: jaEnviado }] = await Promise.all([
      admin.from("organizations").select("settings").eq("id", args.organizationId).maybeSingle(),
      admin
        .from("area_eventos")
        .select("id")
        .eq("organization_id", args.organizationId)
        .eq("contact_id", args.contactId)
        .eq("tipo", "convite_criado")
        .eq("ref", REF_DA_CONVERSA)
        .limit(1),
    ]);
    if (!lerConfigDaArea((org as { settings?: unknown } | null)?.settings).ativo) return false;
    return (jaEnviado ?? []).length === 0;
  } catch {
    return false;
  }
}

/** Troca a marca pelo link pessoal, criando o convite agora. `{ recusa }` = não envie. */
export async function linkDaAreaNoLugarDaMarca(args: {
  corpo: string;
  admin: SupabaseClient;
  organizationId: string;
  contactId: string;
  tags: readonly string[];
  /** A origem pública da instalação (`NEXT_PUBLIC_APP_URL`). */
  origem: string | undefined;
}): Promise<{ corpo: string } | { recusa: string }> {
  if (!temMarcaDaArea(args.corpo)) return { corpo: args.corpo };
  const recusa = (motivo: string) => ({
    recusa: `${motivo} Reescreva a mensagem SEM a marca ${MARCA_DA_AREA}.`,
  });
  if (!jaComprou(args.tags)) return recusa("O link da área é só de quem já comprou.");
  const origem = (args.origem ?? "").replace(/\/+$/, "");
  if (!/^https:\/\//.test(origem)) return recusa("A instalação não tem endereço público para o link.");

  const { data: org } = await args.admin.from("organizations").select("slug, settings").eq("id", args.organizationId).maybeSingle();
  const slug = (org as { slug?: string } | null)?.slug;
  if (!slug || !lerConfigDaArea((org as { settings?: unknown } | null)?.settings).ativo) {
    return recusa("A área do cliente está desligada nesta empresa.");
  }

  const token = gerarToken();
  const { error } = await args.admin.from("area_convites").insert({
    organization_id: args.organizationId,
    contact_id: args.contactId,
    token_hash: hashDoToken(token),
    criado_por: null,
    expires_at: new Date(Date.now() + VALIDADE_DO_CONVITE_DIAS * 86_400_000).toISOString(),
  });
  if (error) return recusa("O link da área não pôde ser criado agora.");
  await registrarEvento(args.admin, {
    organizationId: args.organizationId,
    contactId: args.contactId,
    tipo: "convite_criado",
    ref: REF_DA_CONVERSA,
  });

  const apelido = lerConfigDaArea((org as { settings?: unknown } | null)?.settings).apelido;
  const link = `${origem}${caminhoPublicoDaArea(slug, apelido)}/entrar/${token}`;
  return { corpo: args.corpo.split(MARCA_DA_AREA).join(link) };
}
