import Link from "next/link";

import { branding } from "@/lib/branding";

type T = (texto: string) => string;

/** Cabeçalho e rodapé dos guias — o mesmo desenho da página inicial, enxuto. */
export function MolduraDosGuias({ t, children }: { t: T; children: React.ReactNode }) {
  const marca = branding();
  return (
    <main className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-[68px] max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label={marca.name} className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-foreground">
              {marca.initial}
            </span>
            <span className="text-base font-bold tracking-[-0.04em]">{marca.name}</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/guias" className="hidden rounded-lg px-2 py-2 text-sm font-bold text-text-muted hover:text-text sm:inline">
              {t("Guias")}
            </Link>
            <Link
              href="/signup"
              className="inline-flex min-h-10 items-center rounded-lg bg-accent px-4 text-sm font-bold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              {t("Criar conta grátis")}
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-border px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 text-sm text-text-muted">
          <Link href="/" className="font-bold text-text">
            {marca.name}
          </Link>
          <Link href="/guias" className="hover:text-text">
            {t("Guias")}
          </Link>
          <Link href="/legal/terms" className="hover:text-text">
            {t("Termos de uso")}
          </Link>
          <Link href="/legal/privacy" className="hover:text-text">
            {t("Privacidade")}
          </Link>
        </div>
      </footer>
    </main>
  );
}
