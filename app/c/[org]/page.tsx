/**
 * /c/[org] — A ÁREA DO CLIENTE.
 *
 * Um endereço só para todos os clientes da empresa; o que aparece é de quem
 * está dentro (cookie da área). Sem sessão, a tela de entrar com o e-mail.
 *
 * O que a pessoa vê, de cima para baixo: o "Olá", a leitura (as cartas que
 * recebeu), os materiais, as compras, a vitrine de serviços, "o que você
 * gostaria de receber" e o botão para falar com a empresa. Tudo derivado do
 * que o Desk já tem — ver `lib/area-do-cliente/dados.ts`.
 */
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { semanaDoAniversario } from "@/lib/area-do-cliente/aniversario";
import { MENSAGEM_DO_DIA, cartaDoDia } from "@/lib/area-do-cliente/carta-do-dia";
import { carregarDadosDaArea, diaNoFuso, fotoDaCarta } from "@/lib/area-do-cliente/dados";
import { faseDaLua, proximaLua } from "@/lib/area-do-cliente/lua";
import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { nomeDoCookieDaArea, orgDaArea, sessaoDoCookie } from "@/lib/area-do-cliente/sessao";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  AniversarioDoCliente,
  CartaDoDia,
  DesejoDoCliente,
  DiarioDoCliente,
  EmailDoCliente,
  EntrarNaArea,
  VitrineObservada,
  type TextosDaArea,
} from "./_client";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string }>; searchParams: Promise<{ link?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  const idioma = await idiomaDoVisitante(null);
  return {
    title: org ? org.config.titulo || org.nome : traduzir("Área do cliente", idioma),
    robots: { index: false, follow: false },
  };
}

function dinheiro(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function dataCurta(iso: string, fuso: string, tag: string): string {
  return new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const ICONE_DO_MATERIAL = { documento: "📄", audio: "🎧", video: "🎬" } as const;

/** Os textos das partes que rodam no navegador, já traduzidos aqui no servidor. */
function textosDoNavegador(t: (s: string) => string): TextosDaArea {
  return {
    seuEmail: t("Seu e-mail"),
    receberCodigo: t("Receber código"),
    enviando: t("Enviando…"),
    codigoEnviadoAntes: t("Se este e-mail estiver no seu cadastro, você recebeu um código de 6 números. Ele vale 10 minutos."),
    codigo: t("Código"),
    entrar: t("Entrar"),
    entrando: t("Entrando…"),
    usarOutroEmail: t("Usar outro e-mail"),
    semConexao: t("Sem conexão. Confira a internet e tente de novo."),
    naoFoiPossivel: t("Não foi possível agora. Tente de novo."),
    desejoTitulo: t("O que você gostaria de receber de nós?"),
    desejoObrigada: t("Obrigada por contar. A gente lê cada resposta. 💜"),
    desejoExemplo: t("Ex.: uma leitura sobre o meu trabalho, um ritual para a lua cheia…"),
    enviar: t("Enviar"),
    guardeSeuAcesso: t("Guarde seu acesso"),
    comSeuEmail: t("Com seu e-mail você entra aqui de qualquer celular, mesmo sem este link."),
    salvar: t("Salvar"),
    prontoEntreCom: t("Pronto! Da próxima vez, entre com este e-mail:"),
    revelar: t("Toque para revelar a sua carta"),
    cartaDoDia: t("Sua carta de hoje"),
    seuDiario: t("Seu diário"),
    diarioConvite: t("Anote o que você pediu, o que sentiu ou o que aconteceu. Só você vê."),
    diarioExemplo: t("Hoje eu…"),
    salvo: t("Salvo."),
    aniversarioTitulo: t("Quando é o seu aniversário? 🎂"),
    aniversarioConvite: t("Conta pra gente: no seu dia a gente prepara algo especial só para você."),
    aniversarioObrigada: t("Anotado! No seu dia tem surpresa. 💜"),
  };
}

export default async function AreaDoCliente({ params, searchParams }: Props) {
  const { org: slug } = await params;
  const { link } = await searchParams;
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const tx = textosDoNavegador(t);
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org) notFound();

  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const titulo = org.config.titulo || org.nome;
  const jar = await cookies();
  const sessao = await sessaoDoCookie(admin, org, jar.get(nomeDoCookieDaArea(org.slug))?.value);

  if (!sessao) {
    return (
      <main className="min-h-screen bg-[#f7f5fb] px-4 py-10 text-[#1c1f24]">
        <div className="mx-auto max-w-md">
          <h1 className="text-center text-xl font-semibold">{titulo}</h1>
          <p className="mt-2 text-center text-sm text-[#5b6170]">{t("Sua área de cliente")}</p>
          {link === "vencido" || link === "invalido" ? (
            <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="area-link-recusado">
              {link === "vencido"
                ? t("Este link de acesso venceu. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")
                : t("Este link de acesso não vale mais. Entre com o seu e-mail abaixo, ou peça um link novo para a gente.")}
            </p>
          ) : null}
          <EntrarNaArea slug={org.slug} cor={cor} tx={tx} />
          {org.config.whatsapp ? (
            <p className="mt-8 text-center text-sm text-[#5b6170]">
              {t("Não cadastrou e-mail?")}{" "}
              <a className="font-medium underline" style={{ color: cor }} href={`https://wa.me/${org.config.whatsapp}`}>
                {t("Peça seu link pelo WhatsApp")}
              </a>
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  const dados = await carregarDadosDaArea(admin, { id: org.id, fuso: org.fuso }, sessao.contactId);
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "visitou",
    sessaoId: sessao.sessaoId,
    ref: "inicio",
  });

  const hoje = diaNoFuso(new Date().toISOString(), org.fuso);
  const carta = org.config.carta_do_dia ? cartaDoDia(sessao.contactId, hoje) : null;
  const fotoDaCartaDeHoje = carta ? await fotoDaCarta(admin, org.id, carta.id) : null;
  const fase = faseDaLua(new Date());
  const proximaCheia = proximaLua(new Date(), "cheia");
  const fraseDaLua =
    fase === "nova"
      ? t("Lua nova: tempo de plantar intenções. Escreva no diário o que você quer começar.")
      : fase === "crescente"
        ? t("Lua crescente: tempo de agir e dar o primeiro passo no que você planejou.")
        : fase === "cheia"
          ? t("Lua cheia: tempo de colher e agradecer o que já chegou.")
          : t("Lua minguante: tempo de soltar o que pesa e descansar.");
  const aniversarioNestaSemana = dados.contato.nascimento ? semanaDoAniversario(dados.contato.nascimento, hoje) : false;

  const ola = dados.contato.primeiroNome ? `${t("Olá")}, ${dados.contato.primeiroNome}` : t("Olá");
  const vitrine = dados.servicos.filter((s) => !s.ja_comprado);

  return (
    <main className="min-h-screen bg-[#f7f5fb] pb-16 text-[#1c1f24]">
      <header className="px-4 pb-8 pt-10 text-white" style={{ background: cor }}>
        <div className="mx-auto max-w-xl">
          <p className="text-sm opacity-80">{titulo}</p>
          <h1 className="mt-1 text-2xl font-semibold" data-testid="area-ola">
            {ola} 💜
          </h1>
          <p className="mt-2 text-sm opacity-90">{org.config.boas_vindas || t("Aqui fica tudo o que é seu.")}</p>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-xl space-y-4 px-4">
        {aniversarioNestaSemana ? (
          <section className="rounded-2xl bg-white p-5 text-center shadow-sm" data-testid="area-feliz-aniversario">
            <p className="text-2xl">🎂</p>
            <h2 className="mt-1 text-lg font-semibold">
              {t("Feliz aniversário")}
              {dados.contato.primeiroNome ? `, ${dados.contato.primeiroNome}` : ""}!
            </h2>
            <p className="mt-1 text-sm text-[#4b5563]">{t("Um ano novo começa para você. Que ele venha leve e cheio de bons encontros.")}</p>
          </section>
        ) : null}

        {carta ? (
          <CartaDoDia
            slug={org.slug}
            cor={cor}
            tx={tx}
            cartaId={carta.id}
            nome={t(carta.nome)}
            mensagem={t(MENSAGEM_DO_DIA[carta.id] ?? "")}
            foto={fotoDaCartaDeHoje}
          />
        ) : null}

        <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-lua">
          <h2 className="text-base font-semibold">
            {fase === "nova" ? "🌑 " : fase === "crescente" ? "🌓 " : fase === "cheia" ? "🌕 " : "🌗 "}
            {fase === "nova" ? t("Lua nova") : fase === "crescente" ? t("Lua crescente") : fase === "cheia" ? t("Lua cheia") : t("Lua minguante")}
          </h2>
          <p className="mt-1 text-sm text-[#4b5563]">{fraseDaLua}</p>
          {fase !== "cheia" ? (
            <p className="mt-2 text-xs text-[#6b7280]">
              {t("Próxima lua cheia:")} {dataCurta(proximaCheia.toISOString(), org.fuso, tagDeIdioma(idioma))}
            </p>
          ) : null}
        </section>

        {dados.leitura.length > 0 ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-leitura">
            <h2 className="text-base font-semibold">{t("Sua leitura")}</h2>
            <div className="mt-3 space-y-4">
              {dados.leitura.map((grupo) => (
                <div key={grupo.dia}>
                  <p className="text-xs text-[#6b7280]">{dataCurta(`${grupo.dia}T12:00:00Z`, "UTC", tagDeIdioma(idioma))}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {grupo.itens.map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, sem otimizador
                      <img key={i.id} src={i.url} alt={t("Carta da sua leitura")} className="aspect-[3/5] w-full rounded-lg object-cover" loading="lazy" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-materiais">
          <h2 className="text-base font-semibold">{t("Seus materiais")}</h2>
          {dados.materiais.length === 0 ? (
            <p className="mt-2 text-sm text-[#6b7280]">{t("Quando a gente te enviar um material, ele aparece aqui para você abrir quando quiser.")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-[#eef0f3]">
              {dados.materiais.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="min-w-0 truncate text-sm">
                    {ICONE_DO_MATERIAL[m.tipo]}{" "}
                    {m.nome ?? (m.tipo === "documento" ? t("Material em PDF") : m.tipo === "audio" ? t("Áudio") : t("Vídeo"))}
                    <span className="ml-2 text-xs text-[#9ca3af]">{dataCurta(m.quando, org.fuso, tagDeIdioma(idioma))}</span>
                  </span>
                  <a
                    href={`/c/${org.slug}/material/${m.id}`}
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ background: cor }}
                  >
                    {t("Abrir")}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {dados.compras.length > 0 ? (
          <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-compras">
            <h2 className="text-base font-semibold">{t("Suas compras")}</h2>
            <ul className="mt-3 divide-y divide-[#eef0f3]">
              {dados.compras.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.produto ?? t("Compra")}</span>
                    <span className="text-xs text-[#6b7280]">{dataCurta(c.quando, org.fuso, tagDeIdioma(idioma))}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block">{dinheiro(c.valor_cents, c.currency)}</span>
                    <span className={c.estornada ? "text-xs text-[#b45309]" : "text-xs text-[#15803d]"}>
                      {c.estornada ? t("devolvido") : t("pago ✓")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {vitrine.length > 0 ? (
          <VitrineObservada slug={org.slug}>
            <section className="rounded-2xl bg-white p-5 shadow-sm" data-testid="area-vitrine">
              <h2 className="text-base font-semibold">{t("Para você")}</h2>
              <div className="mt-3 space-y-3">
                {vitrine.map((s) => (
                  <article
                    key={s.id}
                    data-servico-id={s.id}
                    className={s.destaque ? "rounded-xl border-2 p-4" : "rounded-xl border border-[#eef0f3] p-4"}
                    style={s.destaque ? { borderColor: cor } : undefined}
                  >
                    <h3 className="font-semibold">{s.nome}</h3>
                    {s.descricao ? <p className="mt-1 text-sm text-[#4b5563]">{s.descricao}</p> : null}
                    {s.recebe ? <p className="mt-2 text-xs text-[#6b7280]">{t("Você recebe:")} {s.recebe}</p> : null}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-semibold">{dinheiro(s.preco_cents, s.currency)}</span>
                      <a
                        href={`/c/${org.slug}/comprar/${s.id}`}
                        className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                        style={{ background: cor }}
                        data-testid="area-comprar"
                      >
                        {t("Quero este")}
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </VitrineObservada>
        ) : null}

        <DiarioDoCliente
          slug={org.slug}
          cor={cor}
          tx={tx}
          entradas={dados.diario.map((d) => ({ id: d.id, texto: d.texto, quando: dataCurta(d.quando, org.fuso, tagDeIdioma(idioma)) }))}
        />

        {!dados.contato.nascimento ? <AniversarioDoCliente slug={org.slug} cor={cor} tx={tx} /> : null}

        <DesejoDoCliente slug={org.slug} cor={cor} tx={tx} />

        {!dados.contato.email ? <EmailDoCliente slug={org.slug} cor={cor} tx={tx} /> : null}

        {org.config.whatsapp ? (
          <a
            href={`https://wa.me/${org.config.whatsapp}`}
            className="block rounded-2xl bg-[#25d366] px-5 py-4 text-center font-semibold text-white shadow-sm"
            data-testid="area-whatsapp"
          >
            {t("Falar com a gente no WhatsApp")}
          </a>
        ) : null}

        <form action={`/c/${org.slug}/sair`} method="post" className="pt-2 text-center">
          <button type="submit" className="text-xs text-[#9ca3af] underline">
            {t("Sair deste aparelho")}
          </button>
        </form>
      </div>
    </main>
  );
}
