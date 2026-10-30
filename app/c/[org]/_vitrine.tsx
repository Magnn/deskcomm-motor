"use client";

/**
 * A VITRINE do Explorar: prateleiras de cartões que deslizam para o lado, e cada cartão abre uma GAVETA que sobe
 * da base da tela com o conteúdo e o pagamento.
 *
 * Por que existe (20/10/2026): o Explorar era uma coluna de onze blocos, com 5 mil pixels de altura, e quatro
 * deles mostravam "Pagar com Pix / Pagar com cartão" antes de a pessoa querer qualquer coisa — parecia uma página
 * de cobrança, não um lugar. Agora a tela mostra O QUE existe (título, uma linha, o valor) e o pagamento só aparece
 * depois do toque, dentro da gaveta. O que vai na gaveta são os MESMOS componentes de antes: a regra de cobrança
 * não mudou, só o momento em que ela aparece.
 */
import * as React from "react";
import { BookOpen, ChevronRight, Flame, Gift, HandHeart, Heart, Moon, Sparkles, Star, X, type LucideIcon } from "lucide-react";

import { Ilustracao, type TemaDaIlustracao } from "./_ilustracoes";
import { SERIF } from "./_tema";

export function Prateleira({ titulo, children, testId }: { titulo: string; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId}>
      <h2 className={`${SERIF} px-1 text-[22px] leading-tight text-[#f6f0e4]`}>{titulo}</h2>
      {/* -mx-4 + px-4: os cartões encostam na borda da tela ao deslizar, como numa vitrine de app. */}
      <div className="-mx-4 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

/**
 * Os ícones vão pelo NOME, não pelo componente. Quem monta a vitrine é a página (componente de servidor), e o
 * que ela passa a um componente de cliente atravessa a rede serializado: o ícone do lucide é um `forwardRef` com
 * uma função dentro, e o React recusa ("Functions cannot be passed directly to Client Components"). De 20/10 a
 * 30/10/2026 isso derrubou a área inteira de quem tinha algo na vitrine — a pessoa abria o link e via a tela de erro.
 */
const ICONES = {
  chama: Flame,
  brilho: Sparkles,
  lua: Moon,
  estrela: Star,
  presente: Gift,
  livro: BookOpen,
  coracao: Heart,
  "mao-com-coracao": HandHeart,
} as const satisfies Record<string, LucideIcon>;
export type NomeDoIcone = keyof typeof ICONES;

/** Os tons dos cartões: noite com uma luz de cor diferente, para a prateleira não ser uma fila de iguais. */
const TONS = {
  ouro: "from-[#3a2c12] via-[#1d1638] to-[#140f26]",
  rosa: "from-[#4a1f3a] via-[#1d1638] to-[#140f26]",
  lilas: "from-[#352063] via-[#1d1638] to-[#140f26]",
  azul: "from-[#1c2f5a] via-[#1d1638] to-[#140f26]",
  verde: "from-[#173d33] via-[#1d1638] to-[#140f26]",
} as const;
export type TomDoCartao = keyof typeof TONS;

export function CartaoDaVitrine({
  titulo,
  linha,
  preco,
  sobretitulo,
  icone,
  tema,
  tom = "lilas",
  largo = false,
  formato = "padrao",
  testId,
  children,
}: {
  titulo: string;
  linha?: string | null;
  preco?: string | null;
  sobretitulo?: string | null;
  icone: NomeDoIcone;
  /** A ilustração do cartão (`_ilustracoes.tsx`). Sem ela, o ícone. */
  tema?: TemaDaIlustracao;
  tom?: TomDoCartao;
  /** Cartão de prateleira com um item só: ocupa a largura toda. */
  largo?: boolean;
  /**
   * `poster`: o cartão em pé da Loja (o desenho das prateleiras de streaming), estreito para caberem dois e meio na
   * tela do celular — a ponta do terceiro é o convite para deslizar. `padrao`: o cartão deitado de antes.
   */
  formato?: "padrao" | "poster";
  testId?: string;
  /** O que a gaveta mostra ao tocar. */
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = React.useState(false);
  const Icone = ICONES[icone];
  if (formato === "poster") {
    return (
      <>
        <button
          type="button"
          onClick={() => setAberta(true)}
          data-testid={testId}
          className={`group relative flex aspect-[2/3] w-[40%] max-w-[176px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-[#c9a54e]/20 bg-gradient-to-b ${TONS[tom]} text-left shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] transition active:scale-[0.97] motion-reduce:transition-none`}
        >
          <span className="pointer-events-none flex flex-1 items-center justify-center pt-3">
            {tema ? (
              <Ilustracao tema={tema} classe="size-[92px] drop-shadow-[0_0_22px_rgba(226,196,122,0.35)] transition group-hover:scale-105 motion-reduce:transition-none" />
            ) : (
              <Icone className="size-14 text-[#e2c47a]/70" strokeWidth={1.25} aria-hidden />
            )}
          </span>
          {sobretitulo ? (
            <span className="absolute left-2 top-2 rounded-full bg-[#c9a54e] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-[#1b1433]">
              {sobretitulo}
            </span>
          ) : null}
          <span className="relative block bg-gradient-to-t from-[#0d0919] via-[#0d0919]/85 to-transparent px-3 pb-3 pt-6">
            <span className={`${SERIF} line-clamp-2 text-[16px] leading-tight text-[#f6f0e4]`}>{titulo}</span>
            {preco ? <span className="mt-1 block text-[13px] font-semibold text-[#f0dca8]">{preco}</span> : null}
          </span>
        </button>
        {aberta ? <Gaveta titulo={titulo} fechar={() => setAberta(false)}>{children}</Gaveta> : null}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        data-testid={testId}
        className={`group relative flex shrink-0 snap-start flex-col justify-between overflow-hidden rounded-3xl border border-[#c9a54e]/20 bg-gradient-to-br ${TONS[tom]} p-5 text-left shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] transition active:scale-[0.98] motion-reduce:transition-none ${
          largo ? "min-h-[150px] w-full" : "min-h-[178px] w-[72%] max-w-[280px]"
        }`}
      >
        {tema ? (
          // A ilustração no alto do cartão: é ela que diz o que o produto é antes de ler o nome.
          <Ilustracao tema={tema} classe="pointer-events-none -ml-2 -mt-2 size-24 drop-shadow-[0_0_18px_rgba(226,196,122,0.25)]" />
        ) : (
          <>
            <Icone aria-hidden className="pointer-events-none absolute -right-4 -top-4 size-28 text-[#e2c47a]/[0.09]" strokeWidth={1} />
            <span className="relative flex size-10 items-center justify-center rounded-2xl border border-[#c9a54e]/30 bg-[#c9a54e]/10 text-[#e2c47a]">
              <Icone className="size-5" aria-hidden />
            </span>
          </>
        )}
        <span className={`relative block ${tema ? "mt-1" : "mt-5"}`}>
          {sobretitulo ? <span className="block text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#e2c47a]">{sobretitulo}</span> : null}
          <span className={`${SERIF} mt-1 block text-[21px] leading-snug text-[#f6f0e4]`}>{titulo}</span>
          {linha ? <span className="mt-1 line-clamp-2 block text-[13.5px] leading-snug text-[#c3bad3]">{linha}</span> : null}
          <span className="mt-3 flex items-center justify-between gap-2">
            {preco ? <span className="text-[15px] font-semibold text-[#f0dca8]">{preco}</span> : <span />}
            <ChevronRight className="size-5 text-[#e2c47a] transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </button>
      {aberta ? <Gaveta titulo={titulo} fechar={() => setAberta(false)}>{children}</Gaveta> : null}
    </>
  );
}

/**
 * O DESTAQUE no alto da Loja: um produto só, grande, com o comprar à mão — a capa das lojas de streaming. O
 * "Ver detalhes" abre a mesma gaveta dos cartões; o "comprar" é um link comum, como no cartão.
 */
export function DestaqueDaLoja({
  sobretitulo,
  titulo,
  linha,
  preco,
  tema,
  comprar,
  detalhes,
  testId,
  children,
}: {
  sobretitulo: string;
  titulo: string;
  linha?: string | null;
  preco: string;
  tema: TemaDaIlustracao;
  comprar: { href: string; rotulo: string };
  detalhes: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = React.useState(false);
  return (
    <section
      data-testid={testId}
      className="relative overflow-hidden rounded-3xl border border-[#c9a54e]/25 bg-gradient-to-br from-[#3a2c12] via-[#1d1638] to-[#140f26] p-5 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.95)]"
    >
      <Ilustracao tema={tema} classe="pointer-events-none absolute -right-6 -top-4 size-48 opacity-90 drop-shadow-[0_0_30px_rgba(226,196,122,0.35)]" />
      <div className="relative max-w-[70%]">
        <span className="inline-flex items-center rounded-full border border-[#c9a54e]/40 bg-[#c9a54e]/10 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#e2c47a]">
          {sobretitulo}
        </span>
        <h2 className={`${SERIF} mt-3 text-[30px] leading-[1.05] text-[#f6f0e4]`}>{titulo}</h2>
        {linha ? <p className="mt-2 line-clamp-3 text-[14px] leading-snug text-[#d9d0e6]">{linha}</p> : null}
        <p className={`${SERIF} mt-3 text-[24px] text-[#f0dca8]`}>{preco}</p>
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <a
          href={comprar.href}
          className="inline-flex h-12 items-center rounded-full bg-[#c9a54e] px-6 text-[15px] font-semibold text-[#1b1433] transition hover:brightness-110"
          data-testid="area-destaque-comprar"
        >
          {comprar.rotulo}
        </a>
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="inline-flex h-12 items-center rounded-full border border-white/20 bg-white/[0.06] px-5 text-[15px] font-semibold text-[#efe7f7] transition hover:bg-white/[0.1]"
          data-testid="area-destaque-detalhes"
        >
          {detalhes}
        </button>
      </div>
      {aberta ? <Gaveta titulo={titulo} fechar={() => setAberta(false)}>{children}</Gaveta> : null}
    </section>
  );
}

/** A gaveta: sobe da base, escurece o fundo, fecha no X, no fundo e no Esc. */
export function Gaveta({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", tecla);
    };
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={titulo} data-testid="area-gaveta">
      <button type="button" aria-label="Fechar" onClick={fechar} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] border-t border-[#c9a54e]/25 bg-[#110c20] px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3 shadow-[0_-24px_60px_-20px_rgba(0,0,0,0.9)] [animation:gaveta-sobe_.28s_ease-out] motion-reduce:[animation:none]">
        <style>{"@keyframes gaveta-sobe{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}"}</style>
        {/* O topo da gaveta tem altura própria: o X não pode cair por cima do cartão que vem embaixo. */}
        <div className="sticky top-0 z-10 -mx-4 flex h-12 items-center justify-center bg-[#110c20]/95 px-4 backdrop-blur">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-white/15" />
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="absolute right-3 top-1.5 flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-[#c3bad3]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="mt-2 space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Uma linha discreta de ação, para o que não é vitrine (pedir algo, contribuir). */
export function LinhaDaVitrine({ titulo, linha, icone, testId, children }: { titulo: string; linha?: string; icone: NomeDoIcone; testId?: string; children: React.ReactNode }) {
  const [aberta, setAberta] = React.useState(false);
  const Icone = ICONES[icone];
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        data-testid={testId}
        className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/[0.06]"
      >
        <Icone className="size-5 shrink-0 text-[#e2c47a]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-[#efe7f7]">{titulo}</span>
          {linha ? <span className="block truncate text-[13px] text-[#9d94b2]">{linha}</span> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-[#9d94b2]" aria-hidden />
      </button>
      {aberta ? <Gaveta titulo={titulo} fechar={() => setAberta(false)}>{children}</Gaveta> : null}
    </>
  );
}
