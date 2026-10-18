/**
 * "CONECTAR COM STRIPE" — a conta Stripe da empresa, criada sob a plataforma desta instalação (Stripe Connect).
 *
 * Por que existe: a venda da empresa cliente não pode passar pela conta Stripe da instalação — isso seria
 * guardar dinheiro de terceiro (e os termos da Stripe proíbem conta comum processando venda alheia). Com a
 * conta conectada, a cobrança nasce NA CONTA DA EMPRESA: o dinheiro cai no banco dela, reembolso e contestação
 * saem do saldo dela, e a instalação recebe só a taxa da plataforma, descontada na própria cobrança.
 *
 * O tipo de conta é o de "Dashboard completo" da Stripe (`controller[stripe_dashboard][type]=full`): a empresa
 * tem login próprio na Stripe, paga as tarifas da Stripe direto (`fees.payer=account`), a Stripe responde pelas
 * perdas da conta perante a plataforma (`losses.payments=stripe`) e cuida do cadastro (`requirement_collection=
 * stripe`). É o que deixa a plataforma FORA de reembolso e contestação — o tipo "Express" faria a plataforma
 * responder por eles.
 *
 * Todas as chamadas usam a chave da INSTALAÇÃO (a mesma conta que cobra os planos). A conta da empresa vai no
 * cabeçalho `Stripe-Account` quando a chamada é sobre ela (ver `CredencialStripe.conta`).
 */
import { criarChamadaDaStripe, ErroDaStripe, type CredencialStripe } from "./stripe";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ContaConectada {
  id: string;
  /** A Stripe liberou a conta para receber (`charges_enabled`). */
  pronta: boolean;
  /** A pessoa terminou de enviar o cadastro (`details_submitted`). Pode estar enviado e ainda em análise. */
  cadastroEnviado: boolean;
  /** O Pix está ativo na conta da empresa. A empresa ativa na própria Stripe (Configurações › Formas de pagamento). */
  pixAtivo: boolean;
}

function lerConta(objeto: Record<string, unknown>): ContaConectada {
  const id = String(objeto.id ?? "");
  if (!id.startsWith("acct_"))
    throw new ErroDaStripe("recusada", "a Stripe não devolveu a conta conectada");
  const capacidades = (objeto.capabilities ?? {}) as Record<string, unknown>;
  return {
    id,
    pronta: objeto.charges_enabled === true,
    cadastroEnviado: objeto.details_submitted === true,
    pixAtivo: capacidades.pix_payments === "active",
  };
}

export function criarStripeConnect(
  cred: Pick<CredencialStripe, "chave">,
  opts: { fetch?: Fetch } = {},
) {
  const chamar = criarChamadaDaStripe({ chave: cred.chave }, opts);

  return {
    /**
     * Cria a conta da empresa. A referência (id da organização) torna a criação idempotente por 24 h na
     * Stripe: dois cliques no botão não criam duas contas.
     */
    async criarConta(p: {
      organizationId: string;
      email: string | null;
      nome: string | null;
    }): Promise<ContaConectada> {
      const campos: Record<string, string | number | boolean> = {
        country: "BR",
        "controller[stripe_dashboard][type]": "full",
        "controller[fees][payer]": "account",
        "controller[losses][payments]": "stripe",
        "controller[requirement_collection]": "stripe",
        "capabilities[card_payments][requested]": true,
        "metadata[organization_id]": p.organizationId,
      };
      if (p.email) campos.email = p.email;
      if (p.nome) campos["business_profile[name]"] = p.nome.slice(0, 100);
      return lerConta(
        await chamar("POST", "/accounts", campos, `conta-conectada-${p.organizationId}`),
      );
    },

    /** O endereço do cadastro da Stripe para a empresa preencher (vale alguns minutos e uma visita só). */
    async linkDeCadastro(conta: string, p: { voltar: string; renovar: string }): Promise<string> {
      const link = await chamar("POST", "/account_links", {
        account: conta,
        type: "account_onboarding",
        return_url: p.voltar,
        refresh_url: p.renovar,
      });
      if (typeof link.url !== "string" || !link.url.startsWith("https://")) {
        throw new ErroDaStripe("recusada", "a Stripe abriu o cadastro sem endereço");
      }
      return link.url;
    },

    /** O estado da conta na Stripe agora: pronta para receber? Pix ativo? */
    async lerConta(conta: string): Promise<ContaConectada> {
      return lerConta(await chamar("GET", `/accounts/${encodeURIComponent(conta)}`));
    },
  };
}
