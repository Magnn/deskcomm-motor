import Link from "next/link";

import { branding } from "@/lib/branding";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { traduzir } from "@/lib/i18n/dicionario";

const PONTOS = [
  {
    title: "A conversa fica ligada ao cliente",
    text: "Histórico, dados e próximos passos permanecem juntos para a equipe continuar de onde parou.",
  },
  {
    title: "A IA trabalha com contexto",
    text: "Configure o que o agente sabe, como conduz cada objetivo e quando chama uma pessoa.",
  },
  {
    title: "O funil mostra o que vem depois",
    text: "Cada lead avança com uma etapa clara, sem depender da memória de quem atendeu.",
  },
];

const PERGUNTAS = [
  {
    question: "O que este sistema reúne?",
    answer: "CRM, atendimento por WhatsApp, funil de vendas e agentes de IA na mesma operação.",
  },
  {
    question: "Existe mensalidade por usuário?",
    answer:
      "O software é open source e não cobra por usuário. Você escolhe a infraestrutura e os serviços externos que deseja conectar.",
  },
  {
    question: "A IA substitui a equipe?",
    answer:
      "Não. O agente segue as regras configuradas e pode encaminhar a conversa para uma pessoa com o contexto do atendimento.",
  },
];

function t(texto: string, idioma: Awaited<ReturnType<typeof idiomaDoVisitante>>) {
  return traduzir(texto, idioma);
}

export async function generateMetadata() {
  const idioma = await idiomaDoVisitante(null);
  return {
    title: `${branding().name} — ${t("Vendas e atendimento em uma só operação", idioma)}`,
    description: t(
      "CRM, WhatsApp e agentes de IA trabalhando juntos, com sua equipe no controle.",
      idioma,
    ),
  };
}

export default async function HomePage() {
  const idioma = await idiomaDoVisitante(null);
  const nome = branding().name;
  const marca = branding();

  return (
    <main className="min-h-screen bg-[#faf9f6] text-[#1c1a16]">
      <header className="sticky top-0 z-40 border-b border-[#e7e3da] bg-[#faf9f6]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label={nome} className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-[#67885d] text-lg font-bold text-white">
              {marca.initial}
            </span>
            <span className="text-base font-bold tracking-[-0.04em]">{nome}</span>
          </Link>
          <nav
            className="hidden items-center gap-7 md:flex"
            aria-label={t("Navegação principal", idioma)}
          >
            <Link href="#como-funciona" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              {t("Como funciona", idioma)}
            </Link>
            <Link href="#controle" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              {t("Seu controle", idioma)}
            </Link>
            <Link href="#perguntas" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              {t("Perguntas", idioma)}
            </Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="rounded-lg px-2 py-2 text-sm font-bold text-[#46433b]">
              {t("Entrar", idioma)}
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-10 items-center rounded-lg bg-[#67885d] px-4 text-sm font-bold text-white transition-colors hover:bg-[#506d48]"
            >
              {t("Pedir acesso", idioma)}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 py-16 sm:px-8 sm:py-24">
        <div className="pointer-events-none absolute top-10 -right-40 size-[32rem] rounded-full bg-[#e9e7dd] opacity-70 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="max-w-xl">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#56734e] uppercase">
              {t("CRM · WhatsApp · inteligência artificial", idioma)}
            </p>
            <h1 className="mt-5 text-4xl leading-[1.04] font-bold tracking-[-0.055em] sm:text-6xl">
              {t("Toda conversa pode levar a um próximo passo.", idioma)}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-[#5d594f] sm:text-lg">
              {t(
                "Atenda no WhatsApp, entenda cada oportunidade e conduza o lead com uma equipe e agentes de IA trabalhando no mesmo contexto.",
                idioma,
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex min-h-12 items-center rounded-lg bg-[#67885d] px-5 text-sm font-bold text-white transition-colors hover:bg-[#506d48]"
              >
                {t("Conhecer o sistema", idioma)}
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center rounded-lg border border-[#d9d5c9] px-5 text-sm font-bold text-[#38362f] hover:bg-white"
              >
                {t("Já tenho acesso", idioma)}
              </Link>
            </div>
            <p className="mt-5 text-xs leading-5 text-[#7d786c]">
              {t("Open source · instalação própria · sem cobrança por usuário", idioma)}
            </p>
          </div>

          <div
            className="relative mx-auto w-full max-w-[590px]"
            aria-label={t("Prévia ilustrativa do atendimento", idioma)}
          >
            <div
              className="absolute -inset-5 rounded-[2.5rem] bg-[#e9e7dd] blur-2xl"
              aria-hidden="true"
            />
            <div className="relative overflow-hidden rounded-3xl border border-[#d9d5c9] bg-white p-4 shadow-[0_24px_64px_rgba(20,18,14,0.12)] sm:p-6">
              <div className="flex items-center justify-between border-b border-[#e7e3da] pb-4">
                <div>
                  <p className="text-sm font-bold">{t("Caixa de entrada", idioma)}</p>
                  <p className="mt-1 text-xs text-[#7d786c]">
                    {t("Conversa com contexto", idioma)}
                  </p>
                </div>
                <span className="rounded-full bg-[#eef2e9] px-3 py-1 text-xs font-bold text-[#486441]">
                  {t("Agente ativo", idioma)}
                </span>
              </div>
              <div className="mt-5 space-y-3 text-sm leading-6">
                <p className="w-fit max-w-[88%] rounded-2xl rounded-tl-sm bg-[#f3f1ec] px-4 py-3 text-[#46433b]">
                  {t("Olá! Vi vocês no Instagram. Como funciona?", idioma)}
                </p>
                <p className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-tr-sm bg-[#e9efe4] px-4 py-3 text-[#29271f]">
                  {t("Posso explicar. O que você gostaria de organizar primeiro?", idioma)}
                </p>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#e7e3da] pt-4">
                {[
                  [t("Lead", idioma), "Marina"],
                  [t("Etapa", idioma), t("Qualificação", idioma)],
                  [t("Próximo passo", idioma), t("Entender a necessidade", idioma)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f3f1ec] p-3">
                    <p className="text-[10px] tracking-wide text-[#7d786c] uppercase">{label}</p>
                    <p className="mt-1 truncate text-xs font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="relative mt-3 text-center text-[10px] text-[#7d786c]">
              {t("Prévia ilustrativa, não é uma captura do produto.", idioma)}
            </p>
          </div>
        </div>
      </section>

      <section
        id="como-funciona"
        className="border-y border-[#e7e3da] bg-white px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#56734e] uppercase">
              {t("Uma operação conectada", idioma)}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
              {t("Da primeira mensagem ao próximo passo.", idioma)}
            </h2>
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {PONTOS.map((item, index) => (
              <article key={item.title} className="border-t border-[#d9d5c9] pt-5">
                <p className="font-mono text-xs text-[#67885d]">0{index + 1}</p>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{t(item.title, idioma)}</h3>
                <p className="mt-2 text-sm leading-6 text-[#5d594f]">{t(item.text, idioma)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="controle" className="px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 rounded-3xl bg-[#eeeee6] p-7 sm:p-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#56734e] uppercase">
              {t("Seu negócio, suas regras", idioma)}
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-[-0.045em]">
              {t("Tecnologia aberta. Controle com você.", idioma)}
            </h2>
          </div>
          <div>
            <p className="text-sm leading-7 text-[#5d594f]">
              {t(
                "O software é open source sob licença MIT. Hospede onde preferir, conecte os serviços que fazem sentido para sua operação e mantenha seus dados no ambiente que você controla.",
                idioma,
              )}
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-[#073f60] px-4 text-sm font-bold text-white hover:bg-[#0b5279]"
            >
              {t("Começar", idioma)}
            </Link>
          </div>
        </div>
      </section>

      <section
        id="perguntas"
        className="border-t border-[#e7e3da] bg-white px-5 py-16 sm:px-8 sm:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-[-0.045em]">
            {t("Perguntas frequentes", idioma)}
          </h2>
          <div className="mt-7 divide-y divide-[#e7e3da] border-y border-[#e7e3da]">
            {PERGUNTAS.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base">
                  {t(item.question, idioma)}
                  <span className="font-mono text-lg font-normal text-[#67885d]" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl pr-8 text-sm leading-6 text-[#5d594f]">
                  {t(item.answer, idioma)}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-[#faf9f6] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <span className="text-sm font-bold">{nome}</span>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-[#5d594f]">
            <Link href="/login" className="hover:text-[#1c1a16]">
              {t("Entrar", idioma)}
            </Link>
            <Link href="/legal/terms" className="hover:text-[#1c1a16]">
              {t("Termos", idioma)}
            </Link>
            <Link href="/legal/privacy" className="hover:text-[#1c1a16]">
              {t("Privacidade", idioma)}
            </Link>
          </nav>
          <span className="font-mono text-[10px] text-[#7d786c]">MIT</span>
        </div>
      </footer>
    </main>
  );
}
