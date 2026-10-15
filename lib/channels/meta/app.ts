/**
 * O app da Meta DESTA INSTALAÇÃO — o App Secret que assina a entrega e o verify
 * token que responde ao handshake do webhook.
 *
 * ─── Por que INSTALAÇÃO, e não organização ──────────────────────────────────
 *
 * Um App da Meta atende N WABAs de N organizações (modelo Tech Provider): o
 * segredo e o verify token são do APP, não do número. É o mesmo objeto de
 * `platform_google_oauth` (migration 0201) e de `platform_branding` (0155), e
 * este arquivo é um clone declarado do molde do primeiro.
 *
 * A organização continua vindo do TOKEN NO PATH, nunca do corpo — quem amarra o
 * payload a um tenant é a sessão do canal, como o cabeçalho da rota do webhook
 * estabelece desde a issue #236.
 *
 * ─── Por que o `.env` continua sendo lido ───────────────────────────────────
 *
 * O `.env` é o PISO DE ROLLBACK: o `agent.sh` do kit, em falha de update,
 * reverte só a IMAGEM — não o schema. Ou seja, o rollback põe código antigo
 * sobre banco novo por construção, e é o caminho inverso que dói aqui: código
 * NOVO sobre banco que ainda não tem a 0257 (clone que não atualizou, `db push`
 * que falhou). Com o `.env` intacto, a entrega continua sendo aceita em vez de
 * parar de existir no pior momento possível.
 *
 * BANCO PRIMEIRO, `.env` COMO FALLBACK — a mesma ordem de
 * `lib/channels/<provider>/credentials.ts`: no contrário, um env esquecido
 * silenciaria a configuração feita pela tela e o operador não entenderia por que
 * nada mudou.
 *
 * ─── As duas fontes NÃO se misturam ─────────────────────────────────────────
 *
 * O par só é servido inteiro, da mesma origem. Segredo do `.env` com verify
 * token do banco é um app que não existe: a Meta aceita o handshake (feito com
 * o token dela) e toda entrega passa a morrer em `401 invalid_signature` —
 * exatamente a falha SILENCIOSA que a issue #850 mediu, agora difícil de ver
 * porque metade da configuração parece certa.
 *
 * ─── Nunca lança ────────────────────────────────────────────────────────────
 *
 * Esta função é chamada a CADA entrega da Meta. Um throw aqui é 500 no webhook,
 * e a Meta reentrega em backoff um evento que nunca vai melhorar. Toda falha de
 * leitura degrada para o ambiente, e o motivo vai ao log.
 */

import { graphVersion } from "@/lib/graph-version";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

/** O que a instalação tem em vigor. Campo nulo = não configurado nessa fonte. */
export interface AppDaMetaEmVigor {
  readonly appSecret: string | null;
  readonly verifyToken: string | null;
  /**
   * O ID do app — o que o SDK do Facebook e o `oauth/access_token` pedem junto
   * do segredo. Vem da MESMA fonte que o segredo (ver `idsDoApp`).
   */
  readonly appId: string | null;
  /** As configurações do "Login do Facebook para Empresas" deste app, por uso. */
  readonly whatsappConfigId: string | null;
  readonly messengerConfigId: string | null;
  readonly adsConfigId: string | null;
}

/** O ID do app e as configurações de login — o que NÃO é segredo. */
type IdsDoApp = Pick<AppDaMetaEmVigor, "appId" | "whatsappConfigId" | "messengerConfigId" | "adsConfigId">;

/** Os nomes das variáveis, para a tela poder dizer exatamente o que falta. */
export const VARIAVEIS_DO_APP_DA_META = ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"] as const;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * O que o AMBIENTE traz — puro, síncrono, sem banco.
 *
 * Separado de propósito: ser síncrono e sem banco mantém testável o que é regra
 * pura (precedência, vazio-como-ausente), e é este objeto que o aviso do
 * primeiro acesso consulta através de `fontesDoAppDaMeta()`.
 */
export function appDaMetaDoAmbiente(
  source: Record<string, string | undefined> = process.env,
): AppDaMetaEmVigor {
  // `.trim()` e não `Boolean()`: o contrato do `.env` deste projeto é que vazio é
  // ausente — o template gera `CHAVE=` —, e `Boolean("   ")` é TRUE. Mesma
  // decisão de `metaPodeReceber` (`lib/channels/meta/webhook.ts`).
  const appSecret = texto(source.META_APP_SECRET);
  const verifyToken = texto(source.META_WEBHOOK_VERIFY_TOKEN);
  return { appSecret: appSecret || null, verifyToken: verifyToken || null, ...idsDoAmbiente(source) };
}

function idsDoAmbiente(source: Record<string, string | undefined>): IdsDoApp {
  return {
    appId: texto(source.META_APP_ID) || null,
    whatsappConfigId: texto(source.META_WHATSAPP_CONFIG_ID) || null,
    messengerConfigId: texto(source.META_MESSENGER_CONFIG_ID) || null,
    adsConfigId: texto(source.META_ADS_CONFIG_ID) || null,
  };
}

/**
 * Memo de processo com TTL, cópia declarada de `lib/agenda/google/config.ts`.
 *
 * Mora no `globalThis` e não num `let` deste módulo — a diferença não é estilo:
 * o Turbopack instancia o mesmo módulo DUAS vezes no mesmo processo (entrada de
 * rota e entrada de página carregam runtimes diferentes), e um `let` daria dois
 * memos que não se invalidam. Já medido neste repo.
 *
 * O que se memoriza é o PAR JÁ RESOLVIDO, e não a linha do banco: assim uma
 * rajada de entregas da Meta não paga uma ida ao banco por evento. 30s é abaixo
 * do que uma pessoa espera antes de concluir "não salvou", e acima do intervalo
 * entre dois eventos de um mesmo lote.
 */
const TTL_MS = 30_000;

declare global {
  // eslint-disable-next-line no-var
  var __memoDoAppDaMeta: { readonly valor: AppDaMetaEmVigor; readonly expiraEm: number } | null | undefined;
}

/** Chamada por quem ESCREVE a credencial — a server action do /admin. */
export function invalidarAppDaMeta(): void {
  globalThis.__memoDoAppDaMeta = null;
}

interface LinhaDoApp {
  app_secret_encrypted: string | null;
  verify_token_encrypted: string | null;
  app_id?: string | null;
  whatsapp_config_id?: string | null;
  messenger_config_id?: string | null;
  ads_config_id?: string | null;
}

const COLUNAS_DOS_SEGREDOS = "app_secret_encrypted, verify_token_encrypted";
/** Migration 0927. */
const COLUNAS_DOS_IDS = "app_id, whatsapp_config_id, messenger_config_id, ads_config_id";

/** Nunca lança: devolve `null` quando não há linha utilizável. */
async function linhaDoBanco(): Promise<LinhaDoApp | null> {
  try {
    const ler = (colunas: string) =>
      createAdminClient().from("platform_meta_app").select(colunas).eq("id", 1).maybeSingle();
    let { data, error } = await ler(`${COLUNAS_DOS_SEGREDOS}, ${COLUNAS_DOS_IDS}`);
    // Banco sem a 0927 (rollback de imagem, `update.sh` que falhou): as colunas
    // dos ids não existem, e isso não pode derrubar o segredo que já está aqui.
    if (error?.code === "42703") ({ data, error } = await ler(COLUNAS_DOS_SEGREDOS));
    // Clone que ainda não aplicou a 0257 devolve 42P01 aqui. Isso NÃO é erro
    // desta instalação — é o piso de rollback funcionando, e o `.env` assume.
    if (error) {
      logger.info("[meta.app] sem credencial no banco; vale o .env", { codigo: error.code });
      return null;
    }
    return (data as LinhaDoApp | null) ?? null;
  } catch (err) {
    logger.warn("[meta.app] leitura do banco falhou; vale o .env", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * O par do banco, ou `null` — e `null` também quando só METADE dele serve.
 *
 * Meia credencial é indistinguível de nenhuma para quem entrega: com o verify
 * token e sem o segredo o handshake passa e TODA mensagem morre em 401; com o
 * segredo e sem o token o webhook nunca é aceito. Nos dois casos o desfecho
 * certo é o piso (o `.env` inteiro), não um par remendado.
 */
async function parDoBanco(
  linha: LinhaDoApp | null,
): Promise<Pick<AppDaMetaEmVigor, "appSecret" | "verifyToken"> | null> {
  const segredoCifrado = texto(linha?.app_secret_encrypted);
  const tokenCifrado = texto(linha?.verify_token_encrypted);
  if (!segredoCifrado || !tokenCifrado) return null;

  const admin = createAdminClient();
  const appSecret = texto(await decryptWebhookSecret(admin, segredoCifrado));
  const verifyToken = texto(await decryptWebhookSecret(admin, tokenCifrado));
  if (!appSecret || !verifyToken) {
    // Chave mestra trocada, linha corrompida, cifra indisponível. NÃO mistura
    // com o `.env`: cai inteiro para ele.
    logger.warn("[meta.app] credencial do banco não decifrou; vale o .env inteiro");
    return null;
  }
  return { appSecret, verifyToken };
}

/**
 * A configuração em vigor — banco primeiro, `.env` como piso. Nunca lança.
 *
 * Devolve os dois campos possivelmente nulos (instalação sem app configurado):
 * é o estado real de um deploy novo, e quem chama decide — a rota responde 403
 * no handshake e 401 na entrega, que é o desfecho de hoje.
 */
export async function appDaMeta(): Promise<AppDaMetaEmVigor> {
  const memo = globalThis.__memoDoAppDaMeta;
  if (memo && memo.expiraEm > Date.now()) return memo.valor;

  const linha = await linhaDoBanco();
  const par = await parDoBanco(linha);
  const valor: AppDaMetaEmVigor = par ? { ...par, ...idsDoApp(linha) } : appDaMetaDoAmbiente();
  globalThis.__memoDoAppDaMeta = { valor, expiraEm: Date.now() + TTL_MS };
  return valor;
}

/**
 * O ID do app que acompanha o segredo DO BANCO.
 *
 * Com `app_id` gravado, tudo vem da linha — inclusive configuração vazia, que
 * significa "este app não tem login para isso". As configurações do `.env` são
 * de OUTRO app (o antigo) e abririam a janela da Meta com um `config_id` que o
 * app novo não conhece.
 *
 * Sem `app_id` gravado vale o `.env` para os ids: é a instalação que cadastrou
 * só a chave pela tela (o estado de antes da 0927), e mudar isso seria mudar o
 * comportamento de quem não mexeu em nada. Quem grava um `app_id` novo é
 * obrigado, pela action, a gravar a chave dele no mesmo save.
 */
function idsDoApp(linha: LinhaDoApp | null): IdsDoApp {
  const appId = texto(linha?.app_id);
  if (!appId) return idsDoAmbiente(process.env);
  return {
    appId,
    whatsappConfigId: texto(linha?.whatsapp_config_id) || null,
    messengerConfigId: texto(linha?.messenger_config_id) || null,
    adsConfigId: texto(linha?.ads_config_id) || null,
  };
}

/**
 * Só o que NÃO é segredo — para a tela de `/admin/meta`, que não decifra nada
 * (vigiado em `tests/unit/app-da-meta-tela-nao-devolve-segredo.test.tsx`).
 * Mesma regra de `appDaMeta()` para os ids. Nunca lança.
 */
export async function idsDoAppDaMeta(): Promise<IdsDoApp> {
  return idsDoApp(await linhaDoBanco());
}

/**
 * As mesmas chaves do `.env`, com os VALORES em vigor — para quem lê por nome de
 * variável, como `metaPodeReceber`.
 *
 * ⚠️ Existe para o aviso do primeiro acesso parar de mentir: ele perguntava só
 * ao ambiente, e depois da 0257 isso diria "não dá para receber pelo canal
 * oficial" a quem acabou de configurar pela tela — mandando o dono editar um
 * arquivo que ele não precisa abrir.
 *
 * `undefined` para o que falta, e não string vazia: é o contrato de
 * `Record<string, string | undefined>` que o leitor espera.
 */
export async function fontesDoAppDaMeta(): Promise<Record<string, string | undefined>> {
  const { appSecret, verifyToken } = await appDaMeta();
  return {
    META_APP_SECRET: appSecret ?? undefined,
    META_WEBHOOK_VERIFY_TOKEN: verifyToken ?? undefined,
  };
}

/**
 * A chave e o ID são do MESMO app? A Graph responde ao token de app
 * (`id|segredo`) só quando os dois casam — e devolve o nome, que a tela mostra
 * para o dono conferir que é o app certo.
 *
 * Token no CORPO, nunca na URL (CLAUDE.md, anti-pattern 12): `POST` com
 * `method=GET`, como em `./cadastro-incorporado.ts`.
 */
export async function conferirParDoAppNaMeta(
  appId: string,
  appSecret: string,
): Promise<{ ok: true; nome: string | null } | { ok: false; motivo: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(appId)}`, {
      method: "POST",
      body: new URLSearchParams({ method: "GET", fields: "id,name", access_token: `${appId}|${appSecret}` }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const corpo = (await res.json().catch(() => null)) as
      | { id?: string; name?: string; error?: { message?: string } }
      | null;
    if (!res.ok || corpo?.error || String(corpo?.id ?? "") !== appId) {
      return { ok: false, motivo: corpo?.error?.message ?? `http_${res.status}` };
    }
    return { ok: true, nome: corpo?.name ?? null };
  } catch (err) {
    return { ok: false, motivo: `rede indisponível: ${err instanceof Error ? err.message : "erro"}` };
  }
}

