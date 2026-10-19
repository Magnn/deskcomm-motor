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
import { faseDaLua, proximaLua } from "@/lib/area-do-cliente/lua";

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
import { EtapaDeHoje, EtapasDaArea, LinhasDoTempo, type TextosDasEtapas } from "./_etapas";
import { MesaDeLeituras, type MesaInicial, type TextosDaMesa } from "./_mesa";
import { LuaDeHoje } from "./_lua";
import { AnoPessoalDoCliente, PresenteDoCliente, type TextosDasOfertas } from "./_ofertas";
import { CARTAO, CARTAO_NOTURNO, CEU, DETALHE, PAGINA, SERIF, SOBRETITULO, SOBRETITULO_NOTURNO, TEXTO_SUAVE } from "./_tema";

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
          <p className="mb-4 rounded-3xl border border-[#f0dfb5] bg-[#fdf6e4] px-5 py-4 text-[15px] text-[#7a5a12]" data-testid="area-link-recusado">
            {link === "vencido"
              ? t("Este link de acesso venceu. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")
              : t("Este link de acesso não vale mais. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")}
          </p>
        ) : null}
        <div className="[&>div]:mt-0">
          <EntrarNaArea slug={slug} cor={cor} tx={tx} />
        </div>
        {whatsapp ? (
          <p className="mt-8 text-center text-[15px] text-[#6f6880]">
            {t("Não cadastrou e-mail?")}{" "}
            <a className="font-semibold underline underline-offset-4" style={{ color: cor }} href={`https://wa.me/${whatsapp}`}>
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
  avisos: { hora: number } | null;
  ta: TextosDoAviso;
  tc: TextosDaCarteira;
  /** A aba que abre primeiro (do endereço, `?aba=`); sem ela, Hoje. */
  abaInicial?: AbaDaArea;
}

function dinheiro(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

export function VistaDaArea(p: VistaDaAreaProps) {
  const { slug, fuso, tag, cor, titulo, t, tx, to, dados } = p;
  const dataCurta = (iso: string, z = fuso) =>
    new Intl.DateTimeFormat(tag, { timeZone: z, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
  const dataLonga = (iso: string) => new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "numeric", month: "long" }).format(new Date(iso));

  const fase = faseDaLua(p.agora);
  const proximaCheia = proximaLua(p.agora, "cheia");
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
  const trabalhoAtual = dados.trabalhos.at(0) ?? null;
  // Quem terminou o trabalho vê um próximo passo; o primeiro da vitrine que ela ainda não tem.
  const proximo = vitrine[0] ? { nome: vitrine[0].nome, descricao: vitrine[0].descricao ?? null } : null;
  const rotulos = { hoje: t("Hoje"), trabalho: t("Meu trabalho"), conversa: t("Conversa"), explorar: t("Explorar") };

  /** O topo das abas que não são a Hoje: o mesmo céu, mais baixo, com o nome da aba. */
  const topo = (nome: string) => (
    <header className={`${CEU} px-5 pb-20 pt-9`}>
      <div className="pointer-events-none absolute inset-0" style={brilho(cor)} />
      <div className="relative mx-auto max-w-xl">
        <p className={SOBRETITULO_NOTURNO}>{titulo}</p>
        <h1 className={`${SERIF} mt-2 text-[34px] leading-tight`}>{nome}</h1>
      </div>
    </header>
  );
  const corpo = "relative mx-auto -mt-14 max-w-xl space-y-5 px-4";

  const hoje = (
    <>
      <header className={`${CEU} px-5 pb-28 pt-10`}>
        <div className="pointer-events-none absolute inset-0" style={brilho(cor)} />
        <div className="relative mx-auto max-w-xl">
          <p className={SOBRETITULO_NOTURNO}>{titulo}</p>
          <h1 className={`${SERIF} mt-3 text-[40px] leading-[1.05] tracking-tight`} data-testid="area-ola">
            {ola}
          </h1>
          <p className="mt-3 max-w-md text-[16px] leading-relaxed text-[#d9d0e6]">
            {trabalhoAtual
              ? `${t("Estou acompanhando o seu trabalho:")} ${trabalhoAtual.nome}.`
              : p.boasVindas || t("Sua conversa, seus conteúdos e suas reflexões em um só lugar.")}
          </p>

          <div className="mt-7 flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm" data-testid="area-lua">
            <LuaDeHoje quando={p.agora} />
            <div className="min-w-0">
              <p className={SOBRETITULO_NOTURNO}>
                {t("Hoje no céu")} · {nomeDaFase}
              </p>
              <p className="mt-1 text-[15px] leading-snug text-[#f6f0e4]">{fraseDaLua.replace(/^[^:]+:\s*/, "")}</p>
              {fase !== "cheia" ? (
                <p className="mt-1 text-xs text-[#b7aecb]">
                  {t("Próxima lua cheia:")} {dataLonga(proximaCheia.toISOString())}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto -mt-20 max-w-xl space-y-5 px-4">
        {p.aniversarioNestaSemana ? (
          <section className={`${CARTAO} text-center`} data-testid="area-feliz-aniversario">
            <p className={SOBRETITULO}>✦ ✦ ✦</p>
            <h2 className={`${SERIF} mt-2 text-[28px]`}>
              {t("Feliz aniversário")}
              {dados.contato.primeiroNome ? `, ${dados.contato.primeiroNome}` : ""}!
            </h2>
            <p className={`mt-2 ${TEXTO_SUAVE}`}>{t("Um ano novo começa para você. Que ele venha leve e cheio de bons encontros.")}</p>
          </section>
        ) : null}

        <EtapaDeHoje proximo={proximo} />

        {/* O convite para a Mesa: no Hoje só a porta; o ritual mora no Explorar. */}
        {p.mesa ? (
          <section className={CARTAO_NOTURNO} data-testid="area-convite-mesa">
            <p className={SOBRETITULO_NOTURNO}>✦ {p.tm.titulo}</p>
            <p className={`${SERIF} mt-2 text-[22px] leading-snug`}>{t("Faça uma pergunta às cartas e veja a leitura na hora.")}</p>
            <p className="mt-1 text-xs text-[#b7aecb]">{p.tm.automatica}</p>
            <BotaoIrParaAba
              aba="explorar"
              className="mt-4 inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold"
              style={{ background: "#c9a54e", color: "#1b1433" }}
            >
              {t("Ir para a mesa")}
            </BotaoIrParaAba>
          </section>
        ) : null}

        {p.carta ? (
          <CartaDoDia slug={slug} cor={cor} tx={tx} cartaId={p.carta.id} nome={p.carta.nome} mensagem={p.carta.mensagem} foto={p.carta.foto} />
        ) : null}

        {p.avisos ? <AvisoDiario slug={slug} ta={p.ta} hora={p.avisos.hora} /> : null}

        {/* A continuidade: a última palavra da empresa, com o caminho para responder. */}
        {recado ? (
          <section className={CARTAO} data-testid="area-ultima-mensagem">
            <p className={SOBRETITULO}>
              {t("Um recado para você")} · {dataCurta(recado.quando)}
            </p>
            <p className={`${SERIF} mt-3 line-clamp-5 whitespace-pre-line text-[18px] leading-relaxed text-[#3a3347]`}>
              {recado.texto}
            </p>
            <p className="mt-2 text-sm font-semibold text-[#a8842f]">— {titulo}</p>
            <BotaoIrParaAba
              aba="conversa"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-white"
              style={{ background: cor }}
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("Responder")}
            </BotaoIrParaAba>
          </section>
        ) : null}

        <DiarioDoCliente
          slug={slug}
          cor={cor}
          tx={tx}
          entradas={dados.diario.map((d) => ({ id: d.id, texto: d.texto, quando: dataCurta(d.quando) }))}
        />
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
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e8f5ec] text-[#2f7a4f] ring-4 ring-[#f3faf5]">
                <Check className="size-5" strokeWidth={2.5} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#2f7a4f]">{t("Sua compra está confirmada")}</p>
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
            <ul className="mt-3 divide-y divide-[#efe7d6]">
              {dados.materiais.map((m) => {
                const Icone = ICONE_DO_MATERIAL[m.tipo];
                return (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-3.5">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f6f1e6] text-[#a8842f]">
                        <Icone className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {m.nome ?? (m.tipo === "documento" ? t("Material em PDF") : m.tipo === "audio" ? t("Áudio") : t("Vídeo"))}
                        </span>
                        <span className={DETALHE}>{dataCurta(m.quando)}</span>
                      </span>
                    </span>
                    <a href={`/c/${slug}/material/${m.id}`} className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold text-white" style={{ background: cor }}>
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
            <ul className="mt-3 divide-y divide-[#efe7d6]">
              {dados.compras.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3.5 text-[15px]">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{c.produto ?? t("Compra")}</span>
                    <span className={DETALHE}>{dataCurta(c.quando)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold">{dinheiro(c.valor_cents, c.currency)}</span>
                    {c.estornada ? (
                      <span className="text-xs text-[#a5611b]">{t("devolvido")}</span>
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
        {p.whatsapp ? (
          <a
            href={`https://wa.me/${p.whatsapp}`}
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-5 text-[16px] font-semibold text-white shadow-[0_10px_24px_-12px_rgba(31,157,85,0.8)] transition hover:brightness-110"
            data-testid="area-whatsapp"
          >
            <MessageCircle className="size-5" aria-hidden />
            {t("Falar com a gente no WhatsApp")}
          </a>
        ) : null}
        {dados.conversa.length > 0 ? (
          <ConversaGuardada
            tx={tx}
            empresa={titulo}
            falas={dados.conversa.map((f) => ({ id: f.id, de: f.de, texto: f.texto, quando: dataCurta(f.quando) }))}
          />
        ) : null}
      </div>
    </>
  );

  const explorar = (
    <>
      {topo(rotulos.explorar)}
      <div className={corpo}>
        {p.carteira ? <CarteiraDeCreditos slug={slug} cor={cor} tx={tx} tc={p.tc} inicial={p.carteira} tag={tag} /> : null}
        {p.mesa ? <MesaDeLeituras slug={slug} cor={cor} tx={tx} tm={p.tm} inicial={p.mesa} whatsapp={p.whatsapp} tag={tag} /> : null}

        {p.anoPessoal ? <AnoPessoalDoCliente slug={slug} cor={cor} tx={tx} to={to} {...p.anoPessoal} /> : null}

        {p.circulo ? (
          <CirculoDoCliente
            slug={slug}
            cor={cor}
            tx={tx}
            {...p.circulo}
            creditosPorMes={p.creditosDoCirculo ? `${t("Todo mês:")} +${p.creditosDoCirculo} ${t("créditos para usar nas leituras")}` : null}
          />
        ) : null}

        {vitrine.length > 0 ? (
          <VitrineObservada slug={slug}>
            <section className={CARTAO} data-testid="area-vitrine">
              <TituloDaSecao titulo={t("Para você")} />
              <div className="mt-4 space-y-3">
                {vitrine.map((s) => (
                  <article
                    key={s.id}
                    data-servico-id={s.id}
                    className={s.destaque ? "rounded-2xl border-2 border-[#c9a54e] bg-[#fdf9ef] p-5" : "rounded-2xl border border-[#ebe3d3] bg-[#fdfbf7] p-5"}
                  >
                    <h3 className={`${SERIF} text-xl leading-snug`}>{s.nome}</h3>
                    {s.descricao ? <p className={`mt-1.5 ${TEXTO_SUAVE}`}>{s.descricao}</p> : null}
                    {s.recebe ? (
                      <p className="mt-2 text-sm text-[#6f6880]">
                        <span className="font-semibold">{t("Você recebe:")}</span> {s.recebe}
                      </p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className={`${SERIF} text-2xl`}>{dinheiro(s.preco_cents, s.currency)}</span>
                      <a
                        href={`/c/${slug}/comprar/${s.id}`}
                        className="inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold text-white"
                        style={{ background: cor }}
                        data-testid="area-comprar"
                      >
                        {t("Quero este")}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
              {/* Compra direta é o caminho principal; a conversa fica à mão, para quem quiser tirar dúvida antes. */}
              {p.whatsapp ? (
                <p className={`mt-4 text-center ${TEXTO_SUAVE}`}>
                  {t("Prefere tirar uma dúvida antes?")}{" "}
                  <a
                    href={`https://wa.me/${p.whatsapp}`}
                    className="font-semibold underline underline-offset-4"
                    style={{ color: cor }}
                    data-testid="area-vitrine-whatsapp"
                  >
                    {t("Fale com a gente no WhatsApp")}
                  </a>
                </p>
              ) : null}
            </section>
          </VitrineObservada>
        ) : null}

        {p.presente ? <PresenteDoCliente slug={slug} cor={cor} tx={tx} to={to} preco={p.presente.preco} presentes={p.presente.presentes} /> : null}

        {/* O segundo pedido (aniversário) só depois de o primeiro (e-mail) estar resolvido. */}
        {dados.contato.email && !dados.contato.nascimento ? <AniversarioDoCliente slug={slug} cor={cor} tx={tx} /> : null}

        <DesejoDoCliente slug={slug} cor={cor} tx={tx} />
      </div>
    </>
  );

  const rodape = (
    <footer className="mx-auto max-w-xl px-4 pt-10 text-center" data-testid="area-rodape">
      <p className={`${SERIF} text-lg text-[#3a3347]`}>{titulo}</p>
      <p className={`mt-1 ${DETALHE}`}>
        {t("Área oficial de")} {p.assinatura}
      </p>
      <form action={`/c/${slug}/sair`} method="post" className="mt-3">
        <button type="submit" className="text-xs text-[#8b8497] underline underline-offset-4">
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
    </main>
  );
}
