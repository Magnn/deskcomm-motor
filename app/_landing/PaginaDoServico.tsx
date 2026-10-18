import Link from "next/link";

import { branding } from "@/lib/branding";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";
import { valorDaInstalacao } from "@/lib/instalacao/config";
import { regraDaTaxaDaInstalacao } from "@/lib/pagamentos/taxa-da-instalacao";
import { regraTemTaxa } from "@/lib/pagamentos/taxa-da-plataforma";
import { planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { precoLegivel, type Plano } from "@/lib/planos/catalogo";

/**
 * A PÁGINA PRINCIPAL DE QUEM VENDE A INSTALAÇÃO COMO SERVIÇO.
 *
 * Vale quando `PLANS_ENFORCED=true`: aí a instalação cobra plano, e a página aberta ("open source, sem
 * cobrança por usuário, pedir acesso") diria o contrário do que o visitante vai encontrar. Medido em
 * 18/10/2026 na instalação do AcassIA: a página dizia "instalação própria" para quem ia assinar um plano,
 * e o analista da Meta lê este site para entender o serviço.
 *
 * Nada aqui é escrito à mão por instalação: preço, números e franquia saem do catálogo (`PLANS_CATALOG`),
 * o excedente de `STRIPE_PLANS_EXCEDENTE_CENTAVOS`, a taxa por venda da regra da instalação, e a empresa do
 * rodapé dos mesmos `OPERADOR_RAZAO_SOCIAL`/`OPERADOR_CNPJ` que as páginas legais mostram ao visitante — nunca
 * `resolverOperador`, que para quem está logado devolve a empresa DO CLIENTE e publicaria o CNPJ dele aqui. Os recursos listados são os que existem no produto.
 */

type T = (texto: string) => string;

const RECURSOS = [
  {
    titulo: "Todas as conversas num lugar só",
    texto: "WhatsApp, Instagram, Messenger, Telegram e o chat do seu site chegam na mesma caixa de entrada, com o histórico de cada cliente.",
  },
  {
    titulo: "Agentes de IA que atendem e vendem",
    texto: "O agente responde na hora, tira dúvidas, apresenta a oferta, negocia dentro dos limites que você define e manda o link de pagamento.",
  },
  {
    titulo: "Uma pessoa assume quando precisa",
    texto: "Quando o cliente pede ou a conversa sai do roteiro, o agente passa para alguém da equipe com todo o contexto.",
  },
  {
    titulo: "WhatsApp oficial em poucos cliques",
    texto: "Conecte o número pela conta do Facebook, sem copiar token nem configurar nada no painel da Meta. Ou use o QR code.",
  },
  {
    titulo: "Funil que se move sozinho",
    texto: "Cada cliente vira um cartão que avança conforme a conversa. Você vê onde cada venda está e o que falta para fechar.",
  },
  {
    titulo: "Quem sumiu recebe um lembrete",
    texto: "Mensagens de retorno no tempo certo e campanhas para a sua base, respeitando quem pediu para não receber.",
  },
] as const;

const PASSOS = [
  {
    titulo: "Crie sua conta",
    texto: "Leva um minuto. Você monta o agente, o funil e as respostas antes de pagar qualquer coisa.",
  },
  {
    titulo: "Conecte o WhatsApp",
    texto: "Escolha um plano e conecte o seu número pela conta do Facebook ou pelo QR code.",
  },
  {
    titulo: "Deixe o agente atender",
    texto: "O agente começa em modo de teste. Quando estiver do seu jeito, libere para os clientes.",
  },
] as const;

const PERGUNTAS = [
  {
    pergunta: "Preciso pagar para testar?",
    resposta: "Não. Criar a conta, montar o agente e o funil é grátis. O plano é cobrado quando você conecta um número de WhatsApp.",
  },
  {
    pergunta: "O que conta como uma conversa da IA?",
    resposta: "Cada cliente atendido pelo agente de IA dentro do mês conta uma vez, não importa quantas mensagens a conversa tenha. Conversas atendidas só pela equipe não entram na conta.",
  },
  {
    pergunta: "A IA substitui a minha equipe?",
    resposta: "Não. O agente segue as regras que você configura e passa a conversa para uma pessoa quando é preciso, com todo o contexto.",
  },
  {
    pergunta: "Posso usar o número que já tenho?",
    resposta: "Pode. Pela API oficial da Meta, ou mantendo o aplicativo do WhatsApp Business no celular junto com a plataforma.",
  },
  {
    pergunta: "E se eu quiser cancelar?",
    resposta: "O plano é mensal, sem fidelidade. Você cancela quando quiser, pela própria conta.",
  },
] as const;

function reais(centavos: number): string {
  return precoLegivel(centavos);
}

function percentual(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** A frase da taxa por venda, ou `null` quando a instalação não cobra taxa. */
function fraseDaTaxa(t: T): string | null {
  const regra = regraDaTaxaDaInstalacao();
  if (!regraTemTaxa(regra)) return null;
  const partes = [
    regra.fixoCentavos > 0 ? reais(regra.fixoCentavos) : null,
    regra.percentualBp > 0 ? percentual(regra.percentualBp) : null,
  ].filter(Boolean);
  const teto = regra.tetoCentavos > 0 ? ` ${t("(no máximo")} ${reais(regra.tetoCentavos)})` : "";
  return `${t("Vendas recebidas pela plataforma:")} ${partes.join(" + ")} ${t("por venda")}${teto}.`;
}

function CartaoDoPlano({ plano, destaque, excedente, t }: { plano: Plano; destaque: boolean; excedente: number; t: T }) {
  const itens = [
    plano.numeros === 1 ? t("1 número de WhatsApp") : `${plano.numeros} ${t("números de WhatsApp")}`,
    plano.conversasMensais > 0
      ? `${plano.conversasMensais.toLocaleString("pt-BR")} ${t("conversas atendidas pela IA por mês")}`
      : t("IA incluída no plano"),
    t("Equipe sem limite de usuários"),
    t("Agentes, funis e campanhas"),
  ];
  return (
    <article
      className={`flex flex-col rounded-xl border bg-surface p-6 ${destaque ? "border-accent shadow-lg" : "border-border"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold tracking-tight">{plano.nome}</h3>
        {destaque ? (
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">{t("Mais escolhido")}</span>
        ) : null}
      </div>
      <p className="mt-4">
        <span className="text-4xl font-bold tracking-[-0.04em]">{reais(plano.precoMensalCentavos)}</span>
        <span className="text-sm text-text-muted">{t("/mês")}</span>
      </p>
      <ul className="mt-6 flex-1 space-y-3 text-sm text-text-muted">
        {itens.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-accent">
              ✓
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {plano.conversasMensais > 0 && excedente > 0 ? (
        <p className="mt-5 text-xs leading-5 text-text-subtle">
          {t("Passou da franquia,")} {reais(excedente)} {t("por conversa a mais.")}
        </p>
      ) : null}
      <Link
        href="/signup"
        className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold transition-colors ${
          destaque
            ? "bg-accent text-accent-fg hover:bg-accent-hover"
            : "border border-border-strong text-text hover:bg-surface-elevated"
        }`}
      >
        {t("Começar com o")} {plano.nome}
      </Link>
    </article>
  );
}

export async function PaginaDoServico({ idioma }: { idioma: Idioma }) {
  const t: T = (texto) => traduzir(texto, idioma);
  const marca = branding();
  const nome = marca.name;
  const planos = planosDaInstalacao();
  // O do meio é o destaque quando há três ou mais — o padrão de quem vende em degraus.
  const indiceDoDestaque = planos.length >= 3 ? 1 : -1;
  const excedente = env.STRIPE_PLANS_EXCEDENTE_CENTAVOS;
  const taxa = fraseDaTaxa(t);
  const razaoSocial = (await valorDaInstalacao("OPERADOR_RAZAO_SOCIAL")).valor?.trim() || null;
  const cnpj = (await valorDaInstalacao("OPERADOR_CNPJ")).valor?.trim() || null;

  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label={nome} className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-fg">
              {marca.initial}
            </span>
            <span className="text-base font-bold tracking-[-0.04em]">{nome}</span>
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label={t("Navegação principal")}>
            {(
              [
                ["#recursos", t("Recursos")],
                ["#como-funciona", t("Como funciona")],
                ["#planos", t("Planos")],
                ["#perguntas", t("Perguntas")],
              ] as const
            ).map(([href, rotulo]) => (
              <Link key={href} href={href} className="text-sm text-text-muted hover:text-text">
                {rotulo}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="rounded-lg px-2 py-2 text-sm font-bold text-text-muted hover:text-text">
              {t("Entrar")}
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-bold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t("Criar conta")}
            </Link>
          </div>
        </div>
      </header>

      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-xl">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-accent uppercase">
              {t("WhatsApp · agentes de IA · funil de vendas")}
            </p>
            <h1 className="mt-5 text-4xl leading-[1.05] font-bold tracking-[-0.05em] sm:text-6xl">
              {t("Seu WhatsApp atendendo e vendendo o dia inteiro.")}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-text-muted sm:text-lg">
              {t(
                "Agentes de IA respondem cada cliente na hora, conduzem até o pagamento e chamam a sua equipe quando precisa. Tudo numa caixa de entrada só.",
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center rounded-lg bg-accent px-5 text-sm font-bold text-accent-fg transition-colors hover:bg-accent-hover"
              >
                {t("Criar conta grátis")}
              </Link>
              <Link
                href="#planos"
                className="inline-flex min-h-12 items-center rounded-lg border border-border-strong px-5 text-sm font-bold text-text hover:bg-surface"
              >
                {t("Ver planos")}
              </Link>
            </div>
            <p className="mt-5 text-xs leading-5 text-text-subtle">
              {t("Sem cartão para começar · você só paga ao conectar o número")}
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[590px]" aria-label={t("Prévia ilustrativa do atendimento")}>
            <div className="overflow-hidden rounded-xl border border-border bg-surface p-4 shadow-xl sm:p-6">
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-sm font-bold">{t("Caixa de entrada")}</p>
                  <p className="mt-1 text-xs text-text-subtle">{t("WhatsApp · agora")}</p>
                </div>
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent">
                  {t("Agente atendendo")}
                </span>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6">
                <p className="w-fit max-w-[88%] rounded-xl rounded-tl-sm bg-surface-elevated px-4 py-3 text-text-muted">
                  {t("Oi! Vi o anúncio. Ainda tem horário para sábado?")}
                </p>
                <p className="ml-auto w-fit max-w-[90%] rounded-xl rounded-tr-sm bg-accent-soft px-4 py-3 text-text">
                  {t("Tem sim! Sábado às 10h ou às 15h. Qual fica melhor para você?")}
                </p>
                <p className="w-fit max-w-[88%] rounded-xl rounded-tl-sm bg-surface-elevated px-4 py-3 text-text-muted">
                  {t("15h. Como faço para reservar?")}
                </p>
                <p className="ml-auto w-fit max-w-[90%] rounded-xl rounded-tr-sm bg-accent-soft px-4 py-3 text-text">
                  {t("Reservei para você. Aqui está o link do sinal, assim que pagar já fica confirmado.")}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
                {[
                  [t("Cliente"), "Marina"],
                  [t("Etapa"), t("Pagamento")],
                  [t("Próximo passo"), t("Confirmar sinal")],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="rounded-lg bg-surface-elevated p-3">
                    <p className="text-[10px] tracking-wide text-text-subtle uppercase">{rotulo}</p>
                    <p className="mt-1 truncate text-xs font-semibold">{valor}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] text-text-subtle">
              {t("Prévia ilustrativa, não é uma captura do produto.")}
            </p>
          </div>
        </div>
      </section>

      <section id="recursos" className="scroll-mt-20 border-y border-border bg-surface px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("Recursos")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              {t("Tudo o que acontece entre a primeira mensagem e a venda.")}
            </h2>
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((item) => (
              <article key={item.titulo} className="border-t border-border-strong pt-5">
                <h3 className="text-lg font-bold tracking-tight">{t(item.titulo)}</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">{t(item.texto)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("Como funciona")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">{t("No ar em três passos.")}</h2>
          </div>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {PASSOS.map((passo, i) => (
              <li key={passo.titulo} className="rounded-xl border border-border bg-surface p-6">
                <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-sm font-bold text-accent">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{t(passo.titulo)}</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">{t(passo.texto)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="planos" className="scroll-mt-20 border-y border-border bg-surface-elevated px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("Planos")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              {t("Escolha pelo tamanho da sua operação.")}
            </h2>
            <p className="mt-4 text-sm leading-6 text-text-muted">
              {t("Mensal, sem fidelidade. Criar a conta e montar o agente é grátis.")}
            </p>
          </div>
          <div className={`mt-10 grid gap-6 ${planos.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
            {planos.map((plano, i) => (
              <CartaoDoPlano key={plano.id} plano={plano} destaque={i === indiceDoDestaque} excedente={excedente} t={t} />
            ))}
          </div>
          <div className="mt-8 space-y-1 text-xs leading-5 text-text-subtle">
            {taxa ? <p>{taxa}</p> : null}
            <p>{t("As mensagens que a Meta cobra no WhatsApp oficial são pagas direto à Meta, pela sua conta.")}</p>
          </div>
        </div>
      </section>

      <section id="perguntas" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-accent uppercase">{t("Perguntas")}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em]">{t("Antes de começar.")}</h2>
          </div>
          <div className="divide-y divide-border border-y border-border">
            {PERGUNTAS.map((item) => (
              <details key={item.pergunta} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold">
                  {t(item.pergunta)}
                  <span aria-hidden="true" className="text-text-subtle transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-text-muted">{t(item.resposta)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 rounded-xl bg-accent p-8 text-accent-fg sm:p-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-[-0.04em] sm:text-3xl">{t("Comece hoje, pague só quando conectar.")}</h2>
            <p className="mt-2 text-sm opacity-90">{t("Monte seu agente em minutos e veja ele atender antes de decidir.")}</p>
          </div>
          <Link
            href="/signup"
            className="inline-flex min-h-12 shrink-0 items-center rounded-lg bg-surface px-5 text-sm font-bold text-text hover:bg-surface-elevated"
          >
            {t("Criar conta grátis")}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 text-sm text-text-muted md:flex-row md:items-start md:justify-between">
          <div>
            <p className="font-bold text-text">{nome}</p>
            {razaoSocial ? (
              <p className="mt-1 text-xs">
                {razaoSocial}
                {cnpj ? ` · CNPJ ${cnpj}` : ""}
              </p>
            ) : null}
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label={t("Links legais")}>
            <Link href="/legal/terms" className="hover:text-text">
              {t("Termos de uso")}
            </Link>
            <Link href="/legal/privacy" className="hover:text-text">
              {t("Privacidade")}
            </Link>
            <Link href="/legal/data-deletion" className="hover:text-text">
              {t("Exclusão de dados")}
            </Link>
            <Link href="/login" className="hover:text-text">
              {t("Entrar")}
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
