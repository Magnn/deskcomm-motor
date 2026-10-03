import Link from "next/link";

const GITHUB_URL = "https://github.com/melgarafael/DeskcommCRM";
const INSTALL_URL = `${GITHUB_URL}#-instalar-na-sua-vps-o-caminho-principal`;
const HOSTGATOR_URL = "https://www.hostgator.com.br/52708-141-3-52.html";

const CAPABILITIES = [
  {
    number: "01",
    title: "A conversa vira contexto",
    text: "Histórico, dados do contato e o que já foi combinado ficam junto do atendimento.",
  },
  {
    number: "02",
    title: "A IA entende antes de responder",
    text: "O agente consulta as informações da empresa, segue regras definidas e pede ajuda quando precisa.",
  },
  {
    number: "03",
    title: "O próximo passo não se perde",
    text: "Conversa, lead e funil trabalham juntos. A equipe recebe o contexto quando assume o atendimento.",
  },
];

const QUESTIONS = [
  {
    question: "O que é o DeskcommCRM?",
    answer:
      "É um sistema operacional de vendas open source: CRM, atendimento por WhatsApp e agentes de IA no mesmo lugar.",
  },
  {
    question: "O Deskcomm cobra mensalidade por usuário?",
    answer:
      "Não. O software é MIT, sem versão paga nem recursos bloqueados. Você paga a infraestrutura onde hospeda o sistema e o consumo dos serviços externos que conectar, como provedores de IA.",
  },
  {
    question: "Preciso saber programar para instalar?",
    answer:
      "O kit de instalação automatiza boa parte da configuração. Ainda será preciso ter uma VPS, domínio e as credenciais dos serviços usados. O guia mostra os pré-requisitos e cada etapa.",
  },
  {
    question: "A IA substitui os atendentes?",
    answer:
      "Não precisa. O agente pode cuidar das tarefas configuradas e encaminhar conversas para uma pessoa com o contexto do atendimento.",
  },
];

function Marca() {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label="DeskcommCRM">
      <span className="grid size-9 place-items-center rounded-xl bg-[#67885d] text-lg font-bold text-white">
        D
      </span>
      <span className="text-base font-bold tracking-[-0.04em] text-[#1c1a16]">
        Deskcomm<span className="font-normal text-[#5d594f]">CRM</span>
      </span>
    </span>
  );
}

function MesaPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[590px]"
      aria-label="Prévia ilustrativa da operação comercial no DeskcommCRM"
    >
      <div
        className="absolute -inset-6 rounded-[2.5rem] bg-[#e9e7dd] blur-2xl"
        aria-hidden="true"
      />
      <div className="relative overflow-hidden rounded-[1.5rem] border border-[#d9d5c9] bg-[#faf9f6] p-3 shadow-[0_24px_64px_rgba(20,18,14,0.12)] sm:p-4">
        <div className="flex items-center justify-between border-b border-[#e7e3da] px-2 pb-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#67885d]" />
            <span className="text-xs font-bold text-[#1c1a16]">Mesa comercial</span>
          </div>
          <span className="font-mono text-[10px] text-[#7d786c]">VISÃO DA OPERAÇÃO</span>
        </div>

        <div className="grid gap-3 py-3 sm:grid-cols-[0.88fr_1.12fr]">
          <div className="rounded-xl border border-[#e7e3da] bg-white p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#1c1a16]">Conversas</span>
              <span className="rounded-full bg-[#eef2e9] px-2 py-0.5 text-[9px] font-bold text-[#486441]">
                3 abertas
              </span>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-[#d8e2d2] bg-[#f4f7f1] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-[#29271f]">Marina Costa</span>
                  <span className="font-mono text-[9px] text-[#7d786c]">10:42</span>
                </div>
                <p className="mt-1 truncate text-[10px] text-[#5d594f]">
                  Queria entender como funciona...
                </p>
                <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-[9px] text-[#5d594f]">
                  Lead novo
                </span>
              </div>
              <div className="rounded-lg p-2.5">
                <span className="text-[10px] font-semibold text-[#46433b]">Rafael Lima</span>
                <p className="mt-1 truncate text-[10px] text-[#7d786c]">
                  Pode me mandar as opções?
                </p>
              </div>
              <div className="rounded-lg p-2.5">
                <span className="text-[10px] font-semibold text-[#46433b]">Paula Santos</span>
                <p className="mt-1 truncate text-[10px] text-[#7d786c]">
                  Vou confirmar com a equipe
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#e7e3da] bg-white p-3">
            <div className="flex items-center justify-between border-b border-[#f0eee8] pb-2.5">
              <div>
                <p className="text-[10px] font-bold text-[#1c1a16]">Marina Costa</p>
                <p className="mt-0.5 text-[9px] text-[#7d786c]">WhatsApp · agente comercial</p>
              </div>
              <span className="rounded-full bg-[#eef2e9] px-2 py-1 text-[9px] font-bold text-[#486441]">
                IA ativa
              </span>
            </div>
            <div className="space-y-2.5 py-3">
              <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-[#f3f1ec] p-2.5 text-[10px] leading-4 text-[#46433b]">
                Oi! Vi vocês no Instagram e queria saber como funciona.
              </div>
              <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-[#e9efe4] p-2.5 text-[10px] leading-4 text-[#29271f]">
                Oi, Marina! Posso explicar. O que você gostaria de organizar primeiro no seu
                atendimento?
              </div>
              <div className="rounded-lg border border-dashed border-[#d2cdbf] bg-[#faf9f6] p-2.5">
                <p className="font-mono text-[9px] font-medium text-[#7d786c]">PRÓXIMO PASSO</p>
                <p className="mt-1 text-[10px] font-semibold text-[#46433b]">
                  Entender a necessidade do contato
                </p>
              </div>
            </div>
            <div className="rounded-full border border-[#e7e3da] px-3 py-2 text-[9px] text-[#a9a395]">
              Resposta registrada · revisão disponível
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-[#e7e3da] pt-3">
          {[
            ["LEAD", "Marina Costa"],
            ["ETAPA", "Qualificação"],
            ["RESPONSÁVEL", "Agente + equipe"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-[#f3f1ec] px-2.5 py-2">
              <p className="font-mono text-[8px] text-[#7d786c]">{label}</p>
              <p className="mt-1 truncate text-[9px] font-semibold text-[#46433b]">{value}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="relative mt-3 text-center text-[10px] text-[#7d786c]">
        Prévia ilustrativa da operação, não captura de tela do produto.
      </p>
    </div>
  );
}

export const metadata = {
  title: "DeskcommCRM — sua operação comercial numa mesa só",
  description:
    "CRM open source com agentes de IA nativos e WhatsApp. Self-hosted, sem mensalidade por usuário e com sua equipe no controle.",
};

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#faf9f6] text-[#1c1a16]">
      <header className="sticky top-0 z-40 border-b border-[#e7e3da] bg-[#faf9f6]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            aria-label="DeskcommCRM, início"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#67885d]"
          >
            <Marca />
          </Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Navegação principal">
            <Link href="#como-funciona" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              Como funciona
            </Link>
            <Link href="#instalacao" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              Instalação
            </Link>
            <Link href="#preco" className="text-sm text-[#5d594f] hover:text-[#1c1a16]">
              Preço
            </Link>
          </nav>
          <div className="flex items-center gap-2.5 sm:gap-4">
            <Link
              href="/login"
              className="rounded-lg px-2 py-2 text-sm font-bold text-[#46433b] hover:text-[#1c1a16] sm:px-3"
            >
              Entrar
            </Link>
            <Link
              href={INSTALL_URL}
              className="inline-flex items-center gap-2 rounded-lg bg-[#67885d] px-3.5 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#506d48] sm:px-4 sm:text-sm"
            >
              Instalar na VPS <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-5 pt-14 pb-20 sm:px-8 sm:pt-20 sm:pb-28 lg:pt-24">
        <div
          className="pointer-events-none absolute top-20 -right-44 size-[34rem] rounded-full bg-[#e9e7dd] opacity-70 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
          <div className="relative z-10 max-w-[590px]">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#67885d] uppercase">
              Desk + comm · o comercial de mesa
            </p>
            <h1 className="mt-5 text-[2.8rem] leading-[1.02] font-bold tracking-[-0.055em] sm:text-6xl lg:text-[4.4rem]">
              Sua operação comercial numa mesa só.
              <span className="mt-2 block text-[#67885d]">E nada morre em cima dela.</span>
            </h1>
            <p className="mt-6 max-w-[550px] text-base leading-7 text-[#5d594f] sm:text-lg sm:leading-8">
              Agentes de IA atendem no WhatsApp, qualificam contatos e ajudam a mover o funil — com
              pessoas no comando e o histórico no mesmo lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={INSTALL_URL}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#67885d] px-5 text-sm font-bold text-white transition-colors hover:bg-[#506d48]"
              >
                Instalar na minha VPS <span aria-hidden="true">↗</span>
              </Link>
              <Link
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#d2cdbf] bg-transparent px-5 text-sm font-bold text-[#46433b] transition-colors hover:bg-white"
              >
                Ver o código no GitHub <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 font-mono text-[10px] text-[#7d786c] sm:text-[11px]">
              <span>MIT · open source</span>
              <span aria-hidden="true">/</span>
              <span>Self-hosted</span>
              <span aria-hidden="true">/</span>
              <span>Sem mensalidade por usuário</span>
            </div>
          </div>
          <div className="relative z-10 px-0 sm:px-5 lg:px-0">
            <MesaPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-[#e7e3da] bg-white/70 px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 text-center text-xs font-semibold text-[#5d594f] sm:gap-x-8 sm:text-sm">
          <span>WhatsApp</span>
          <span className="text-[#b7b1a4]">→</span>
          <span>Agente de IA</span>
          <span className="text-[#b7b1a4]">→</span>
          <span>CRM e funil</span>
          <span className="text-[#b7b1a4]">→</span>
          <span>Equipe humana</span>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#67885d] uppercase">
              O problema não é só responder
            </p>
            <h2 className="mt-4 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-5xl">
              Um CRM que só guarda dados não conduz a venda.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[#5d594f]">
              E um robô que responde sem conhecer a operação pode deixar o cliente sem direção. O
              Deskcomm conecta conversa, contexto e próximo passo.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-[#e7e3da] bg-white p-6 sm:p-8">
              <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#9a6f38] uppercase">
                Quando tudo fica espalhado
              </p>
              <h3 className="mt-4 text-xl font-bold tracking-tight">
                O lead entra. O acompanhamento depende da memória.
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#5d594f]">
                Mensagem num lugar, dados em outro e ninguém sabe com clareza o que ficou combinado
                ou quem deve agir.
              </p>
            </article>
            <article className="rounded-2xl border border-[#e7e3da] bg-white p-6 sm:p-8">
              <p className="font-mono text-[10px] font-medium tracking-[0.12em] text-[#9a6f38] uppercase">
                Quando o bot não tem direção
              </p>
              <h3 className="mt-4 text-xl font-bold tracking-tight">
                Responde rápido, mas não sabe o que fazer depois.
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#5d594f]">
                Sem contexto, regras e passagem para uma pessoa, automação vira mais uma conversa
                solta.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 bg-[#f0efe9] px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#67885d] uppercase">
              Um sistema, uma operação
            </p>
            <h2 className="mt-4 text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-5xl">
              A IA trabalha junto com o CRM e com a sua equipe.
            </h2>
            <p className="mt-5 text-base leading-7 text-[#5d594f]">
              Deskcomm é mais que uma caixa de entrada. O agente participa do fluxo de vendas com
              limites definidos e ações registradas.
            </p>
            <Link
              href={INSTALL_URL}
              className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-[#506d48] hover:text-[#344a2f]"
            >
              Ver o guia de instalação <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="divide-y divide-[#d9d5c9] border-y border-[#d9d5c9]">
            {CAPABILITIES.map((item) => (
              <article
                key={item.number}
                className="grid gap-3 py-6 sm:grid-cols-[3rem_1fr] sm:gap-5"
              >
                <span className="font-mono text-xs text-[#8a8578]">{item.number}</span>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5d594f]">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#67885d] uppercase">
              Um núcleo, vários negócios
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.045em] sm:text-5xl">
              Venda conversando? O Deskcomm pode ser a sua mesa.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#5d594f]">
              Configure etapas e vocabulário para a operação que você tem — sem tratar todo negócio
              como se fosse igual.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {["E-commerce", "Clínicas", "Imobiliárias", "Infoprodutos", "Agências", "Serviços"].map(
              (nicho) => (
                <div
                  key={nicho}
                  className="rounded-xl border border-[#e7e3da] bg-white px-3 py-4 text-center text-xs font-bold text-[#46433b] sm:px-4 sm:py-5 sm:text-sm"
                >
                  {nicho}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section
        id="instalacao"
        className="scroll-mt-24 bg-[#1c1a16] px-5 py-20 text-[#faf9f6] sm:px-8 sm:py-28"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <div>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#b8c8ae] uppercase">
              Seu servidor. Seu código. Seus dados.
            </p>
            <h2 className="mt-4 max-w-2xl text-3xl leading-tight font-bold tracking-[-0.045em] sm:text-5xl">
              O software é livre. Você escolhe onde ele roda.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#d1cec4] sm:text-base">
              DeskcommCRM é open source sob licença MIT, sem planos pagos ou recursos bloqueados. A
              operação precisa de infraestrutura e pode consumir serviços externos, como banco de
              dados, WhatsApp e modelos de IA.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-6 sm:p-8">
            <p className="font-mono text-[10px] tracking-[0.14em] text-[#b8c8ae] uppercase">
              Comece pelo guia
            </p>
            <p className="mt-3 text-lg font-bold">
              Pré-requisitos, configuração e primeiro acesso.
            </p>
            <p className="mt-2 text-sm leading-6 text-[#d1cec4]">
              O kit conduz a instalação e explica o que você precisa preparar antes de conectar sua
              operação.
            </p>
            <Link
              href={INSTALL_URL}
              className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#67885d] px-4 text-sm font-bold text-white transition-colors hover:bg-[#78966e]"
            >
              Ler o guia de instalação <span aria-hidden="true">↗</span>
            </Link>
            <p className="mt-5 font-mono text-[10px] text-[#b8b4a8]">
              Licença MIT · sem cobrança por usuário
            </p>
          </div>
        </div>
      </section>

      <section id="preco" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-[#67885d] uppercase">
              Sem letra miúda
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-[-0.045em] sm:text-5xl">
              O software é grátis. A infraestrutura é sua.
            </h2>
          </div>
          <div className="space-y-5 text-sm leading-7 text-[#5d594f] sm:text-base">
            <p>
              Não existe plano por atendente, versão premium ou função escondida atrás de
              assinatura. O Deskcomm é distribuído sob licença MIT.
            </p>
            <p>
              Você escolhe e paga a VPS e os serviços que conectar. Se usar um provedor de IA ou um
              canal com cobrança própria, esse consumo é contratado à parte.
            </p>
            <p className="rounded-xl border border-[#e7e3da] bg-white p-4 text-xs leading-5 sm:text-sm">
              A instalação atual é um ambiente de validação. Esta página apresenta o produto; para
              acessar a operação deste domínio, use{" "}
              <Link href="/login" className="font-bold text-[#506d48] underline underline-offset-4">
                Entrar
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold tracking-[-0.045em] sm:text-4xl">
            Perguntas frequentes
          </h2>
          <div className="mt-7 divide-y divide-[#e7e3da] border-y border-[#e7e3da]">
            {QUESTIONS.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold sm:text-base">
                  {item.question}
                  <span
                    className="font-mono text-lg font-normal text-[#67885d] transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl pr-8 text-sm leading-6 text-[#5d594f]">
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-[#d9d5c9] bg-[#eeeee6] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="font-mono text-[10px] font-medium tracking-[0.14em] text-[#506d48] uppercase">
              Parceiro de infraestrutura
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">
              Prefere começar por uma VPS no Brasil?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#5d594f]">
              A HostGator é parceira do projeto. Contratar pelo link apoia o Deskcomm; você também
              pode instalar em outra VPS compatível.
            </p>
          </div>
          <Link
            href={HOSTGATOR_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#073f60] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0b5279]"
          >
            Ver VPS HostGator <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <footer className="bg-[#faf9f6] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 sm:flex-row">
          <Link href="/" aria-label="DeskcommCRM, início">
            <Marca />
          </Link>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[#5d594f]">
            <Link href={INSTALL_URL} className="hover:text-[#1c1a16]">
              Instalação
            </Link>
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#1c1a16]"
            >
              GitHub
            </Link>
            <Link href="/login" className="hover:text-[#1c1a16]">
              Entrar
            </Link>
            <Link href="/legal/terms" className="hover:text-[#1c1a16]">
              Termos
            </Link>
            <Link href="/legal/privacy" className="hover:text-[#1c1a16]">
              Privacidade
            </Link>
          </div>
          <span className="font-mono text-[10px] text-[#7d786c]">MIT · Feito no Brasil</span>
        </div>
      </footer>
    </main>
  );
}
