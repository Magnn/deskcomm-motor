/**
 * GET /api/v1/conversations/[id]/exportar?formato=texto|pdf
 *
 * A conversa inteira num arquivo (montagem em `lib/inbox/exportar-conversa.ts`):
 *   - `texto` → download `.txt`, uma linha por mensagem;
 *   - `pdf`   → página com os balões e as fotos, aberta numa aba, com o botão "Salvar como PDF".
 *
 * Auth: cookie de sessão, agent+ — é dado pessoal do cliente saindo do sistema, e por isso também
 * audita (`conversation.exportada`). A conversa e as mensagens são lidas com o client do PEDIDO (a
 * política de leitura aplica a visibilidade) e com o filtro de organização; só a assinatura das
 * fotos usa service role, sobre caminhos que vieram dessas linhas.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  nomeDoArquivo,
  paginaDaConversa,
  textoDaConversa,
  type MensagemDaExportacao,
} from "@/lib/inbox/exportar-conversa";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fusoUtilizavel } from "@/lib/tempo/fusos";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const BUCKET = "whatsapp-media";
/** A página com as fotos é para salvar na hora; a assinatura não precisa durar mais que isso. */
const VALIDADE_DA_FOTO_S = 6 * 3600;
const PAGINA = 1000;
/** Teto de segurança: uma conversa maior que isto sai cortada, e o cabeçalho conta as que vieram. */
const TETO_DE_MENSAGENS = 20_000;

type Linha = MensagemDaExportacao & { media_storage_path: string | null };

export async function GET(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;

  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  const formato = new URL(req.url).searchParams.get("formato") === "pdf" ? "pdf" : "texto";

  const supabase = await createClient();
  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select("id, contacts(display_name, name, phone_number)")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  if (!convData) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  type Contato = { display_name: string | null; name: string | null; phone_number: string | null };
  // O PostgREST devolve a relação como objeto ou lista de um, conforme o tipo inferido.
  const relacao = (convData as unknown as { contacts: Contato | Contato[] | null }).contacts;
  const contato = Array.isArray(relacao) ? (relacao[0] ?? null) : relacao;

  const mensagens: Linha[] = [];
  for (let de = 0; de < TETO_DE_MENSAGENS; de += PAGINA) {
    const { data, error } = await supabase
      .from("messages")
      .select("direction, type, body, media_derived_text, media_storage_path, sent_via, sent_at, revoked_at")
      .eq("organization_id", org.orgId)
      .eq("conversation_id", id)
      .order("sent_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) return fail("internal_error", error.message, 500, { requestId });
    const lote = (data ?? []) as Linha[];
    mensagens.push(...lote);
    if (lote.length < PAGINA) break;
  }

  if (formato === "pdf") {
    const caminhos = mensagens.filter((m) => m.type === "image" && m.media_storage_path && !m.revoked_at).map((m) => m.media_storage_path!);
    // Só caminhos da própria organização: o caminho canônico começa pelo id dela.
    const daOrg = caminhos.filter((c) => c.startsWith(`${org.orgId}/`));
    if (daOrg.length > 0) {
      const { data: assinadas } = await createAdminClient().storage.from(BUCKET).createSignedUrls(daOrg, VALIDADE_DA_FOTO_S);
      const porCaminho = new Map((assinadas ?? []).filter((a) => a.signedUrl).map((a) => [a.path, a.signedUrl]));
      for (const m of mensagens) if (m.media_storage_path) m.imagemUrl = porCaminho.get(m.media_storage_path) ?? null;
    }
  }

  const { data: orgData } = await supabase.from("organizations").select("timezone").eq("id", org.orgId).maybeSingle();
  const dados = {
    cliente: rotuloDoContato(contato, t),
    telefone: contato?.phone_number ? phoneForDisplay(contato.phone_number) : null,
    fuso: fusoUtilizavel((orgData as { timezone: string | null } | null)?.timezone),
    mensagens,
    geradoEm: new Date(),
    idioma: user.idioma,
  };

  await audit({
    action: "conversation.exportada",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: id,
    requestId,
    metadata: { formato, mensagens: mensagens.length },
  });

  if (formato === "pdf") {
    return new Response(paginaDaConversa(dados), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    });
  }
  return new Response(textoDaConversa(dados), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${nomeDoArquivo(dados.cliente, dados.geradoEm, "txt")}"`,
      "cache-control": "no-store",
      "x-request-id": requestId,
    },
  });
}
