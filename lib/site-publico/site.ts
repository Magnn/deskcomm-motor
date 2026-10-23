import { branding } from "@/lib/branding";
import { env } from "@/lib/env";
import { planosAtivos, planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { precoLegivel } from "@/lib/planos/catalogo";

/**
 * O SITE PÚBLICO da instalação: o que buscadores e assistentes de IA podem ler.
 *
 * Só a instalação que VENDE o serviço (`PLANS_ENFORCED=true`) se apresenta ao mundo. Uma instalação
 * self-host de uma empresa qualquer segue invisível como sempre foi (`noindex` no layout raiz): o CRM
 * dela não é produto à venda, e indexá-la exporia a tela de login de um cliente nosso no Google.
 *
 * Medido em 23/10/2026 na instalação do AcassIA: `<meta name="robots" content="noindex, nofollow">` em
 * TODAS as páginas, inclusive a de vendas, `/robots.txt` e `/sitemap.xml` em 404 e `/llms.txt` com 307
 * para o login — nenhum buscador nem IA podia ler o que o serviço é.
 */
export function siteIndexavel(): boolean {
  return planosAtivos();
}

/** O endereço público, sem barra no fim — base de canonical, sitemap e JSON-LD. */
export function urlDoSite(): string {
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
}

/** O `robots` de uma página pública: indexável só onde `siteIndexavel()`. */
export function robotsDaPaginaPublica() {
  return siteIndexavel()
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" as const } }
    : { index: false, follow: false };
}

/**
 * Os fatos do serviço numa forma que um assistente de IA consegue citar — a mesma fonte para o
 * `llms.txt`, o JSON-LD e os guias, para que nenhum deles diga uma coisa diferente do outro.
 * Nada aqui é escrito à mão por instalação: nome vem da marca, preço do catálogo.
 */
export function fatosDoServico() {
  const nome = branding().name;
  const planos = planosDaInstalacao();
  const maisBarato = planos.reduce<(typeof planos)[number] | null>(
    (menor, p) => (menor === null || p.precoMensalCentavos < menor.precoMensalCentavos ? p : menor),
    null,
  );
  return {
    nome,
    url: urlDoSite(),
    resumo: `${nome} é uma plataforma brasileira de atendimento e vendas pelo WhatsApp com agentes de IA: o agente responde cada cliente na hora, tira dúvidas, apresenta a oferta, negocia dentro dos limites definidos pela empresa, envia o link de pagamento e passa a conversa para uma pessoa da equipe quando precisa.`,
    categoria: "Plataforma de atendimento e vendas por WhatsApp com agentes de IA (CRM conversacional)",
    canais: ["WhatsApp (API oficial da Meta ou QR code)", "Instagram", "Messenger", "Telegram", "chat do site"],
    recursos: [
      "Agentes de IA que atendem, qualificam e vendem pelo WhatsApp, 24 horas por dia",
      "Caixa de entrada única para WhatsApp, Instagram, Messenger, Telegram e chat do site",
      "Passagem para um atendente humano com todo o contexto da conversa",
      "Conexão do WhatsApp oficial pela conta do Facebook, sem copiar token",
      "Funil de vendas (CRM) que avança conforme a conversa",
      "Lembretes de retorno para quem sumiu e campanhas para a base, respeitando quem pediu para não receber",
      "Envio da venda para o Meta Ads (API de Conversões) para otimizar anúncios",
      "Equipe sem limite de usuários",
    ],
    paraQuem: [
      "negócios que vendem pelo WhatsApp e recebem mais mensagens do que a equipe consegue responder",
      "quem anuncia no Instagram/Facebook com botão para o WhatsApp",
      "infoprodutores, prestadores de serviço, clínicas, lojas e agências",
    ],
    planos: planos.map((p) => ({
      nome: p.nome,
      precoMensal: precoLegivel(p.precoMensalCentavos),
      precoCentavos: p.precoMensalCentavos,
      numeros: p.numeros,
      conversasMensais: p.conversasMensais,
    })),
    aPartirDe: maisBarato ? precoLegivel(maisBarato.precoMensalCentavos) : null,
    gratisParaTestar: "Criar a conta, montar o agente e o funil é grátis; o plano mensal só é cobrado ao conectar um número de WhatsApp. Sem fidelidade.",
    idioma: "Português do Brasil",
    pais: "Brasil",
  };
}

export type FatosDoServico = ReturnType<typeof fatosDoServico>;
