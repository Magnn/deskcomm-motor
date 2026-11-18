import { respostaDePonte } from "@/lib/auth/ponte-de-volta";
import { marcaDaSaida } from "@/lib/branding/saida";
import { FORMATO_DO_ESTADO } from "@/lib/channels/estado-da-volta";

/**
 * A VOLTA do link de cadastro do segundo parceiro.
 *
 * Mesma natureza de `/auth/partner-return`: chega por navegação de outro site
 * (o cookie Strict não vem), é pública e NÃO grava nada. Só repassa à tela de
 * Conexões, por ponte same-origin, o `phone_number_id` (ou o código de erro) —
 * cada valor num formato fixo. Quem conclui é a tela, autenticada, e o servidor
 * confere o estado assinado e de quem é o número no provedor.
 *
 * O estado vai no CAMINHO porque o provedor acrescenta a query dele.
 */
const BASE = "/app/connections?aba=link";
const ID = /^[0-9]{5,30}$/;
const CODIGO = /^[a-z_]{1,60}$/;

function destinoDaVolta(estado: string, params: URLSearchParams): string {
  if (!FORMATO_DO_ESTADO.test(estado)) return BASE;
  const q = new URLSearchParams({ link_estado: estado });
  const erro = params.get("error_code");
  const numero = params.get("phone_number_id");
  if (erro !== null) {
    q.set("link_erro", CODIGO.test(erro) ? erro : "cadastro_falhou");
  } else if (numero && ID.test(numero)) {
    q.set("link_numero", numero);
  } else {
    return BASE;
  }
  return `${BASE}&${q.toString()}`;
}

export async function GET(request: Request, { params }: { params: Promise<{ estado: string }> }) {
  const { estado } = await params;
  const alvo = destinoDaVolta(estado, new URL(request.url).searchParams);
  const marca = await marcaDaSaida(null);
  return respostaDePonte(alvo, marca.nome, "Voltando para suas conexões…");
}
