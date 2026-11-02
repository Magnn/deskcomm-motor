"use client";
/**
 * O RITUAL DE HOJE na aba Hoje (`lib/area-do-cliente/ritual.ts`): a linha 1·2·3 no alto e UM cartão para o
 * passo da vez. Virar a carta e salvar o diário avisam por evento; o ritual anda sozinho para o próximo passo.
 * Tocar num passo da linha mostra aquele passo de novo (para reler a carta, por exemplo).
 */
import * as React from "react";
import { Check, MessageCircle } from "lucide-react";

import { EVENTO_CARTA_REVELADA, EVENTO_DIARIO_SALVO, passoDaVez, type PassoDoRitual } from "@/lib/area-do-cliente/ritual";

import { BotaoIrParaAba } from "./_abas";
import { useSaldo } from "./_carteira";
import { CARTAO_NOTURNO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDoRitual {
  titulo: string;
  completo: string;
  completoTexto: string;
  rotulos: Record<PassoDoRitual, string>;
  conversaTitulo: string;
  conversaTexto: string;
  conversar: string;
  creditos: string;
}

export function RitualDeHoje({
  inicial,
  carta,
  diario,
  nomeDaGuia,
  tr,
}: {
  inicial: Array<{ passo: PassoDoRitual; feito: boolean }>;
  /** O cartão da carta do dia (`CartaDoDia`), desenhado no servidor. */
  carta: React.ReactNode;
  /** O diário (`DiarioDoCliente`). */
  diario: React.ReactNode;
  nomeDaGuia: string;
  tr: TextosDoRitual;
}) {
  const [passos, setPassos] = React.useState(inicial);
  const daVez = passoDaVez(passos);
  // O passo à mostra: o que ela tocou na linha, ou o da vez. Um passo feito volta a mostrar o da vez.
  const [escolhido, setEscolhido] = React.useState<PassoDoRitual | null>(null);
  const aberto = escolhido ?? daVez;

  React.useEffect(() => {
    const feito = (passo: PassoDoRitual, depoisDe: number) => () =>
      window.setTimeout(() => {
        setPassos((lista) => lista.map((p) => (p.passo === passo ? { ...p, feito: true } : p)));
        setEscolhido(null);
      }, depoisDe);
    // A carta precisa de tempo para ser lida antes de o ritual andar.
    const aoRevelar = feito("carta", 6_000);
    const aoSalvar = feito("diario", 1_200);
    window.addEventListener(EVENTO_CARTA_REVELADA, aoRevelar);
    window.addEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
    return () => {
      window.removeEventListener(EVENTO_CARTA_REVELADA, aoRevelar);
      window.removeEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
    };
  }, []);

  const feitos = passos.filter((p) => p.feito).length;

  return (
    <section className="space-y-4" data-testid="area-ritual">
      <div className="rounded-3xl border border-[#c9a54e]/20 bg-[#1a1430]/95 px-4 py-3.5 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between">
          <p className={`${SERIF} text-[19px] text-[#f6f0e4]`}>{tr.titulo}</p>
          <p className="text-[12px] font-semibold text-[#c3bad3]" data-testid="area-ritual-contagem">
            {feitos}/{passos.length}
          </p>
        </div>
        <ol className="mt-3 flex items-center">
          {passos.map((p, i) => {
            const ativo = aberto === p.passo;
            return (
              <li key={p.passo} className="flex flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => setEscolhido(p.passo)}
                  aria-current={ativo ? "step" : undefined}
                  className="flex items-center gap-1.5 rounded-full py-1 pr-1 text-left"
                  data-testid={`area-ritual-passo-${p.passo}`}
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      p.feito
                        ? "bg-[#1e3a2c] text-[#8fd6a8]"
                        : ativo
                          ? "bg-[#e2c47a] text-[#1b1433]"
                          : "border border-white/20 text-[#c3bad3]"
                    }`}
                  >
                    {p.feito ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={`text-[12.5px] ${ativo ? "font-semibold text-[#f6f0e4]" : "text-[#a99fc0]"}`}>{tr.rotulos[p.passo]}</span>
                </button>
                {i < passos.length - 1 ? <span className="mx-1.5 h-px flex-1 bg-white/15" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      {aberto === null ? (
        <div className={`${CARTAO_NOTURNO} text-center`} data-testid="area-ritual-completo">
          <p className={SOBRETITULO_NOTURNO}>✦ ✦ ✦</p>
          <p className={`${SERIF} mt-2 text-[24px] leading-snug`}>{tr.completo}</p>
          <p className="mt-2 text-[15px] text-[#d9d0e6]">{tr.completoTexto}</p>
        </div>
      ) : null}
      {/* Os três ficam montados (o estado da carta e do diário não se perde ao trocar de passo). */}
      <div hidden={aberto !== "carta"}>{carta}</div>
      <div hidden={aberto !== "diario"}>{diario}</div>
      <div hidden={aberto !== "conversa"}>
        <div className={CARTAO_NOTURNO} data-testid="area-ritual-conversa">
          <p className={SOBRETITULO_NOTURNO}>✦ {tr.rotulos.conversa}</p>
          <p className={`${SERIF} mt-2 text-[24px] leading-snug`}>{tr.conversaTitulo.replace("{guia}", nomeDaGuia)}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-[#d9d0e6]">{tr.conversaTexto}</p>
          <BotaoIrParaAba
            aba="conversa"
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold"
            style={{ background: "#e2c47a", color: "#1b1433" }}
          >
            <MessageCircle className="size-4" aria-hidden />
            {tr.conversar}
          </BotaoIrParaAba>
        </div>
      </div>
    </section>
  );
}

/** O saldo de créditos sempre à vista no alto, como nos aplicativos do ramo. Toque = a loja de créditos. */
export function CreditosNoTopo({ inicial, rotulo }: { inicial: number; rotulo: string }) {
  const saldo = useSaldo(inicial);
  return (
    <BotaoIrParaAba
      aba="explorar"
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#c9a54e]/35 bg-[#1b1433]/70 px-3 text-[12.5px] font-semibold text-[#f0dca8] backdrop-blur"
    >
      <span aria-hidden>✦</span>
      <span data-testid="area-creditos-no-topo">
        {saldo} {rotulo}
      </span>
    </BotaoIrParaAba>
  );
}

