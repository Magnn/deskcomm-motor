/**
 * CHAVE RESERVA — quando a chave do agente falha por conta, saldo ou recusa, outra assume.
 *
 * Em 07/10/2026 os seis agentes de uma organização dependiam de UMA chave. O saldo dela acabou por
 * vinte minutos: 733 chamadas falharam, 46 atendimentos morreram — com outras duas chaves de IA
 * ativas e validadas cadastradas na mesma organização, paradas. O produto dizia, no cabeçalho de
 * `providers.ts`, "sem fallback silencioso". Esta rotina é o fallback, e não é silencioso: cada troca
 * vira linha em `llm_calls` (a falha da principal e o sucesso da reserva), log e aviso na Central.
 *
 * ─── Quando a reserva entra ───────────────────────────────────────────────────────────────────────
 * Só em falha que OUTRA CHAVE resolve: conta sem saldo ou no limite, e chave recusada. Provedor fora
 * do ar, modelo inexistente e erro de ferramenta não trocam de chave — a causa não é a chave.
 *
 * ─── Em que ordem ─────────────────────────────────────────────────────────────────────────────────
 *   1. outras chaves do MESMO provedor, da mais antiga para a mais nova, com o MESMO modelo — o
 *      cliente não percebe diferença;
 *   2. chaves de OUTRO provedor, com o modelo padrão do catálogo que aquela chave alcança e que
 *      aceita ferramentas. O tom pode mudar um pouco; ficar mudo é pior.
 *
 * ─── O que NÃO faz ────────────────────────────────────────────────────────────────────────────────
 * Não troca no meio de um turno que já executou ferramenta (a mensagem já saiu; refazer a chamada
 * inteira a mandaria de novo) — quem decide isso é o seam, pelo contador de passos. Não entra quando
 * o ponto tem endereço próprio (`baseUrl`): ali a chave é a daquele endereço. E não usa chave de
 * provedor que o motor não sabe chamar (voz, por exemplo): a consulta devolve, o seam pula.
 */
import type pg from 'pg';

import { byteaToBuffer, decryptKey } from '@/lib/crypto/aes_gcm';

/** Códigos de `normalizarErro` em que trocar de chave pode resolver. */
export const FALHAS_QUE_PEDEM_OUTRA_CHAVE: ReadonlySet<string> = new Set([
  'limite_ou_saldo',
  'credencial_recusada',
]);

/** Quantas reservas uma chamada tenta antes de devolver o erro original. */
export const MAXIMO_DE_RESERVAS_POR_CHAMADA = 3;

export interface ChaveReserva {
  credentialId: string;
  provider: string;
  /** Rótulo que a pessoa deu à chave na tela — vai para o aviso, nunca a chave. */
  rotulo: string | null;
  apiKey: string;
  /** `null` = nenhum modelo do catálogo serve a esta chave; o seam pula. */
  model: string | null;
}

/**
 * As reservas, na ordem em que serão tentadas. `$1` org, `$2` provedor da principal, `$3` modelo da
 * chamada, `$4` credencial que falhou (ou null, quando a principal veio da instalação).
 * Exportada para o teste de invariante rodar a consulta no schema real.
 */
export const CONSULTA_DAS_RESERVAS = `
  select c.id, c.provider, c.label, c.api_key_encrypted, c.api_key_iv, c.api_key_tag,
         case when c.provider = $2 then $3
              else (select m.model_id
                      from ai_models m
                     where m.provider = c.provider
                       and m.supports_tools
                       and m.deprecated_at is null
                       and m.model_id = any(c.models_available)
                     order by m.is_default_for_provider desc,
                              m.input_price_per_million_cents asc nulls last,
                              m.model_id
                     limit 1)
         end as model
    from ai_provider_credentials c
   where c.organization_id = $1
     and c.is_active and c.validated_at is not null
     and ($4::uuid is null or c.id <> $4::uuid)
   order by (c.provider = $2) desc, c.created_at asc
   limit 8`;

interface LinhaDeReserva {
  id: string;
  provider: string;
  label: string | null;
  api_key_encrypted: unknown;
  api_key_iv: unknown;
  api_key_tag: unknown;
  model: string | null;
}

export async function listarChavesDeReserva(
  db: Pick<pg.Pool, 'query'>,
  d: { organizationId: string; provider: string; model: string; credencialQueFalhou: string | null },
): Promise<ChaveReserva[]> {
  const { rows } = await db.query<LinhaDeReserva>(CONSULTA_DAS_RESERVAS, [
    d.organizationId,
    d.provider,
    d.model,
    d.credencialQueFalhou,
  ]);
  const reservas: ChaveReserva[] = [];
  for (const r of rows) {
    let apiKey: string;
    try {
      apiKey = decryptKey({
        ciphertext: byteaToBuffer(r.api_key_encrypted),
        iv: byteaToBuffer(r.api_key_iv),
        tag: byteaToBuffer(r.api_key_tag),
      });
    } catch {
      // Chave que não decifra não é reserva: segue para a próxima.
      continue;
    }
    reservas.push({ credentialId: r.id, provider: r.provider, rotulo: r.label, apiKey, model: r.model });
  }
  return reservas;
}

export const TITULO_DA_RESERVA_EM_USO = 'A chave principal de IA falhou — a reserva assumiu';

/** O corpo do aviso: o que falhou, quem assumiu e o que fazer. Sem nenhum pedaço de chave. */
export function corpoDoAvisoDeReserva(d: {
  provedorPrincipal: string;
  motivo: string;
  provedorReserva: string;
  rotuloReserva: string | null;
  modeloReserva: string;
  mesmoProvedor: boolean;
}): string {
  const causa =
    d.motivo === 'credencial_recusada'
      ? `o provedor ${d.provedorPrincipal} recusou a chave`
      : `a conta do provedor ${d.provedorPrincipal} ficou sem saldo ou bateu no limite`;
  const quem = d.rotuloReserva ? `"${d.rotuloReserva}" (${d.provedorReserva})` : d.provedorReserva;
  const tom = d.mesmoProvedor
    ? 'O modelo é o mesmo; o atendimento segue igual.'
    : `O atendimento segue com o modelo ${d.modeloReserva}, e o tom das respostas pode mudar um pouco.`;
  return (
    `A IA ia ficar sem responder: ${causa}. A chave ${quem} assumiu as chamadas. ${tom} ` +
    'Recarregue ou troque a chave principal em Chaves de acesso à IA — enquanto ela falhar, cada ' +
    'resposta paga uma tentativa perdida antes de a reserva entrar.'
  );
}
