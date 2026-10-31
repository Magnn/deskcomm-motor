/**
 * O DESENHO da área do cliente, separado da busca de dados (`page.tsx`).
 *
 * Recebe tudo pronto — textos traduzidos, datas no fuso, dinheiro formatado — e
 * só desenha. Por isso dá para ver a área inteira com dados de exemplo, sem
 * banco nem sessão: é assim que a tela é provada antes de ir ao ar.
 */
import type { CSSProperties } from "react";
import { Check, FileText, Film, Headphones, MessageCircle, Receipt } from "lucide-react";

import { recadoDaEmpresa, type DadosDaArea } from "@/lib/area-do-cliente/dados";
import type { CeuDoNascimento } from "@/lib/area-do-cliente/ceu";
import type { DestaqueDeHoje } from "@/lib/area-do-cliente/hoje";
import { faseDaLua } from "@/lib/area-do-cliente/lua";
import { PERGUNTAS_DO_FOCO, type Foco } from "@/lib/area-do-cliente/perfil";

import {
  AniversarioDoCliente,
  CartaDoDia,
  ConversaGuardada,
  DesejoDoCliente,
  DiarioDoCliente,
  EmailDoCliente,
  EntrarNaArea,
  FaleComAGente,
  TituloDaSecao,
  VitrineObservada,
  type TextosDaArea,
} from "./_client";
import { AbasDaArea, BotaoIrParaAba, type AbaDaArea } from "./_abas";
import { AvisoDiario, type TextosDoAviso } from "./_aviso";
import { CarteiraDeCreditos, type CarteiraInicial, type TextosDaCarteira } from "./_carteira";
import { CirculoDoCliente } from "./_circulo";
import { EntradaDaArea, type TextosDaEntrada } from "./_entrada";
import { GrimorioDaArea, type CartaNoGrimorio, type TextosDoGrimorio } from "./_grimorio";
import { LuaDoMes, type TextosDaLuaDoMes } from "./_lua-do-mes";
import { EtapaDeHoje, EtapasDaArea, LinhasDoTempo, type TextosDasEtapas } from "./_etapas";
import { MesaDeLeituras, type MesaInicial, type TextosDaMesa } from "./_mesa";
import { LuaDeHoje } from "./_lua";
import { AnoPessoalDoCliente, PresenteDoCliente, type TextosDasOfertas } from "./_ofertas";
import { ContribuicaoDoCliente, SimpatiasDoCliente, type PedidoNaArea, type SimpatiaNaArea, type TextosDasSimpatias } from "./_simpatias";
import { CARTAO, CARTAO_NOTURNO, CEU, DETALHE, OURO, PAGINA, SERIF, SOBRETITULO, SOBRETITULO_NOTURNO, TEXTO_SUAVE } from "./_tema";
import { temaDaIlustracao } from "./_ilustracoes";
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
}

/** Quem chega sem sessão: o céu, o nome da empresa e o pedido do e-mail. */
export function VistaDeEntrada({ classeDaFonte, slug, cor, titulo, t, tx, link, whatsapp }: VistaDeEntradaProps) {
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
  const rotulos = { hoje: t("Hoje"), trabalho: t("Meu trabalho"), conversa: t("Conversa"), explorar: t("Loja") };

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
      <header className={`${CEU} px-5 pb-24 pt-10`}>
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
          <p className={SOBRETITULO_NOTURNO}>{titulo}</p>
          <h1 className={`${SERIF} mt-3 text-[38px] leading-[1.05] tracking-tight`} data-testid="area-ola">
            {ola}
          </h1>
          {/* A frase de hoje (o modelo Co-Star): curta, no tema dela, a mesma o dia todo. */}
          <p className={`${SERIF} mt-3 max-w-md text-[20px] italic leading-snug text-[#e9e1f3]`} data-testid="area-frase-do-dia">
            “{p.hojeTela.frase}”
          </p>
          <div className="mt-5 flex items-center gap-3" data-testid="area-lua">
            <LuaDeHoje quando={p.agora} tamanho={34} />
            <p className="min-w-0 text-[13px] leading-snug text-[#c3bad3]">
              <span className="font-semibold text-[#f0dca8]">{nomeDaFase}</span>
              {" · "}
              {maiuscula(fraseDaLua.replace(/^[^:]+:\s*/, ""))}
              {p.ceu ? (
                <span className="block text-[#9d94b2]" data-testid="area-ceu">
                  ☉ {p.tp.solEm} {p.ceu.sol} · ☾ {p.tp.luaEm} {p.ceu.lua}
                  {p.ceu.luaOutra ? ` ${p.tp.ou} ${p.ceu.luaOutra}` : ""}
                </span>
              ) : null}
            </p>
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

        {/* O HERÓI: a carta do dia, o motivo de abrir a área todo dia. */}
        {p.carta ? (
          <CartaDoDia slug={slug} cor={cor} tx={tx} cartaId={p.carta.id} nome={p.carta.nome} mensagem={p.carta.mensagem} foto={p.carta.foto} />
        ) : null}

        <EtapaDeHoje proximo={proximo} />

        {/* A lembrança (sem culpa): a última pergunta que ela fez às cartas, e o convite a contar como foi. */}
        {p.hojeTela.destaque === "lembranca" && p.hojeTela.lembranca ? (
          <section className={CARTAO_NOTURNO} data-testid="area-lembranca">
            <p className={SOBRETITULO_NOTURNO}>
              ✦ {p.hojeTela.lembranca.quando} {t("você perguntou às cartas")}
            </p>
            <p className={`${SERIF} mt-2 text-[22px] leading-snug`}>“{p.hojeTela.lembranca.pergunta}”</p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#d9d0e6]">
              {t("Como foi desde então? Anote no seu diário aqui embaixo, ou leve uma nova pergunta à mesa.")}
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

        {/* O resto, recolhido: um herói por tela. Com a lembrança em destaque, o diário já vem aberto. */}
        <details className="group rounded-3xl" open={p.hojeTela.destaque === "lembranca"} data-testid="area-mais-para-hoje">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-3xl border border-[#c9a54e]/15 bg-[#1a1430] px-5 py-4 text-[15px] font-semibold text-[#efe7f7]">
            {t("Mais para hoje")}
            <span aria-hidden className="text-[#e2c47a] transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="mt-4 space-y-5">
            {p.avisos ? <AvisoDiario slug={slug} ta={p.ta} hora={p.avisos.hora} convidarJa={p.avisos.convidarJa} /> : null}
            <DiarioDoCliente
              slug={slug}
              cor={cor}
              tx={tx}
              entradas={dados.diario.map((d) => ({ id: d.id, texto: d.texto, quando: dataCurta(d.quando) }))}
            />
          </div>
        </details>
      </div>
    </>
  );

  const trabalho = (
    <>
      {topo(rotulos.trabalho)}
      <div className={corpo}>
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
        ) : (
          <section className={CARTAO}>
            <p className={TEXTO_SUAVE}>{t("Quando você comprar um trabalho, ele aparece aqui, com tudo o que a gente te enviar.")}</p>
          </section>
        )}

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

  const conversa = (
    <>
      {topo(rotulos.conversa)}
      <div className={corpo}>
        <FaleComAGente slug={slug} cor={cor} tx={tx} inicial={dados.mensagens} idioma={tag} fuso={fuso} />
        {dados.conversa.length > 0 ? (
          <ConversaGuardada
            tx={tx}
            empresa={titulo}
            falas={dados.conversa.map((f) => ({ id: f.id, de: f.de, texto: f.texto, quando: dataCurta(f.quando) }))}
          />
        ) : null}
        {/* O WhatsApp fica pequeno e no fim: a conversa é aqui dentro, e o zap é só a saída para quem prefere. */}
        {p.whatsapp ? (
          <div className="flex justify-center pt-2">
            <a
              href={`https://wa.me/${p.whatsapp}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#1f9d55]/50 px-4 text-[13px] font-medium text-[#7fd6a4] transition hover:bg-[#1f9d55]/10"
              data-testid="area-whatsapp"
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("Falar com a gente no WhatsApp")}
            </a>
          </div>
        ) : null}
      </div>
    </>
  );

  // O EXPLORAR É VITRINE (`_vitrine.tsx`): prateleiras de cartões, e o conteúdo e o pagamento só na gaveta, depois
  // do toque. Era uma coluna de onze blocos e cinco mil pixels, com "Pagar com Pix" aparecendo antes do desejo.
  const temCaminho = p.grimorio.length > 0 || p.luaDoMes !== null;
  const temSoParaVoce = p.anoPessoal !== null || p.circulo !== null || p.presente !== null;
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
        {/* Compra direta é o caminho principal; a conversa fica à mão, para quem quiser tirar dúvida antes. */}
        {p.whatsapp ? (
          <p className={`mt-4 ${TEXTO_SUAVE}`}>
            {t("Prefere tirar uma dúvida antes?")}{" "}
            <a href={`https://wa.me/${p.whatsapp}`} className="font-semibold underline underline-offset-4" style={{ color: cor }} data-testid="area-vitrine-whatsapp">
              {t("Fale com a gente no WhatsApp")}
            </a>
          </p>
        ) : null}
      </article>
  );
  const explorar = (
    <>
      {topo(rotulos.explorar)}
      <div className={`${corpo} [&>*+*]:!mt-8`}>

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
        {/* A Mesa fica inteira, depois das prateleiras de trabalho: é o ritual da área, não um produto de prateleira. */}
        {p.mesa ? <MesaDeLeituras slug={slug} cor={cor} tx={tx} tm={p.tm} inicial={p.mesa} sugestoes={p.perfil.foco ? PERGUNTAS_DO_FOCO[p.perfil.foco].map((q) => t(q)) : []} whatsapp={p.whatsapp} tag={tag} /> : null}

        {temSoParaVoce ? (
          <Prateleira titulo={t("Só para você")} testId="area-prateleira-so-para-voce">
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
      {!p.perfil.feito ? (
        <EntradaDaArea slug={slug} nome={dados.contato.primeiroNome} jaSabeONascimento={Boolean(dados.contato.nascimento)} tx={tx} te={p.tp} />
      ) : null}
    </main>
  );
}
