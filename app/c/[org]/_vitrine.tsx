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
import type { LucideIcon } from "lucide-react";
import { ChevronRight, X } from "lucide-react";

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
  Icone,
  tom = "lilas",
  largo = false,
  testId,
  children,
}: {
  titulo: string;
  linha?: string | null;
  preco?: string | null;
  sobretitulo?: string | null;
  Icone: LucideIcon;
  tom?: TomDoCartao;
  /** Cartão de prateleira com um item só: ocupa a largura toda. */
  largo?: boolean;
  testId?: string;
  /** O que a gaveta mostra ao tocar. */
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = React.useState(false);
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
        {/* O símbolo grande, apagado, no canto: a "ilustração" enquanto as imagens próprias não chegam. */}
        <Icone aria-hidden className="pointer-events-none absolute -right-4 -top-4 size-28 text-[#e2c47a]/[0.09]" strokeWidth={1} />
        <span className="relative flex size-10 items-center justify-center rounded-2xl border border-[#c9a54e]/30 bg-[#c9a54e]/10 text-[#e2c47a]">
          <Icone className="size-5" aria-hidden />
        </span>
        <span className="relative mt-5 block">
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
        <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between bg-[#110c20]/95 px-4 pb-2 pt-1 backdrop-blur">
          <span aria-hidden className="mx-auto h-1.5 w-10 rounded-full bg-white/15" />
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="absolute right-3 top-0 flex size-9 items-center justify-center rounded-full bg-white/[0.06] text-[#c3bad3]"
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
export function LinhaDaVitrine({ titulo, linha, Icone, testId, children }: { titulo: string; linha?: string; Icone: LucideIcon; testId?: string; children: React.ReactNode }) {
  const [aberta, setAberta] = React.useState(false);
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
