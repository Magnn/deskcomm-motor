"use client";
/**
 * O RITUAL DE HOJE na aba Hoje (`lib/area-do-cliente/ritual.ts`): a linha 1·2·3 no alto e UM cartão para o
 * passo da vez. As ações confirmadas atualizam o progresso; a pessoa escolhe quando continuar.
 * Tocar num passo da linha mostra aquele passo de novo (para reler a carta, por exemplo).
 */
import * as React from "react";
import { ArrowRight, BookOpen, Check, MessageCircle, Sparkles } from "lucide-react";

import { EVENTO_CARTA_REVELADA, EVENTO_CONVERSA_ENVIADA, EVENTO_DIARIO_SALVO, passoDaVez, progressoDoRitual, type PassoDoRitual } from "@/lib/area-do-cliente/ritual";

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
  continuar: string;
  opcional: string;
  noSeuRitmo: string;
  passoConcluido: string;
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
  const progresso = progressoDoRitual(passos);
  const aberto = escolhido ?? (progresso.completo ? null : daVez);

  React.useEffect(() => {
    const feito = (passo: PassoDoRitual) => () => {
        setPassos((lista) => lista.map((p) => (p.passo === passo ? { ...p, feito: true } : p)));
        // A leitura fica aberta até a pessoa escolher continuar. Nenhum relógio decide por ela.
        setEscolhido(passo);
      };
    const aoRevelar = feito("carta");
    const aoSalvar = feito("diario");
    const aoConversar = feito("conversa");
    window.addEventListener(EVENTO_CARTA_REVELADA, aoRevelar);
    window.addEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
    window.addEventListener(EVENTO_CONVERSA_ENVIADA, aoConversar);
    return () => {
      window.removeEventListener(EVENTO_CARTA_REVELADA, aoRevelar);
      window.removeEventListener(EVENTO_DIARIO_SALVO, aoSalvar);
      window.removeEventListener(EVENTO_CONVERSA_ENVIADA, aoConversar);
    };
  }, []);

  const passoFeito = passos.some((p) => p.passo === aberto && p.feito);

  return (
    <section className="space-y-4" data-testid="area-ritual">
      <div className="relative overflow-hidden rounded-[28px] border border-[#d5bc83]/25 bg-gradient-to-br from-[#2c2242] via-[#1a1430] to-[#19172a] p-4 shadow-[0_16px_44px_-26px_#000]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className={`${SERIF} text-[22px] text-[#f6f0e4]`}>{tr.titulo}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#c3bad3]">{tr.noSeuRitmo}</p>
          </div>
          <div className="relative grid size-12 shrink-0 place-items-center">
            <svg viewBox="0 0 64 64" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
              <circle cx="32" cy="32" r="27" fill="none" stroke="#ffffff14" strokeWidth="3" />
              <circle cx="32" cy="32" r="27" fill="none" stroke="#e2c47a" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - (progresso.total ? progresso.feitos / progresso.total * 100 : 0)} className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" />
            </svg>
            <span className="text-[14px] font-semibold text-[#f0dca8]" data-testid="area-ritual-contagem" aria-live="polite">
              {progresso.feitos}/{progresso.total}
            </span>
          </div>
        </div>
        <ol className="mt-3 flex items-start gap-2">
          {passos.map((p) => {
            const ativo = aberto === p.passo;
            return (
              <li key={p.passo} className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => setEscolhido(p.passo)}
                  aria-current={ativo ? "step" : undefined}
                  className="flex min-h-14 w-full flex-col items-center gap-2 rounded-2xl px-1 py-2 text-center transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c47a] motion-reduce:transition-none"
                  data-testid={`area-ritual-passo-${p.passo}`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                      p.feito
                        ? "bg-[#1e3a2c] text-[#8fd6a8]"
                        : ativo
                          ? "bg-[#e2c47a] text-[#1b1433]"
                          : "border border-white/20 text-[#c3bad3]"
                    }`}
                  >
                    {p.feito ? <Check className="size-4" strokeWidth={3} aria-hidden /> : p.passo === "conversa" ? <MessageCircle className="size-4" aria-hidden /> : p.passo === "diario" ? <BookOpen className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
                  </span>
                  <span className={`text-[12.5px] ${ativo ? "font-semibold text-[#f6f0e4]" : "text-[#a99fc0]"}`}>{tr.rotulos[p.passo]}</span>
                  {p.passo === "conversa" ? <span className="-mt-1 text-[10px] text-[#b9adc9]">{tr.opcional}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {aberto === null ? (
        <div className={`${CARTAO_NOTURNO} text-center`} data-testid="area-ritual-completo">
          <span className="mx-auto grid size-14 place-items-center rounded-full border border-[#e2c47a]/30 bg-[#e2c47a]/10 text-[#e2c47a]"><Check className="size-6" aria-hidden /></span>
          <p className={`${SERIF} mt-2 text-[24px] leading-snug`}>{tr.completo}</p>
          <p className="mt-2 text-[15px] text-[#d9d0e6]">{tr.completoTexto}</p>
          <BotaoIrParaAba aba="conversa" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e2c47a]/30 px-5 text-sm text-[#e2c47a]">
            <MessageCircle className="size-4" aria-hidden />{tr.conversar}
          </BotaoIrParaAba>
        </div>
      ) : null}
      {/* Os três ficam montados (o estado da carta e do diário não se perde ao trocar de passo). */}
      <div hidden={aberto !== "carta"}>{carta}</div>
      <div hidden={aberto !== "diario"}>{diario}</div>
      {aberto && aberto !== "conversa" && passoFeito ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#8fd6a8]/20 bg-[#8fd6a8]/5 px-4 py-3" data-testid="area-ritual-continuar">
          <p role="status" className="flex items-center gap-2 text-[13px] text-[#a8d8b7]"><Check className="size-4" aria-hidden />{tr.passoConcluido}</p>
          <button type="button" onClick={() => setEscolhido(null)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#e2c47a] px-5 text-sm font-semibold text-[#1b1433] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e2c47a]">
            {tr.continuar}<ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
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

