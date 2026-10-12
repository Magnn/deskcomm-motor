/**
 * O ENDEREÇO A PARTIR DO CEP — o banco exige o endereço de quem paga para registrar um boleto, e pedir rua,
 * número, cidade e estado numa conversa é pedir demais. Com o CEP, o resto vem da base pública dos Correios
 * (ViaCEP), sem chave e sem cadastro.
 *
 * Só é chamado quando o agente emite um boleto na conversa (`lib/agent-engine/agent/boleto-no-envio.ts`).
 * Falha de rede ou CEP inexistente devolvem `null`: quem chama pede o CEP de novo, nunca inventa endereço.
 */
export interface EnderecoDoCep {
  cep: string;
  logradouro: string;
  cidade: string;
  uf: string;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const BASE = "https://viacep.com.br/ws";

export async function enderecoDoCep(cep: string, opts: { fetch?: Fetch } = {}): Promise<EnderecoDoCep | null> {
  const digitos = cep.replace(/\D/g, "");
  if (digitos.length !== 8) return null;
  const buscar: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  try {
    const resposta = await buscar(`${BASE}/${digitos}/json/`, { method: "GET", signal: AbortSignal.timeout(6_000) });
    if (!resposta.ok) return null;
    const j = (await resposta.json().catch(() => null)) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string } | null;
    if (!j || j.erro || !j.localidade || !j.uf) return null;
    // CEP geral de cidade pequena não tem rua: o bairro, ou o nome da cidade, ocupa o lugar.
    const logradouro = (j.logradouro || j.bairro || j.localidade).trim();
    return { cep: digitos, logradouro, cidade: j.localidade.trim(), uf: j.uf.trim().toUpperCase() };
  } catch {
    return null;
  }
}
