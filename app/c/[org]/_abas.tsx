"use client";
/**
 * As quatro abas da área do cliente, com a barra fixa no rodapé do celular
 * (o desenho dos apps que lideram o mercado: o que é dela primeiro, a oferta
 * por último).
 *
 * Todas as abas já chegam desenhadas do servidor; aqui só se escolhe qual
 * aparece. As escondidas continuam montadas: o "Fale com a gente" segue
 * buscando respostas mesmo com a pessoa em outra aba. A aba aberta vai para o
 * endereço (`?aba=conversa`), então um link pode abrir direto nela e o
 * "voltar" do celular não tira a pessoa da área.
 */
import * as React from "react";
import { MessagesSquare, Moon, Sparkles, UserRound } from "lucide-react";

import { ABAS_DA_AREA, abaValida, type AbaDaArea } from "@/lib/area-do-cliente/abas";

export type { AbaDaArea };


const ICONE = { hoje: Moon, trabalho: UserRound, conversa: MessagesSquare, explorar: Sparkles } as const;

/** Um link ou botão de dentro de uma aba que leva para outra (ex.: "Responder" na aba Hoje). */
export const IrParaAba = React.createContext<(aba: AbaDaArea) => void>(() => {});

export function BotaoIrParaAba({ aba, className, style, children }: { aba: AbaDaArea; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const ir = React.useContext(IrParaAba);
  return (
    <a
      href={`?aba=${aba}`}
      className={className}
      style={style}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        ir(aba);
      }}
    >
      {children}
    </a>
  );
}

export function AbasDaArea({
  inicial,
  rotulos,
  rotuloDaBarra,
  cor,
  paineis,
  rodape,
}: {
  inicial: AbaDaArea;
  rotulos: Record<AbaDaArea, string>;
  rotuloDaBarra: string;
  cor: string;
  paineis: Record<AbaDaArea, React.ReactNode>;
  rodape: React.ReactNode;
}) {
  const [aba, setAba] = React.useState<AbaDaArea>(inicial);

  // O "voltar" do celular troca de aba, como em qualquer aplicativo.
  React.useEffect(() => {
    const aoVoltar = () => setAba(abaValida(new URLSearchParams(window.location.search).get("aba")));
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, []);

  const atual = React.useRef(aba);
  React.useEffect(() => {
    atual.current = aba;
  }, [aba]);
  const ir = React.useCallback((nova: AbaDaArea) => {
    if (atual.current !== nova) {
      const url = new URL(window.location.href);
      if (nova === "hoje") url.searchParams.delete("aba");
      else url.searchParams.set("aba", nova);
      url.hash = "";
      window.history.pushState(null, "", url);
      setAba(nova);
    }
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <IrParaAba.Provider value={ir}>
      {ABAS_DA_AREA.map((a) => (
        <div key={a} role="tabpanel" id={`aba-${a}`} aria-labelledby={`botao-aba-${a}`} hidden={a !== aba} data-testid={`area-aba-${a}`}>
          {paineis[a]}
        </div>
      ))}
      {rodape}

      <nav
        aria-label={rotuloDaBarra}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d5bc83]/15 bg-[#110c20]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
      >
        <div role="tablist" aria-label={rotuloDaBarra} className="mx-auto grid max-w-xl grid-cols-4">
          {ABAS_DA_AREA.map((a) => {
            const Icone = ICONE[a];
            const ativa = a === aba;
            return (
              <button
                key={a}
                type="button"
                role="tab"
                id={`botao-aba-${a}`}
                aria-selected={ativa}
                aria-controls={`aba-${a}`}
                tabIndex={ativa ? 0 : -1}
                onClick={() => ir(a)}
                onKeyDown={(e) => {
                  const indice = ABAS_DA_AREA.indexOf(a);
                  const proxima = e.key === "Home" ? ABAS_DA_AREA[0] : e.key === "End" ? ABAS_DA_AREA[ABAS_DA_AREA.length - 1] : e.key === "ArrowRight" ? ABAS_DA_AREA[(indice + 1) % ABAS_DA_AREA.length] : e.key === "ArrowLeft" ? ABAS_DA_AREA[(indice + ABAS_DA_AREA.length - 1) % ABAS_DA_AREA.length] : undefined;
                  if (!proxima) return;
                  e.preventDefault();
                  ir(proxima);
                  document.getElementById(`botao-aba-${proxima}`)?.focus();
                }}
                className="relative flex min-h-[76px] flex-col items-center gap-1 pb-2.5 pt-3 text-[11.5px] font-semibold transition focus-visible:outline-2 focus-visible:-outline-offset-4 motion-reduce:transition-none"
                style={{ color: ativa ? cor : "#9d94b2" }}
                data-testid={`area-botao-aba-${a}`}
              >
                {ativa ? <span aria-hidden className="absolute top-0 h-0.5 w-7 rounded-b-full" style={{ background: cor }} /> : null}
                <span
                  className="flex h-8 w-14 items-center justify-center rounded-full transition"
                  style={ativa ? { background: `${cor}1f` } : undefined}
                >
                  <Icone className="size-5" strokeWidth={ativa ? 2.25 : 1.75} aria-hidden />
                </span>
                {rotulos[a]}
              </button>
            );
          })}
        </div>
      </nav>
    </IrParaAba.Provider>
  );
}
