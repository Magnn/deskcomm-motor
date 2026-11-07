/**
 * O DESENHO da área do cliente, separado da busca de dados (`page.tsx`).
 *
 * Recebe tudo pronto — textos traduzidos, datas no fuso, dinheiro formatado — e
 * só desenha. Por isso dá para ver a área inteira com dados de exemplo, sem
 * banco nem sessão: é assim que a tela é provada antes de ir ao ar.
 */
import type { CSSProperties } from "react";
import { ArrowUpRight, BookOpen, Check, FileText, Film, Headphones, MessageCircle, Receipt, Sparkles } from "lucide-react";

import { recadoDaEmpresa, type DadosDaArea } from "@/lib/area-do-cliente/dados";
import type { IdiomaDaArea } from "@/lib/i18n/area";
import type { CeuDoNascimento } from "@/lib/area-do-cliente/ceu";
import type { MensagemDoChat } from "@/lib/area-do-cliente/chat";
import type { PassoDoRitual } from "@/lib/area-do-cliente/ritual";
import type { DestaqueDeHoje } from "@/lib/area-do-cliente/hoje";
import { faseDaLua } from "@/lib/area-do-cliente/lua";
import { PERGUNTAS_DO_FOCO, type Foco } from "@/lib/area-do-cliente/perfil";

import { SeletorDeIdiomaDaArea } from "./_idioma";
import {
  AniversarioDoCliente,
  CartaDoDia,
  DesejoDoCliente,
  DiarioDoCliente,
  EmailDoCliente,
  EntrarNaArea,
  TituloDaSecao,
  VitrineObservada,
  type TextosDaArea,
} from "./_client";
import { AbasDaArea, BotaoIrParaAba, type AbaDaArea } from "./_abas";
import { SimboloDaArea } from "./_simbolo";
import { ChatDaArea, type TextosDoChat } from "./_chat";
import { CreditosNoTopo, RitualDeHoje, type TextosDoRitual } from "./_ritual";
import { AvisoDiario, type TextosDoAviso } from "./_aviso";
import { CarteiraDeCreditos, type CarteiraInicial, type TextosDaCarteira } from "./_carteira";
import { CirculoDoCliente } from "./_circulo";
import { EntradaDaArea, type TextosDaEntrada } from "./_entrada";
import { GrimorioDaArea, type CartaNoGrimorio, type TextosDoGrimorio } from "./_grimorio";
import { LuaDoMes, type TextosDaLuaDoMes } from "./_lua-do-mes";
import { EtapaDeHoje, EtapasDaArea, LinhasDoTempo, type TextosDasEtapas } from "./_etapas";
import { LeituraDaMaoNaArea, type MaoInicial, type TextosDaMao } from "./_mao";
import { SonhosNaArea, type SonhoInicial, type TextosDoSonho } from "./_sonho";
import { ConviteDaManha, ManhaDoCliente, type TextosDaManha } from "./_manha";
import { VelaDoCliente, type TextosDaVela } from "./_vela";
import type { VelaNaArea } from "@/lib/area-do-cliente/intencao";
import { PlanoSemanalDoCliente, type PlanoSemanalNaArea, type TextosDoPlano } from "./_plano-semanal";
import { MeditacaoDaSemana, type MeditacaoNaArea, type TextosDaMeditacao } from "./_meditacao";
import { MesaDeLeituras, type MesaInicial, type TextosDaMesa } from "./_mesa";
import { LuaDeHoje } from "./_lua";
import { AnoPessoalDoCliente, PresenteDoCliente, type TextosDasOfertas } from "./_ofertas";
import { ContribuicaoDoCliente, SimpatiasDoCliente, type PedidoNaArea, type SimpatiaNaArea, type TextosDasSimpatias } from "./_simpatias";
import { CARTAO, CARTAO_NOTURNO, CEU, DETALHE, OURO, PAGINA, SERIF, SOBRETITULO, SOBRETITULO_NOTURNO, TEXTO_SUAVE } from "./_tema";
import { temaDaIlustracao } from "./_ilustracoes";
import type { LeituraDoMapaInicial, TextosDaLeituraDoMapa } from "./_leitura-do-mapa";
import type { LeituraDoQuizNaArea } from "@/lib/area-do-cliente/leitura-do-quiz";
import { LeiturasDoQuiz, type TextosDasLeiturasDoQuiz } from "./_leituras-do-quiz";
import { MapaAstral, type TextosDoMapa } from "./_mapa";
import { MemoriasDaArea } from "./_memorias";
import { CartaoDaVitrine, DestaqueDaLoja, LinhaDaVitrine, Prateleira } from "./_vitrine";

type Traduzir = (texto: string) => string;

const ICONE_DO_MATERIAL = { documento: FileText, audio: Headphones, video: Film } as const;

/** O brilho da cor da empresa no alto do céu. */
export function brilho(cor: string): CSSProperties {
  return { background: `radial-gradient(120% 70% at 50% -10%, ${cor}8c, transparent 70%)` };
}

export interface VistaDeEntradaProps {
  classeDaFonte: string;
  slug: string;
  cor: string;
  titulo: string;
  t: Traduzir;
  tx: TextosDaArea;
  link?: string;
  whatsapp?: string;
  /** Quem ainda não tem área começa pela descoberta: o primeiro quiz ligado na empresa (a conta nasce na compra). */
  comecar?: string | null;
}

/** Quem chega sem sessão: o céu, o nome da empresa e o pedido do e-mail. */
export function VistaDeEntrada({ classeDaFonte, slug, cor, titulo, t, tx, link, whatsapp, comecar }: VistaDeEntradaProps) {
  return (
    <main className={`${classeDaFonte} ${PAGINA}`}>
      <header className={`${CEU} px-5 pb-24 pt-16 text-center`}>
        <div className="pointer-events-none absolute inset-0" style={brilho(cor)} />
        <div className="relative mx-auto max-w-md">
          <div className="flex justify-center">
            <LuaDeHoje quando={new Date()} tamanho={64} />
          </div>
          <h1 className={`${SERIF} mt-5 text-[34px] leading-tight`}>{titulo}</h1>
          <p className={`mt-2 ${SOBRETITULO_NOTURNO}`}>{t("Sua área de cliente")}</p>
        </div>
      </header>
      <div className="relative mx-auto -mt-16 max-w-md px-4 pb-16">
        {link === "vencido" || link === "invalido" ? (
          <p className="mb-4 rounded-3xl border border-[#c9a54e]/40 bg-[#c9a54e]/10 px-5 py-4 text-[15px] text-[#f0d79a]" data-testid="area-link-recusado">
            {link === "vencido"
              ? t("Este link de acesso venceu. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")
              : t("Este link de acesso não vale mais. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")}
          </p>
        ) : null}
        <div className="[&>div]:mt-0">
          <EntrarNaArea slug={slug} cor={OURO} tx={tx} />
        </div>
        {comecar ? (
          <a
            href={comecar}
            className="mt-6 block rounded-3xl border border-white/10 bg-white/[0.04] px-5 py-4 text-center transition hover:bg-white/[0.07]"
            data-testid="area-entrada-comecar"
          >
            <span className="block text-[15px] text-[#c3bad3]">{t("Ainda não tem a sua área?")}</span>
            <span className="mt-1 block text-[16px] font-semibold" style={{ color: OURO }}>
              {t("Comece pela sua descoberta")} →
            </span>
          </a>
        ) : null}
        {whatsapp ? (
          <p className="mt-8 text-center text-[15px] text-[#c3bad3]">
            {t("Não cadastrou e-mail?")}{" "}
            <a className="font-semibold underline underline-offset-4" style={{ color: OURO }} href={`https://wa.me/${whatsapp}`}>
              {t("Peça seu link pelo WhatsApp")}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}

export interface VistaDaAreaProps {
  /** O idioma em que a área está sendo lida (`lib/i18n/area.ts`) — a troca fica no rodapé. */
  idioma: IdiomaDaArea;
  classeDaFonte: string;
  slug: string;
  fuso: string;
  /** A tag de idioma das datas (`pt-BR`, `es`…). */
  tag: string;
  cor: string;
  titulo: string;
  boasVindas?: string;
  whatsapp?: string;
  /** "Área oficial de …": a marca, ou razão social com CNPJ. */
  assinatura: string;
  agora: Date;
  t: Traduzir;
  tx: TextosDaArea;
  to: TextosDasOfertas;
  dados: DadosDaArea;
  aniversarioNestaSemana: boolean;
  /** A aba Hoje com hierarquia (`lib/area-do-cliente/hoje.ts`): a frase dela, a lembrança e o destaque único. */
  hojeTela: {
    frase: string;
    lembranca: { pergunta: string; quando: string } | null;
    destaque: DestaqueDeHoje;
    /** O número e a cor do dia (`lib/area-do-cliente/numero-do-dia.ts`), já traduzidos. */
    doDia: { numero: number; rotulo: string; cor: string; hex: string; sentido: string };
  };
  carta: { id: number; nome: string; mensagem: string; foto: string | null } | null;
  anoPessoal: { ano: number; numero: number; preco: string; pago: boolean; texto: string | null } | null;
  circulo: {
    nome: string;
    preco: string;
    ativo: boolean;
    ate: string | null;
    renovarJa: boolean;
    conteudo: { titulo: string; texto: string } | null;
    pergunta: { pergunta: string; resposta: string | null } | null;
  } | null;
  presente: { preco: string; presentes: Array<{ id: string; para: string | null; link: string; usado: boolean }> } | null;
  te: TextosDasEtapas;
  /** A Mesa de leituras; `null` quando a empresa não ligou. */
  mesa: MesaInicial | null;
  tm: TextosDaMesa;
  /** A leitura da mão pela foto; `null` quando a empresa não ligou. */
  mao: MaoInicial | null;
  tmao: TextosDaMao;
  /** A interpretação de sonhos; `null` quando a empresa não ligou. */
  sonho: SonhoInicial | null;
  tsonho: TextosDoSonho;
  /** O Plano da Semana (0953); `null` quando a empresa não ligou. */
  planoSemanal: PlanoSemanalNaArea | null;
  tplano: TextosDoPlano;
  /** O mapa astral completo (`_mapa.tsx`): sempre na prateleira "Só para você", de graça. */
  tmapa: TextosDoMapa;
  /** A leitura paga do mapa (0959); `null` = desligada. */
  leituraDoMapa: LeituraDoMapaInicial | null;
  tleituraDoMapa: TextosDaLeituraDoMapa;
  /** As leituras pagas dos quizzes (entregues aqui dentro) e a que veio aberta pelo link (`?leitura=`). */
  leiturasDeQuiz: LeituraDoQuizNaArea[];
  leituraAberta: string | null;
  tlq: TextosDasLeiturasDoQuiz;
  /** Os créditos (`_carteira.tsx`); `null` = desligados. */
  carteira: CarteiraInicial | null;
  creditosDoCirculo: number | null;
  /** O aviso diário no celular (`_aviso.tsx`); `null` = desligado na empresa. */
  avisos: { hora: number; convidarJa: boolean } | null;
  ta: TextosDoAviso;
  /** As simpatias (`_simpatias.tsx`); `null` = desligadas na empresa. Sem o passo a passo para quem não o vê. */
  simpatias: { preco: string; simpatias: SimpatiaNaArea[]; pedidos: PedidoNaArea[] } | null;
  /** A contribuição voluntária; `null` = desligada. */
  contribuicao: { minimoCents: number; minimo: string } | null;
  ts: TextosDasSimpatias;
  /** O Grimório (`_grimorio.tsx`): as cartas que já saíram nas leituras pagas dela. Vazio = não aparece. */
  grimorio: CartaNoGrimorio[];
  tg: TextosDoGrimorio;
  /** O horóscopo do dia do signo solar (`lib/area-do-cliente/horoscopo.ts`); `null` = sem data de nascimento. */
  horoscopo: { signo: string; texto: string } | null;
  /** A sua manhã (`_manha.tsx`): "dela" = tem o plano ou o Círculo; "convite" = a empresa vende o plano; `null` = nada. */
  manha: "dela" | "convite" | null;
  tmanha: TextosDaManha;
  /** Por quem eu peço (`_vela.tsx`, 0957): a vela aberta, as graças marcadas e se ela pode acender (plano ou Círculo). */
  vela: { aberta: VelaNaArea | null; gracas: number; podeAcender: boolean };
  tvela: TextosDaVela;
  /** A meditação da semana falada (`lib/area-do-cliente/meditacao.ts`); `null` = sem voz no servidor ou fora do português. */
  meditacao: MeditacaoNaArea | null;
  tmd: TextosDaMeditacao;
  /** "Sua lua do mês" (`_lua-do-mes.tsx`); `null` = o mês ainda não tem leitura nem diário. `versao` renova a imagem. */
  luaDoMes: { versao: string } | null;
  tl: TextosDaLuaDoMes;
  /** A entrada com 3 perguntas (`_entrada.tsx`): `feito` = respondida ou pulada. */
  perfil: { feito: boolean; foco: Foco | null };
  /** O Sol e a Lua do nascimento, quando a área sabe a data. */
  ceu: CeuDoNascimento | null;
  tp: TextosDaEntrada;
  tc: TextosDaCarteira;
  /** A guia (`config.guia`, a mesma dos quizzes): a foto dela é a capa do Hoje. Sem foto, a capa é só o céu. */
  guia: { foto: string | null; nome: string | null };
  /** A aba que abre primeiro (do endereço, `?aba=`); sem ela, Hoje. */
  abaInicial?: AbaDaArea;
  /** O chat da área (`_chat.tsx`): a conversa de agora e se dá para escrever (há conversa num número ligado). */
  chat: { inicial: MensagemDoChat[]; podeEscrever: boolean; sugestoes: string[] };
  tch: TextosDoChat;
  /** O ritual de hoje (`lib/area-do-cliente/ritual.ts`): os passos e quais já foram feitos. */
  ritual: { passos: Array<{ passo: PassoDoRitual; feito: boolean }>; cartaJaRevelada: boolean };
  tr: TextosDoRitual;
}

/** "tempo de agir…" → "Tempo de agir…": a frase da lua perde o começo ("Lua crescente:") e não pode começar em minúscula. */
function maiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

function dinheiro(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

export function VistaDaArea(p: VistaDaAreaProps) {
  const { slug, fuso, tag, titulo, t, tx, to, dados } = p;
  // A cor de AÇÃO da área é o dourado (`_tema.ts`); a da empresa vive no brilho do céu.
  const cor = OURO;
  const corDaEmpresa = p.cor;
  const dataCurta = (iso: string, z = fuso) =>
    new Intl.DateTimeFormat(tag, { timeZone: z, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

  const fase = faseDaLua(p.agora);
  const nomeDaFase =
    fase === "nova" ? t("Lua nova") : fase === "crescente" ? t("Lua crescente") : fase === "cheia" ? t("Lua cheia") : t("Lua minguante");
  const fraseDaLua =
    fase === "nova"
      ? t("Lua nova: tempo de plantar intenções. Escreva no diário o que você quer começar.")
      : fase === "crescente"
        ? t("Lua crescente: tempo de agir e dar o primeiro passo no que você planejou.")
        : fase === "cheia"
          ? t("Lua cheia: tempo de colher e agradecer o que já chegou.")
          : t("Lua minguante: tempo de soltar o que pesa e descansar.");

  const ola = dados.contato.primeiroNome ? `${t("Olá")}, ${dados.contato.primeiroNome}` : t("Olá");
  const vitrine = dados.servicos.filter((s) => !s.ja_comprado);
  const ultimaCompra = dados.compras.find((c) => !c.estornada) ?? null;
  // O recado, não a "última mensagem": a fala mais recente da empresa pode ser a régua de cobrança.
  const recado = recadoDaEmpresa(dados.conversa, p.agora);
  // Quem terminou o trabalho vê um próximo passo; o primeiro da vitrine que ela ainda não tem.
  const proximo = vitrine[0] ? { nome: vitrine[0].nome, descricao: vitrine[0].descricao ?? null } : null;
  const rotulos = { hoje: t("Hoje"), trabalho: t("Você"), conversa: t("Guia"), explorar: t("Leituras") };

  /** O topo das abas que não são a Hoje: o mesmo céu, mais baixo, com o nome da aba. */
  const topo = (nome: string) => (
    <header className={`${CEU} px-5 pb-20 pt-9`}>
      <div className="pointer-events-none absolute inset-0" style={brilho(corDaEmpresa)} />
      <div className="relative mx-auto max-w-xl">
        <p className={SOBRETITULO_NOTURNO}>{titulo}</p>
        <h1 className={`${SERIF} mt-2 text-[34px] leading-tight`}>{nome}</h1>
      </div>
    </header>
  );
  const corpo = "relative mx-auto -mt-14 max-w-xl space-y-5 px-4";

  const hoje = (
    <>
      {/* O topo do Hoje é CURTO: o nome dela, a frase do dia e o céu numa linha. O herói é a carta, logo abaixo. */}
      <header className={`${CEU} px-5 pb-24 pt-7 sm:pt-10`}>
        <div className="pointer-events-none absolute inset-0" style={brilho(corDaEmpresa)} />
        {/* A CAPA: a foto da guia à direita, sumindo no céu — quem conversa com ela no WhatsApp reconhece de quem é a área. */}
        {p.guia.foto ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[52%] max-w-[320px] sm:right-[max(0px,calc(50%-18rem))]" data-testid="area-capa-guia">
            {/* eslint-disable-next-line @next/next/no-img-element -- mídia pública do Storage, sem otimizador */}
            <img
              src={p.guia.foto}
              alt={p.guia.nome ?? titulo}
              className="size-full object-cover object-top opacity-60 [mask-image:linear-gradient(to_left,black_20%,transparent_90%),linear-gradient(to_top,transparent,black_35%)] [mask-composite:intersect]"
            />
          </div>
        ) : null}
        <div className="relative mx-auto max-w-xl">
          <div className="flex items-center justify-between gap-3">
            <p className={`${SERIF} flex items-center gap-2 text-xl tracking-wide text-[#f3e4c3]`}><SimboloDaArea className="size-6 shrink-0" />{titulo}</p>
            {/* O saldo à vista no alto, sempre — como nos aplicativos do ramo. */}
            {p.carteira ? <CreditosNoTopo inicial={p.carteira.saldo} rotulo={p.tr.creditos} /> : null}
          </div>
          <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#c3bad3]">
            <time dateTime={p.agora.toISOString()}>{new Intl.DateTimeFormat(tag, { timeZone: fuso, weekday: "long", day: "numeric", month: "long" }).format(p.agora)}</time>
          </p>
          <h1 className={`${SERIF} mt-2 text-[40px] leading-[1.1] tracking-tight sm:text-[46px]`} data-testid="area-ola">
            {ola}
          </h1>
          {/* A frase de hoje (o modelo Co-Star): curta, no tema dela, a mesma o dia todo. */}
          <p className={`${SERIF} mt-3 max-w-[24rem] text-[21px] italic leading-snug text-[#e9e1f3]`} data-testid="area-frase-do-dia">
            “{p.hojeTela.frase}”
          </p>
          {/* O número e a cor do dia: conta da numerologia, sem IA, a mesma o dia todo. */}
          <div className="mt-5 grid grid-cols-2 items-start gap-3">
          <details className="min-w-0 rounded-2xl border border-white/10 bg-[#171126]/70 p-3" data-testid="area-numero-do-dia">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-[#e2c47a] [&::-webkit-details-marker]:hidden">
            <span
              className={`${SERIF} grid size-8 shrink-0 place-items-center rounded-full text-[20px] font-semibold text-[#120d1d]`}
              style={{ background: p.hojeTela.doDia.hex, boxShadow: `0 0 22px ${p.hojeTela.doDia.hex}66` }}
              aria-hidden
            >
              {p.hojeTela.doDia.numero}
            </span>
            <span className="min-w-0 text-[11px] leading-snug text-[#c3bad3]">
              <span className="block font-semibold text-[#f0dca8]">
                {p.hojeTela.doDia.rotulo}: {p.hojeTela.doDia.numero}
              </span>
              {p.hojeTela.doDia.cor}<span className="ml-1 text-[#e2c47a]" aria-hidden>＋</span>
            </span>
            </summary>
            <p className="mt-3 border-t border-white/10 pt-3 text-[13px] leading-relaxed text-[#c3bad3]">{p.hojeTela.doDia.sentido}</p>
          </details>
          <details className="min-w-0 rounded-2xl border border-white/10 bg-[#171126]/70 p-3" data-testid="area-lua">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-[#e2c47a] [&::-webkit-details-marker]:hidden">
              <LuaDeHoje quando={p.agora} tamanho={28} />
              <span className="text-[11px] font-semibold leading-snug text-[#f0dca8]">{nomeDaFase}<span className="ml-1" aria-hidden>＋</span></span>
            </summary>
            <p className="mt-3 border-t border-white/10 pt-3 text-[13px] leading-relaxed text-[#c3bad3]">
              {maiuscula(fraseDaLua.replace(/^[^:]+:\s*/, ""))}
              {p.ceu ? (
                <span className="block text-[#9d94b2]" data-testid="area-ceu">
                  ☉ {p.tp.solEm} {p.ceu.sol} · ☾ {p.tp.luaEm} {p.ceu.lua}
                  {p.ceu.luaOutra ? ` ${p.tp.ou} ${p.ceu.luaOutra}` : ""}
                </span>
              ) : null}
            </p>
          </details>
          </div>
        </div>
      </header>

      <div className="relative mx-auto -mt-16 max-w-xl space-y-5 px-4">
        {p.hojeTela.destaque === "aniversario" ? (
          <section className={`${CARTAO} text-center`} data-testid="area-feliz-aniversario">
            <p className={SOBRETITULO}>✦ ✦ ✦</p>
            <h2 className={`${SERIF} mt-2 text-[28px]`}>
              {t("Feliz aniversário")}
              {dados.contato.primeiroNome ? `, ${dados.contato.primeiroNome}` : ""}!
            </h2>
            <p className={`mt-2 ${TEXTO_SUAVE}`}>{t("Um ano novo começa para você. Que ele venha leve e cheio de bons encontros.")}</p>
          </section>
        ) : null}

        {/* O RITUAL DE HOJE: 1 carta · 2 diário · 3 conversa, um cartão por vez (`_ritual.tsx`). */}
        <RitualDeHoje
          inicial={p.ritual.passos}
          nomeDaGuia={p.guia.nome?.trim() || titulo}
          tr={p.tr}
          carta={
            p.carta ? (
              <CartaDoDia
                slug={slug}
                cor={cor}
                tx={tx}
                cartaId={p.carta.id}
                nome={p.carta.nome}
                mensagem={p.carta.mensagem}
                foto={p.carta.foto}
                jaRevelada={p.ritual.cartaJaRevelada}
              />
            ) : null
          }
          diario={
            <DiarioDoCliente
              slug={slug}
              cor={cor}
              tx={tx}
              entradas={dados.diario.map((d) => ({ id: d.id, texto: d.texto, quando: dataCurta(d.quando) }))}
            />
          }
        />

        <section className="grid grid-cols-2 gap-3" aria-label={t("Atalhos da sua área")} data-testid="area-atalhos-pessoais">
          <BotaoIrParaAba aba="trabalho" className="group flex min-h-24 items-center gap-3 rounded-3xl border border-[#b89cff]/20 bg-[#b89cff]/[0.06] p-4 text-[#e6dbfa]">
            <BookOpen aria-hidden className="size-5 shrink-0 text-[#b89cff]" />
            <span className="min-w-0 flex-1 text-sm font-semibold">{t("Suas memórias")}</span>
            <ArrowUpRight aria-hidden className="size-4 shrink-0" />
          </BotaoIrParaAba>
          <BotaoIrParaAba aba="explorar" className="group flex min-h-24 items-center gap-3 rounded-3xl border border-[#e2c47a]/20 bg-[#e2c47a]/[0.05] p-4 text-[#f0dca8]">
            <Sparkles aria-hidden className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 text-sm font-semibold">{t("Explorar leituras")}</span>
            <ArrowUpRight aria-hidden className="size-4 shrink-0" />
          </BotaoIrParaAba>
        </section>

        <EtapaDeHoje proximo={proximo} />

        {/* A lembrança (sem culpa): a última pergunta que ela fez às cartas, e o convite a contar como foi. */}
        {p.hojeTela.destaque === "lembranca" && p.hojeTela.lembranca ? (
          <section className={CARTAO_NOTURNO} data-testid="area-lembranca">
            <p className={SOBRETITULO_NOTURNO}>
              ✦ {p.hojeTela.lembranca.quando} {t("você perguntou às cartas")}
            </p>
            <p className={`${SERIF} mt-2 text-[22px] leading-snug`}>“{p.hojeTela.lembranca.pergunta}”</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#d9d0e6]">
              {t("Como foi desde então? Anote no seu diário, no ritual de hoje, ou leve uma nova pergunta à mesa.")}
            </p>
            <BotaoIrParaAba
              aba="explorar"
              className="mt-4 inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
              style={{ background: "#c9a54e", color: "#1b1433" }}
            >
              {t("Voltar à mesa")}
            </BotaoIrParaAba>
          </section>
        ) : null}

        {/* O convite para a Mesa: no Hoje só a porta; o ritual mora no Explorar. */}
        {p.mesa && p.hojeTela.destaque === "mesa" ? (
          <section className={CARTAO_NOTURNO} data-testid="area-convite-mesa">
            <p className={SOBRETITULO_NOTURNO}>✦ {p.tm.titulo}</p>
            <p className={`${SERIF} mt-2 text-[22px] leading-snug`}>
              {p.perfil.foco
                ? `${t("Faça uma pergunta às cartas sobre")} ${p.tp.focos[p.perfil.foco].tema}.`
                : t("Faça uma pergunta às cartas e veja a leitura na hora.")}
            </p>
            <BotaoIrParaAba
              aba="explorar"
              className="mt-4 inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
              style={{ background: "#c9a54e", color: "#1b1433" }}
            >
              {t("Ir para a mesa")}
            </BotaoIrParaAba>
          </section>
        ) : null}

        {/* A sua manhã: a carta lida para ela e a energia do dia dela, para quem tem o plano ou o Círculo (0956). */}
        {p.manha === "dela" ? <ManhaDoCliente slug={slug} cor={cor} tx={tx} tm={p.tmanha} /> : p.manha === "convite" ? <ConviteDaManha cor={cor} tm={p.tmanha} /> : null}

        {/* Por quem eu peço: a vela de 7 dias com uma intenção, e as graças que ela marcou (0957). */}
        <VelaDoCliente slug={slug} cor={cor} tx={tx} tv={p.tvela} vela={p.vela.aberta} gracas={p.vela.gracas} podeAcender={p.vela.podeAcender} />

        {/* O horóscopo do signo: o segundo motivo para abrir a área todo dia, pequeno, depois da carta. */}
        {p.horoscopo ? (
          <section className={CARTAO} data-testid="area-horoscopo">
            <p className={SOBRETITULO}>
              ☉ {t("Hoje para")} {p.horoscopo.signo}
            </p>
            <p className={`${SERIF} mt-2 text-[19px] leading-snug text-[#efe7f7]`}>{p.horoscopo.texto}</p>
            <p className={`mt-2 ${DETALHE}`}>{t("O mesmo para todo mundo do seu signo hoje.")}</p>
          </section>
        ) : null}

        {/* A meditação da semana: feita com o céu dela, nova toda segunda (pedido nº 1 dos comentários das lojas). */}
        {p.meditacao ? <MeditacaoDaSemana m={p.meditacao} tx={p.tmd} /> : null}

        {/* A continuidade: a última palavra da empresa, com o caminho para responder. */}
        {recado ? (
          <section className={CARTAO} data-testid="area-ultima-mensagem">
            <p className={SOBRETITULO}>
              {t("Um recado para você")} · {dataCurta(recado.quando)}
            </p>
            <p className={`${SERIF} mt-3 line-clamp-5 whitespace-pre-line text-[18px] leading-relaxed text-[#efe7f7]`}>
              {recado.texto}
            </p>
            <p className="mt-2 text-sm font-semibold text-[#e2c47a]">— {titulo}</p>
            <BotaoIrParaAba
              aba="conversa"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-white"
              style={{ background: cor, color: "#1b1433" }}
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("Responder")}
            </BotaoIrParaAba>
          </section>
        ) : null}

        {/* O aviso diário no celular, depois de tudo (o diário foi para o ritual). */}
        {p.avisos ? <AvisoDiario slug={slug} ta={p.ta} hora={p.avisos.hora} convidarJa={p.avisos.convidarJa} /> : null}
      </div>
    </>
  );

  const trabalho = (
    <>
      {topo(rotulos.trabalho)}
      <div className={corpo}>
        <LeiturasDoQuiz slug={slug} leituras={p.leiturasDeQuiz} aberta={p.leituraAberta} dataCurta={(iso) => dataCurta(iso)} tx={p.tlq} />
        <MemoriasDaArea entradas={dados.diario} tag={tag} fuso={fuso} titulo={t("Suas memórias")} recentes={t("Reflexões recentes")} vazio={t("As suas reflexões ficam aqui. Comece pelo diário no ritual de hoje.")} />
        {p.grimorio.length > 0 ? <GrimorioDaArea cartas={p.grimorio} tg={p.tg} /> : null}
        {ultimaCompra ? (
          <section className={CARTAO} data-testid="area-compra-confirmada">
            <div className="flex items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#1e3a2c] text-[#8fd6a8] ring-4 ring-[#1e3a2c]/50">
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#8fd6a8]">{t("Sua compra está confirmada")}</p>
                <p className={`${SERIF} mt-1 text-[24px] leading-tight`}>{ultimaCompra.produto ?? t("Compra")}</p>
                <p className={`mt-1 ${DETALHE} text-sm`}>
                  {dinheiro(ultimaCompra.valor_cents, ultimaCompra.currency)} · {dataCurta(ultimaCompra.quando)}
                </p>
              </div>
            </div>
            <p className={`mt-4 ${TEXTO_SUAVE}`}>
              {t("Tudo o que a gente te enviou fica guardado aqui. Se tiver qualquer dúvida, escreva para a gente logo abaixo.")}
            </p>
            <a
              href={`/c/${slug}/recibo/${ultimaCompra.id}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline decoration-2 underline-offset-4"
              style={{ color: cor }}
            >
              <Receipt className="size-4" aria-hidden />
              {t("Ver recibo")}
            </a>
          </section>
        ) : null}

        <LinhasDoTempo />

        {dados.leitura.length > 0 ? (
          <section className={CARTAO} data-testid="area-leitura">
            <TituloDaSecao titulo={t("Sua leitura")} />
            <div className="mt-4 space-y-5">
              {dados.leitura.map((grupo) => (
                <div key={grupo.dia}>
                  <p className={DETALHE}>{dataCurta(`${grupo.dia}T12:00:00Z`, "UTC")}</p>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {grupo.itens.map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, sem otimizador
                      <img
                        key={i.id}
                        src={i.url}
                        alt={t("Carta da sua leitura")}
                        className="aspect-[3/5] w-full rounded-2xl object-cover shadow-[0_10px_24px_-12px_rgba(20,15,38,0.6)] ring-1 ring-[#c9a54e]/30"
                        loading="lazy"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {dados.materiais.length > 0 ? (
          <section className={CARTAO} data-testid="area-materiais">
            <TituloDaSecao titulo={t("Seus materiais")} />
            <ul className="mt-3 divide-y divide-white/10">
              {dados.materiais.map((m) => {
                const Icone = ICONE_DO_MATERIAL[m.tipo];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-[#e2c47a]">
                        <Icone className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {m.nome ?? (m.tipo === "documento" ? t("Material em PDF") : m.tipo === "audio" ? t("Áudio") : t("Vídeo"))}
                        </span>
                        <span className={DETALHE}>{dataCurta(m.quando)}</span>
                      </span>
                    </span>
                    <a href={`/c/${slug}/material/${m.id}`} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: cor, color: "#1b1433" }}>
                      {t("Abrir")}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {dados.compras.length > 1 ? (
          <section className={CARTAO} data-testid="area-compras">
            <TituloDaSecao titulo={t("Suas compras")} />
            <ul className="mt-3 divide-y divide-white/10">
              {dados.compras.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3.5 text-[15px]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.produto ?? t("Compra")}</span>
                    <span className={DETALHE}>{dataCurta(c.quando)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{dinheiro(c.valor_cents, c.currency)}</span>
                    {c.estornada ? (
                      <span className="text-xs text-[#f0b070]">{t("devolvido")}</span>
                    ) : (
                      <a href={`/c/${slug}/recibo/${c.id}`} className="text-xs font-semibold underline underline-offset-2" style={{ color: cor }}>
                        {t("recibo")}
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Um pedido só por visita: guardar o acesso. Discreto, depois do que é dela. */}
        {!dados.contato.email ? <EmailDoCliente slug={slug} cor={cor} tx={tx} /> : null}
      </div>
    </>
  );

  // O chat ocupa a tela, como num aplicativo de conversa: sem o céu de título em cima.
  const conversa = (
    <>
      <div className="mx-auto max-w-xl space-y-5 px-3 pt-3">
        {/* A conversa É o chat, como no WhatsApp — a mesma conversa, e a resposta chega aqui. */}
        <ChatDaArea
          slug={slug}
          inicial={p.chat.inicial}
          podeEscrever={p.chat.podeEscrever}
          guia={p.guia}
          empresa={titulo}
          idioma={tag}
          fuso={fuso}
          tc={p.tch}
          sugestoes={p.chat.sugestoes}
        />
      </div>
    </>
  );

  // O EXPLORAR É VITRINE (`_vitrine.tsx`): prateleiras de cartões, e o conteúdo e o pagamento só na gaveta, depois
  // do toque. Era uma coluna de onze blocos e cinco mil pixels, com "Pagar com Pix" aparecendo antes do desejo.
  const temCaminho = p.grimorio.length > 0 || p.luaDoMes !== null;
  // O mapa astral está sempre ali: a prateleira "Só para você" sempre aparece.
  const temSoParaVoce = true;
  // A LOJA (antes "Explorar"): o desenho das lojas de streaming — um destaque grande no alto e prateleiras de
  // cartões em pé que deslizam. O destaque é o trabalho marcado "para você" (ou o primeiro), e sai da prateleira.
  const destaqueDaLoja = vitrine.find((sv) => sv.destaque) ?? vitrine[0] ?? null;
  const outrosTrabalhos = vitrine.filter((sv) => sv.id !== destaqueDaLoja?.id);
  const gavetaDoServico = (sv: (typeof vitrine)[number]) => (
      <article data-servico-id={sv.id} className="rounded-3xl border border-[#c9a54e]/20 bg-[#1a1430] p-6">
        <h3 className={`${SERIF} text-2xl leading-snug`}>{sv.nome}</h3>
        {sv.descricao ? <p className={`mt-2 ${TEXTO_SUAVE}`}>{sv.descricao}</p> : null}
        {sv.recebe ? (
          <p className="mt-3 text-sm text-[#c3bad3]">
            <span className="font-semibold text-[#efe7f7]">{t("Você recebe:")}</span> {sv.recebe}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className={`${SERIF} text-[28px]`}>{dinheiro(sv.preco_cents, sv.currency)}</span>
          <a
            href={`/c/${slug}/comprar/${sv.id}`}
            className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold"
            style={{ background: cor, color: "#1b1433" }}
            data-testid="area-comprar"
          >
            {t("Quero este")}
          </a>
        </div>
        {/* Compra direta é o caminho principal; a conversa fica à mão, no chat da área, para quem quiser tirar dúvida antes. */}
        <p className={`mt-4 ${TEXTO_SUAVE}`}>
          {t("Prefere tirar uma dúvida antes?")}{" "}
          <BotaoIrParaAba aba="conversa" className="font-semibold underline underline-offset-4" style={{ color: cor }}>
            {t("Fale com a gente no chat")}
          </BotaoIrParaAba>
        </p>
      </article>
  );
  const explorar = (
    <>
      {topo(rotulos.explorar)}
      <div className={`${corpo} [&>*+*]:!mt-8`}>

        {p.mesa || p.mao || p.sonho ? (
          <Prateleira titulo={t("Explorar leituras")} testId="area-prateleira-leituras">
            {p.mesa ? <CartaoDaVitrine icone="brilho" tema="cartas" tom="ouro" titulo={p.tm.titulo}>
              <MesaDeLeituras slug={slug} cor={cor} tx={tx} tm={p.tm} inicial={p.mesa} sugestoes={p.perfil.foco ? PERGUNTAS_DO_FOCO[p.perfil.foco].map((q) => t(q)) : []} tag={tag} />
            </CartaoDaVitrine> : null}
            {p.mao ? <CartaoDaVitrine icone="mao-com-coracao" tema="estrela" tom="rosa" titulo={p.tmao.titulo} linha={p.tmao.chamada}>
              <LeituraDaMaoNaArea slug={slug} cor={cor} tx={tx} tm={p.tmao} inicial={p.mao} />
            </CartaoDaVitrine> : null}
            {p.sonho ? <CartaoDaVitrine icone="lua" tema="lua" tom="azul" titulo={p.tsonho.titulo}>
              <SonhosNaArea slug={slug} cor={cor} tx={tx} ts={p.tsonho} inicial={p.sonho} />
            </CartaoDaVitrine> : null}
          </Prateleira>
        ) : null}

        {vitrine.length > 0 ? (
          <VitrineObservada slug={slug}>
            <div data-testid="area-vitrine" className="space-y-8">
              {destaqueDaLoja ? (
                <DestaqueDaLoja
                  sobretitulo={destaqueDaLoja.destaque ? t("Para você") : t("Em destaque")}
                  titulo={destaqueDaLoja.nome}
                  linha={destaqueDaLoja.descricao}
                  preco={dinheiro(destaqueDaLoja.preco_cents, destaqueDaLoja.currency)}
                  tema={temaDaIlustracao(destaqueDaLoja.nome)}
                  comprar={{ href: `/c/${slug}/comprar/${destaqueDaLoja.id}`, rotulo: t("Quero este") }}
                  detalhes={t("Ver detalhes")}
                  testId="area-destaque-da-loja"
                >
                  {gavetaDoServico(destaqueDaLoja)}
                </DestaqueDaLoja>
              ) : null}
              {outrosTrabalhos.length > 0 ? (
                <Prateleira titulo={t("Trabalhos")}>
                  {outrosTrabalhos.map((sv) => (
                    <CartaoDaVitrine
                      key={sv.id}
                      formato="poster"
                      icone="brilho"
                      tema={temaDaIlustracao(sv.nome)}
                      tom={sv.destaque ? "ouro" : "azul"}
                      sobretitulo={sv.destaque ? t("Para você") : null}
                      titulo={sv.nome}
                      preco={dinheiro(sv.preco_cents, sv.currency)}
                    >
                      {gavetaDoServico(sv)}
                    </CartaoDaVitrine>
                  ))}
                </Prateleira>
              ) : null}
            </div>
          </VitrineObservada>
        ) : null}

        {p.simpatias && p.simpatias.simpatias.length > 0 ? (
          <Prateleira titulo={t("Simpatias")} testId="area-prateleira-simpatias">
            {p.simpatias.simpatias.map((sp) => (
              <CartaoDaVitrine key={sp.id} formato="poster" icone="chama" tema={temaDaIlustracao(sp.titulo)} tom="rosa" titulo={sp.titulo} preco={p.simpatias!.preco} testId="area-cartao-simpatia">
                <SimpatiasDoCliente
                  slug={slug}
                  cor={cor}
                  tx={tx}
                  ts={p.ts}
                  preco={p.simpatias!.preco}
                  simpatias={[sp]}
                  pedidos={p.simpatias!.pedidos.filter((pd) => pd.titulo === sp.titulo)}
                />
              </CartaoDaVitrine>
            ))}
          </Prateleira>
        ) : null}

        {p.carteira ? <CarteiraDeCreditos slug={slug} cor={cor} tx={tx} tc={p.tc} inicial={p.carteira} tag={tag} /> : null}

        {temSoParaVoce ? (
          <Prateleira titulo={t("Só para você")} testId="area-prateleira-so-para-voce">
            <CartaoDaVitrine
              formato="poster"
              icone="estrela"
              tema="estrela"
              tom="azul"
              sobretitulo={t("Grátis")}
              titulo={t("O seu mapa astral")}
              linha={t("O céu do instante em que você nasceu: planetas, Ascendente e casas.")}
              preco={null}
            >
              <MapaAstral slug={slug} cor={cor} tm={p.tmapa} nascimento={dados.contato.nascimento} tx={tx} tl={p.tleituraDoMapa} leitura={p.leituraDoMapa} />
            </CartaoDaVitrine>
            {p.planoSemanal ? (
              <CartaoDaVitrine
                formato="poster"
                icone="estrela"
                tema="estrela"
                tom="lilas"
                sobretitulo={p.planoSemanal.ativo ? t("Ativo") : null}
                titulo={p.planoSemanal.nome}
                linha={t("Toda semana, uma pergunta às cartas, um sonho e a sua mão; toda manhã, a sua carta lida para você.")}
                preco={null}
              >
                <PlanoSemanalDoCliente slug={slug} cor={cor} tx={tx} tp={p.tplano} plano={p.planoSemanal} />
              </CartaoDaVitrine>
            ) : null}
            {p.circulo ? (
              <CartaoDaVitrine
                formato="poster"
                icone="lua"
                tema="lua"
                tom="lilas"
                sobretitulo={p.circulo.ativo ? t("Ativo") : null}
                titulo={p.circulo.nome}
                linha={t("Todo mês, um ritual simples e uma pergunta respondida com uma carta.")}
                preco={p.circulo.preco}
              >
                <CirculoDoCliente
                  slug={slug}
                  cor={cor}
                  tx={tx}
                  {...p.circulo}
                  creditosPorMes={p.creditosDoCirculo ? `${t("Todo mês:")} +${p.creditosDoCirculo} ${t("créditos para usar nas leituras")}` : null}
                />
              </CartaoDaVitrine>
            ) : null}
            {p.anoPessoal ? (
              <CartaoDaVitrine
                formato="poster"
                icone="estrela"
                tema="estrela"
                tom="ouro"
                sobretitulo={`${p.anoPessoal.ano} · ${p.anoPessoal.numero}`}
                titulo={t("Seu Ano Pessoal")}
                linha={t("A leitura do ano que começa no seu aniversário.")}
                preco={p.anoPessoal.pago ? t("Liberado") : p.anoPessoal.preco}
              >
                <AnoPessoalDoCliente slug={slug} cor={cor} tx={tx} to={to} {...p.anoPessoal} />
              </CartaoDaVitrine>
            ) : null}
            {p.presente ? (
              <CartaoDaVitrine formato="poster" icone="presente" tema="presente" tom="verde" titulo={t("Dê uma pergunta de presente")} linha={t("Alguém que você ama ganha uma pergunta para as cartas.")} preco={p.presente.preco}>
                <PresenteDoCliente slug={slug} cor={cor} tx={tx} to={to} preco={p.presente.preco} presentes={p.presente.presentes} />
              </CartaoDaVitrine>
            ) : null}
          </Prateleira>
        ) : null}

        {temCaminho ? (
          <Prateleira titulo={t("Seu caminho")} testId="area-prateleira-caminho">
            {p.grimorio.length > 0 ? (
              <CartaoDaVitrine icone="livro" tema="livro" tom="lilas" titulo={t("Seu grimório")} linha={`${p.grimorio.length} ${t("cartas que já saíram para você")}`}>
                <GrimorioDaArea cartas={p.grimorio} tg={p.tg} />
              </CartaoDaVitrine>
            ) : null}
            {p.luaDoMes ? (
              <CartaoDaVitrine icone="lua" tema="fases" tom="azul" titulo={t("Sua lua do mês")} linha={t("O seu mês com as cartas, para guardar ou compartilhar.")}>
                <LuaDoMes slug={slug} cor={cor} versao={p.luaDoMes.versao} tl={p.tl} />
              </CartaoDaVitrine>
            ) : null}
          </Prateleira>
        ) : null}

        {/* O segundo pedido (aniversário) só depois de o primeiro (e-mail) estar resolvido. */}
        {dados.contato.email && !dados.contato.nascimento ? <AniversarioDoCliente slug={slug} cor={cor} tx={tx} /> : null}

        <div className="space-y-2">
          <LinhaDaVitrine icone="coracao" titulo={t("O que você gostaria de receber de nós?")} testId="area-linha-desejo">
            <DesejoDoCliente slug={slug} cor={cor} tx={tx} />
          </LinhaDaVitrine>
          {p.contribuicao ? (
            <LinhaDaVitrine icone="mao-com-coracao" titulo={t("Contribua com o templo")} testId="area-linha-contribuicao">
              <ContribuicaoDoCliente slug={slug} cor={cor} tx={tx} ts={p.ts} minimoCents={p.contribuicao.minimoCents} minimo={p.contribuicao.minimo} />
            </LinhaDaVitrine>
          ) : null}
        </div>
      </div>
    </>
  );

  const rodape = (
    <footer className="mx-auto max-w-xl px-4 pt-10 text-center" data-testid="area-rodape">
      <p className={`${SERIF} text-lg text-[#efe7f7]`}>{titulo}</p>
      <p className={`mt-1 ${DETALHE}`}>
        {t("Área oficial de")} {p.assinatura}
      </p>
      <form action={`/c/${slug}/sair`} method="post" className="mt-3">
        <button type="submit" className="text-xs text-[#9d94b2] underline underline-offset-4">
          {t("Sair deste aparelho")}
        </button>
      </form>
      <SeletorDeIdiomaDaArea atual={p.idioma} />
    </footer>
  );

  return (
    <main className={`${p.classeDaFonte} ${PAGINA} pb-32`}>
      <EtapasDaArea slug={slug} inicial={dados.trabalhos} te={p.te} cor={cor} tag={tag} fuso={fuso}>
        <AbasDaArea
          inicial={p.abaInicial ?? "hoje"}
          rotulos={rotulos}
          rotuloDaBarra={t("Atalhos da sua área")}
          cor={cor}
          paineis={{ hoje, trabalho, conversa, explorar }}
          rodape={rodape}
        />
      </EtapasDaArea>
      {/* Quem chega do quiz com a leitura (`?leitura=`) lê primeiro; as 3 perguntas ficam para a próxima visita. */}
      {!p.perfil.feito && !p.leituraAberta ? (
        <EntradaDaArea slug={slug} nome={dados.contato.primeiroNome} jaSabeONascimento={Boolean(dados.contato.nascimento)} tx={tx} te={p.tp} />
      ) : null}
    </main>
  );
}
