import type { FatosDoServico } from "./site";

/**
 * Os GUIAS do site público: respostas diretas às perguntas que donos de negócio fazem ao Google e aos
 * assistentes de IA antes de escolher uma ferramenta ("como colocar IA no WhatsApp", "API oficial ou QR
 * code", "quanto custa").
 *
 * Forma pensada para ser citada: a resposta vem no primeiro parágrafo (`resposta`), as seções são
 * curtas e factuais, e as perguntas viram `FAQPage` no JSON-LD. Nada de número inventado — preço sai do
 * catálogo (`fatos.planos`), e o que se afirma sobre a Meta é o que a própria Meta publica.
 *
 * O texto é conteúdo em português (como as páginas legais), não frase de tela: por isso mora aqui e
 * não no dicionário de i18n.
 */
export interface Guia {
  slug: string;
  titulo: string;
  descricao: string;
  /** A resposta curta, no topo — o trecho que um buscador ou uma IA cita. */
  resposta: string;
  secoes: { titulo: string; paragrafos: string[] }[];
  perguntas: { pergunta: string; resposta: string }[];
  /** ISO-8601 (data). Atualize ao mudar o conteúdo — entra no sitemap e no JSON-LD. */
  atualizadoEm: string;
}

function listaDePlanos(fatos: FatosDoServico): string {
  return fatos.planos
    .map((p) => `${p.nome}: ${p.precoMensal}/mês, ${p.numeros === 1 ? "1 número" : `${p.numeros} números`} de WhatsApp${p.conversasMensais > 0 ? `, ${p.conversasMensais.toLocaleString("pt-BR")} conversas atendidas pela IA por mês` : ""}`)
    .join("; ");
}

export function guias(fatos: FatosDoServico): Guia[] {
  const { nome } = fatos;
  return [
    {
      slug: "agente-de-ia-no-whatsapp",
      titulo: "Agente de IA no WhatsApp: o que é e como colocar um para vender",
      descricao:
        "Como funciona um agente de IA que atende e vende pelo WhatsApp, o que ele faz melhor que um chatbot de menu e o passo a passo para colocar um no ar.",
      resposta: `Um agente de IA no WhatsApp é um atendente virtual que entende o que o cliente escreve (inclusive áudio), responde na hora com base no que a empresa ensinou, conduz a conversa até a compra e chama uma pessoa quando precisa. Para colocar um no ar: crie a conta numa plataforma como o ${nome}, ensine o agente sobre seus produtos e regras de preço, conecte o número de WhatsApp e libere o agente depois de testar.`,
      secoes: [
        {
          titulo: "O que um agente de IA faz numa conversa de venda",
          paragrafos: [
            "Responde em segundos, a qualquer hora, inclusive de madrugada e no fim de semana — quando a maior parte dos leads de anúncio chega.",
            "Tira dúvidas sobre produto, prazo e forma de pagamento usando o material que a empresa cadastrou, em vez de respostas prontas de menu.",
            "Apresenta a oferta, negocia dentro dos limites definidos (desconto máximo, parcelas, bônus) e envia o link de pagamento.",
            "Faz o retorno de quem parou de responder e registra cada passo no funil de vendas (CRM).",
          ],
        },
        {
          titulo: "Onde a pessoa da equipe continua essencial",
          paragrafos: [
            "Um bom agente sabe quando não deve seguir sozinho: reclamação, pedido fora do roteiro, negociação acima do limite ou cliente que pede para falar com alguém. Nesses casos ele passa a conversa para a equipe com o histórico inteiro, e a pessoa continua de onde parou.",
          ],
        },
        {
          titulo: "Passo a passo para colocar no ar",
          paragrafos: [
            "1. Crie a conta e descreva o negócio: o que vende, para quem, por quanto e o que não pode ser prometido.",
            "2. Cadastre o material de apoio (catálogo, perguntas frequentes, política de troca) para o agente consultar.",
            "3. Defina as regras de venda: preço, descontos permitidos e quando chamar um humano.",
            "4. Conecte o número de WhatsApp — pela API oficial da Meta ou por QR code.",
            "5. Teste o agente em modo de teste, ajuste o tom e só então libere para os clientes.",
          ],
        },
      ],
      perguntas: [
        {
          pergunta: "Agente de IA no WhatsApp é a mesma coisa que chatbot?",
          resposta:
            "Não. O chatbot tradicional segue um menu fixo de opções; o agente de IA entende texto livre e áudio, responde com base no conhecimento da empresa e conduz a conversa até a venda, chamando uma pessoa quando precisa.",
        },
        {
          pergunta: "O agente de IA pode mandar link de pagamento?",
          resposta: `Pode. No ${nome}, o agente envia o link de pagamento quando o cliente decide comprar e respeita o preço e os descontos que a empresa configurou.`,
        },
        {
          pergunta: "Preciso saber programar?",
          resposta: "Não. A configuração é feita pela tela: descrever o negócio, cadastrar o material e conectar o número.",
        },
      ],
      atualizadoEm: "2026-10-23",
    },
    {
      slug: "whatsapp-api-oficial-ou-qr-code",
      titulo: "WhatsApp API oficial ou QR code: qual usar no atendimento com IA",
      descricao:
        "Diferenças entre conectar o WhatsApp pela API oficial da Meta (Cloud API) e por QR code: custo, risco de bloqueio, recursos e quando usar cada um.",
      resposta:
        "A API oficial da Meta (WhatsApp Cloud API) é o caminho aprovado pela Meta: mais estável, com selo de empresa possível e mensagens de modelo para falar fora da janela de 24 horas, cobradas pela Meta. A conexão por QR code usa o aplicativo comum e não tem custo da Meta, mas não é oficial e tem mais risco de bloqueio do número em envio em volume. Para atender quem chama, os dois funcionam; para disparo em volume, use a API oficial.",
      secoes: [
        {
          titulo: "API oficial (WhatsApp Cloud API)",
          paragrafos: [
            "É a conexão oficial da Meta para empresas. Responder a quem mandou mensagem dentro da janela de 24 horas é gratuito; iniciar conversa fora dela exige modelo de mensagem aprovado, cobrado pela Meta conforme a tabela de preços dela.",
            `No ${nome}, a conexão é feita pela própria conta do Facebook, em poucos cliques, sem copiar token nem configurar nada no painel da Meta. Também é possível manter o aplicativo WhatsApp Business no celular junto com a plataforma (coexistência).`,
          ],
        },
        {
          titulo: "QR code",
          paragrafos: [
            "Liga o número lendo um QR code, como no WhatsApp Web. É rápido e não tem cobrança da Meta por mensagem, mas não é um canal oficial: envio em massa ou fora do padrão aumenta o risco de o número ser bloqueado.",
          ],
        },
        {
          titulo: "Qual escolher",
          paragrafos: [
            "Anúncio com botão para o WhatsApp e atendimento de quem chama: os dois servem; a API oficial dá mais segurança ao número principal.",
            "Campanhas para a base e retorno depois de 24 horas: API oficial, com modelos aprovados.",
            "Teste rápido ou número secundário: QR code.",
          ],
        },
      ],
      perguntas: [
        {
          pergunta: "Posso usar o número que já tenho na API oficial?",
          resposta:
            "Pode. Pela coexistência, o número continua no aplicativo WhatsApp Business do celular e passa a ser atendido também pela plataforma.",
        },
        {
          pergunta: "Quem paga as mensagens da API oficial?",
          resposta: `As mensagens que a Meta cobra são pagas direto à Meta, pela conta da empresa. O plano do ${nome} não inclui esse valor.`,
        },
      ],
      atualizadoEm: "2026-10-23",
    },
    {
      slug: "chatbot-ou-agente-de-ia",
      titulo: "Chatbot de menu ou agente de IA: qual vende mais no WhatsApp",
      descricao:
        "Comparação prática entre chatbot de fluxo (menu de opções) e agente de IA no atendimento de vendas pelo WhatsApp.",
      resposta:
        "Para vender, o agente de IA costuma ir mais longe que o chatbot de menu porque entende perguntas livres, áudio e objeções, e responde como uma pessoa. O chatbot de menu é previsível e barato, e funciona bem para triagem simples (\"digite 1 para financeiro\"). O mais comum hoje é combinar os dois: um fluxo curto para entrada e o agente de IA para conversar e fechar.",
      secoes: [
        {
          titulo: "Chatbot de menu (fluxo)",
          paragrafos: [
            "Segue um caminho desenhado com botões e opções. É bom para coletar dados fixos e direcionar setores. Quando o cliente sai do roteiro — uma dúvida diferente, um áudio, uma objeção de preço — ele trava ou repete o menu.",
          ],
        },
        {
          titulo: "Agente de IA",
          paragrafos: [
            "Entende linguagem natural, consulta o material da empresa e decide a próxima resposta. Lida com objeção, negocia dentro de limites e manda o link de pagamento. Precisa de regras claras (o que pode prometer, desconto máximo, quando chamar humano) e de acompanhamento nas primeiras semanas.",
          ],
        },
        {
          titulo: "Como combinar",
          paragrafos: [
            `No ${nome} dá para ter os dois: um fluxo de entrada (boas-vindas, coleta de dados) e o agente de IA assumindo a conversa, com passagem para a equipe quando precisa.`,
          ],
        },
      ],
      perguntas: [
        {
          pergunta: "Agente de IA erra?",
          resposta:
            "Pode errar, como qualquer atendente. Por isso a plataforma deixa definir limites (preço, desconto, o que não prometer) e passa a conversa para uma pessoa nos casos fora do roteiro.",
        },
      ],
      atualizadoEm: "2026-10-23",
    },
    {
      slug: "quanto-custa-atendimento-com-ia-no-whatsapp",
      titulo: "Quanto custa um atendimento com IA no WhatsApp",
      descricao: `Os custos de colocar um agente de IA no WhatsApp: plano da plataforma, mensagens da Meta e taxas, com os preços do ${nome}.`,
      resposta: `O custo tem três partes: o plano da plataforma (no ${nome}, a partir de ${fatos.aPartirDe ?? "um valor mensal fixo"} por mês), as mensagens que a Meta cobra na API oficial (pagas direto à Meta) e, se houver, a taxa por venda recebida pela plataforma. ${fatos.gratisParaTestar}`,
      secoes: [
        {
          titulo: `Planos do ${nome}`,
          paragrafos: [
            `${listaDePlanos(fatos)}.`,
            "Todos incluem equipe sem limite de usuários, agentes, funis e campanhas. O plano é mensal, sem fidelidade.",
          ],
        },
        {
          titulo: "Mensagens da Meta",
          paragrafos: [
            "Na API oficial, responder dentro da janela de 24 horas de quem chamou não é cobrado; mensagens de modelo para iniciar conversa são cobradas pela Meta conforme a tabela dela. Pelo QR code não há cobrança da Meta.",
          ],
        },
        {
          titulo: "Comparando com um atendente",
          paragrafos: [
            "Um atendente humano cobre um turno; o agente de IA responde a qualquer hora e várias conversas ao mesmo tempo. A conta que importa é quantas vendas a mais saem de responder em segundos, inclusive à noite, contra o valor do plano.",
          ],
        },
      ],
      perguntas: [
        {
          pergunta: `Preciso pagar para testar o ${nome}?`,
          resposta: fatos.gratisParaTestar,
        },
        {
          pergunta: "Existe cobrança por usuário da equipe?",
          resposta: "Não. A equipe não tem limite de usuários em nenhum plano.",
        },
      ],
      atualizadoEm: "2026-10-23",
    },
    {
      slug: "como-escolher-crm-com-ia-para-whatsapp",
      titulo: "Como escolher um CRM com IA para vender pelo WhatsApp",
      descricao:
        "Checklist do que olhar ao escolher uma plataforma de atendimento e vendas no WhatsApp com inteligência artificial.",
      resposta:
        "Olhe sete pontos: se a IA conversa de verdade (texto livre e áudio) ou só segue menu; se passa para humano com contexto; se conecta a API oficial da Meta sem complicação; se o funil de vendas anda sozinho com a conversa; se faz retorno de quem sumiu; se manda a venda de volta para o Meta Ads; e se o preço é previsível (sem cobrança por usuário).",
      secoes: [
        {
          titulo: "Checklist",
          paragrafos: [
            "1. IA conversacional: entende pergunta livre, áudio e objeção, e responde com o conhecimento da sua empresa.",
            "2. Limites configuráveis: preço, desconto máximo e o que o agente não pode prometer.",
            "3. Passagem para humano com o histórico, sem o cliente repetir tudo.",
            "4. WhatsApp oficial conectado pela conta do Facebook, e opção de manter o app no celular.",
            "5. Funil de vendas integrado à conversa, com motivo de perda registrado.",
            "6. Retorno automático para quem parou de responder, respeitando quem pediu para sair.",
            "7. Conversões enviadas ao Meta Ads, para o anúncio aprender com quem compra.",
          ],
        },
        {
          titulo: `Onde o ${nome} se encaixa`,
          paragrafos: [
            `O ${nome} foi feito para negócios brasileiros que vendem pelo WhatsApp: cobre os sete pontos acima, em português, com equipe sem limite de usuários e planos mensais sem fidelidade.`,
          ],
        },
      ],
      perguntas: [
        {
          pergunta: "CRM com IA serve para pequeno negócio?",
          resposta:
            "Serve, principalmente para quem recebe mais mensagens do que consegue responder ou perde venda por demorar. O plano de entrada atende um número de WhatsApp.",
        },
      ],
      atualizadoEm: "2026-10-23",
    },
  ];
}

export function guiaPorSlug(fatos: FatosDoServico, slug: string): Guia | null {
  return guias(fatos).find((g) => g.slug === slug) ?? null;
}
