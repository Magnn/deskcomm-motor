/**
 * A configuração da área do cliente de uma organização: mora em
 * `organizations.settings.area` (jsonb), escrita só por
 * `PUT /api/v1/area/config` (manager+).
 *
 * Desligada por padrão: a página pública responde "não encontrada" até a
 * empresa ligar — ninguém descobre uma área vazia por adivinhar o endereço.
 */
import { z } from "zod";

import { MOEDAS_INTERNACIONAIS, precoInternacionalSchema } from "@/lib/preco/tipos";

import { caminhoDaMidiaSchema } from "./midia";
import { FORMA_DO_SLUG_DA_AREA } from "./vocabulario";

export const configDaAreaSchema = z.strictObject({
  ativo: z.boolean().default(false),
  /**
   * O ENDEREÇO PÚBLICO da área: `/c/<apelido>` abre a mesma área que `/c/<slug>`. O slug da organização
   * costuma ser o nome de quem criou a conta, e não se troca (é a chave do cookie, do app instalado e dos
   * links já enviados); o apelido é o nome que vai em anúncio e em link novo. Único na instalação —
   * conferido no PUT contra os slugs e os apelidos das outras organizações.
   */
  apelido: z
    .string()
    .trim()
    .toLowerCase()
    .regex(FORMA_DO_SLUG_DA_AREA, "só letras minúsculas, números e hífen (ex.: cigana-esmeralda)")
    .optional(),
  /** Título no topo da área. Vazio = o nome de exibição da organização. */
  titulo: z.string().trim().max(60).optional(),
  /** A frase abaixo do "Olá". */
  boas_vindas: z.string().trim().max(200).optional(),
  /**
   * O número do botão "Falar com a gente", só dígitos com DDI. Fica AQUI e não
   * no canal: quando o número muda (ou cai), muda num lugar só e nenhum cliente
   * fica sem contato.
   */
  whatsapp: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, "só números, com DDI e DDD (ex.: 5569999999999)")
    .optional(),
  /**
   * Mostra a carta do dia (o baralho da leitura, `lib/leitura/baralho.ts`). Só
   * faz sentido para quem tem as fotos das cartas no Storage — por isso desligada
   * por padrão.
   */
  carta_do_dia: z.boolean().optional(),
  /**
   * O Círculo: a assinatura mensal da área (conteúdo do mês + uma pergunta por
   * mês, pela IA). Cobra pela Stripe da organização; desligado por padrão.
   */
  circulo: z
    .strictObject({
      ativo: z.boolean().default(false),
      nome: z.string().trim().min(1).max(40).default("Círculo"),
      preco_cents: z.number().int().min(100).max(1_000_000).default(2900),
    })
    .optional(),
  /** O presente: uma pergunta de tarô que o cliente compra para dar a alguém. */
  presente: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(1700),
    })
    .optional(),
  /**
   * O QUIZ DA SINASTRIA ("Vocês combinam?", `lib/area-do-cliente/sinastria.ts`, migration 0942): vendido direto na
   * página, sem WhatsApp. `pixel_id`: o conjunto de dados da Meta só desta página, para as vendas dela não se
   * misturarem às do atendimento.
   */
  sinastria_quiz: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(3700),
      pixel_id: z.string().regex(/^\d{8,20}$/).optional(),
      /** Preço para quem abre a página fora do Brasil (`moeda-do-visitante.ts`). Sem ele, só reais. */
      precos_internacionais: z.array(precoInternacionalSchema).max(MOEDAS_INTERNACIONAIS.length).optional(),
      /** Vídeos da guia (`midia.ts`, 0946): no meio do quiz (o mecanismo) e na prévia (a oferta). */
      video_meio: caminhoDaMidiaSchema.optional(),
      video_previa: caminhoDaMidiaSchema.optional(),
    })
    .optional(),
  /**
   * Os QUIZZES de uma pessoa (`lib/area-do-cliente/quizzes.ts`, migration 0943), vendidos na página como a
   * sinastria, cada um com o seu preço e o seu conjunto de dados da Meta.
   */
  quiz_prosperidade: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(2700),
      pixel_id: z.string().regex(/^\d{8,20}$/).optional(),
      /** Preço para quem abre a página fora do Brasil (`moeda-do-visitante.ts`). Sem ele, só reais. */
      precos_internacionais: z.array(precoInternacionalSchema).max(MOEDAS_INTERNACIONAIS.length).optional(),
      /** Vídeos da guia (`midia.ts`, 0946): no meio do quiz (o mecanismo) e na prévia (a oferta). */
      video_meio: caminhoDaMidiaSchema.optional(),
      video_previa: caminhoDaMidiaSchema.optional(),
    })
    .optional(),
  quiz_caminhos: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(1900),
      pixel_id: z.string().regex(/^\d{8,20}$/).optional(),
      /** Preço para quem abre a página fora do Brasil (`moeda-do-visitante.ts`). Sem ele, só reais. */
      precos_internacionais: z.array(precoInternacionalSchema).max(MOEDAS_INTERNACIONAIS.length).optional(),
      /** Vídeos da guia (`midia.ts`, 0946): no meio do quiz (o mecanismo) e na prévia (a oferta). */
      video_meio: caminhoDaMidiaSchema.optional(),
      video_previa: caminhoDaMidiaSchema.optional(),
    })
    .optional(),
  /** O Retrato do Par (`lib/area-do-cliente/retrato-do-par.ts`, migration 0945): Vênus + Descendente. */
  quiz_par: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(2700),
      pixel_id: z.string().regex(/^\d{8,20}$/).optional(),
      /** Preço para quem abre a página fora do Brasil (`moeda-do-visitante.ts`). Sem ele, só reais. */
      precos_internacionais: z.array(precoInternacionalSchema).max(MOEDAS_INTERNACIONAIS.length).optional(),
      /** Vídeos da guia (`midia.ts`, 0946): no meio do quiz (o mecanismo) e na prévia (a oferta). */
      video_meio: caminhoDaMidiaSchema.optional(),
      video_previa: caminhoDaMidiaSchema.optional(),
    })
    .optional(),
  /**
   * A GUIA dos quizzes (a personagem que conduz): nome e foto (caminho no bucket `area-midia`, 0946). A foto aparece
   * no topo do quiz, nas frases entre capítulos e na tela de cálculo — como nos funis de quiz que escalam.
   */
  guia: z
    .strictObject({
      nome: z.string().trim().max(40).optional(),
      foto: caminhoDaMidiaSchema.optional(),
    })
    .optional(),
  /**
   * DEPOIMENTOS de clientes, mostrados abaixo da oferta dos quizzes (como nos funis que escalam). Só de clientes
   * reais e com autorização — a tela não inventa nenhum. `quiz` limita o depoimento a um quiz; sem ele, vale para
   * todos. `video` é um caminho no bucket `area-midia` (0946).
   */
  depoimentos: z
    .array(
      z.strictObject({
        nome: z.string().trim().min(1).max(40),
        texto: z.string().trim().min(1).max(400),
        cidade: z.string().trim().max(40).optional(),
        quiz: z.enum(["sinastria", "prosperidade", "caminhos", "par"]).optional(),
        video: caminhoDaMidiaSchema.optional(),
      }),
    )
    .max(12)
    .optional(),
  /** O Ano Pessoal: a leitura do ano, oferecida na janela do aniversário. */
  ano_pessoal: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_cents: z.number().int().min(100).max(1_000_000).default(4700),
    })
    .optional(),
  /**
   * A Mesa de leituras (`lib/area-do-cliente/leituras.ts`): leitura automática paga na área. A primeira de
   * cada modalidade sai por `preco_primeira_cents`; as seguintes por `preco_cents`. `limite_por_dia` conta as
   * pagas no dia. Desligada por padrão.
   */
  leituras: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_primeira_cents: z.number().int().min(100).max(1_000_000).default(500),
      preco_cents: z.number().int().min(100).max(1_000_000).default(1490),
      limite_por_dia: z.number().int().min(1).max(20).default(3),
      /** Narrar a leitura pela voz do próprio servidor (`VOZ_PROPRIA_*` no `.env`). */
      narrar: z.boolean().default(false),
      /** Com que voz: `rapida` (Kokoro, na hora) ou `humana` (Chatterbox, em fila, alguns minutos). */
      narrar_com: z.enum(["rapida", "humana"]).default("rapida"),
      /** A voz humana: uma voz clonada no servidor (`clone_…`); vazia = a voz padrão do serviço. */
      voz_humana: z.string().trim().max(80).regex(/^(clone_[A-Za-z0-9]+)?$/).optional(),
    })
    .optional(),
  /**
   * Os créditos (`lib/area-do-cliente/creditos.ts`): uma carteira para tudo na área. A pessoa compra um dos
   * `pacotes` e paga as leituras com créditos; o Círculo dá `circulo_mensal` créditos a cada mês pago.
   * Desligados por padrão.
   */
  creditos: z
    .strictObject({
      ativo: z.boolean().default(false),
      pacotes: z
        .array(
          z.strictObject({
            creditos: z.number().int().min(1).max(10_000),
            preco_cents: z.number().int().min(100).max(1_000_000),
          }),
        )
        .min(1)
        .max(4)
        .default([
          { creditos: 30, preco_cents: 3000 },
          { creditos: 70, preco_cents: 6000 },
          { creditos: 130, preco_cents: 10000 },
        ]),
      circulo_mensal: z.number().int().min(0).max(1000).default(30),
    })
    .optional(),
  /**
   * O aviso diário no celular (`lib/area-do-cliente/avisos.ts`): quem instalar a área e permitir recebe UM
   * aviso por dia, na `hora` do relógio da empresa. Desligado por padrão.
   */
  avisos: z
    .strictObject({
      ativo: z.boolean().default(false),
      hora: z.number().int().min(6).max(21).default(8),
    })
    .optional(),
  /**
   * As SIMPATIAS (`lib/area-do-cliente/simpatias.ts`, migration 0941): o passo a passo de cada uma, para fazer em
   * casa, e o serviço "o templo faz por mim", pago à parte por `preco_feita_cents`. `so_assinantes`: com o Círculo
   * ligado, o passo a passo é de quem está no Círculo; os outros veem o título e o convite. Desligado por padrão.
   */
  simpatias: z
    .strictObject({
      ativo: z.boolean().default(false),
      preco_feita_cents: z.number().int().min(100).max(1_000_000).default(2700),
      so_assinantes: z.boolean().default(true),
    })
    .optional(),
  /**
   * A CONTRIBUIÇÃO VOLUNTÁRIA: valor livre, a partir de `minimo_cents`. Não libera nada nem muda o atendimento —
   * por isso é separada do serviço pago (que tem preço e entrega). Desligada por padrão.
   */
  contribuicao: z
    .strictObject({
      ativo: z.boolean().default(false),
      minimo_cents: z.number().int().min(100).max(100_000).default(500),
    })
    .optional(),
  /** Cor principal da área, em hex. Vazio = a cor do produto. */
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "cor em hex, ex.: #7c3aed")
    .optional(),
});
export type ConfigDaArea = z.infer<typeof configDaAreaSchema>;

export const CONFIG_PADRAO_DA_AREA: ConfigDaArea = { ativo: false };

/** Lê `settings.area` sem nunca lançar: config ruim = área desligada. */
export function lerConfigDaArea(settings: unknown): ConfigDaArea {
  const bruto = (settings as { area?: unknown } | null)?.area;
  const lido = configDaAreaSchema.safeParse(bruto ?? {});
  return lido.success ? lido.data : CONFIG_PADRAO_DA_AREA;
}

export const COR_PADRAO_DA_AREA = "#7c3aed";
