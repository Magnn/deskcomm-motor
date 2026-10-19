"use client";
/**
 * A ENTRADA COM 3 PERGUNTAS — a primeira vez na área (pedido do dono em 19/10/2026, no modelo dos apps que mais
 * vendem no setor: a pessoa conta quem é antes de ver qualquer oferta, e a área abre "feita para ela").
 *
 *   1. o que mais pede cuidado agora (o foco);
 *   2. o que está pesando, em uma frase (opcional);
 *   3. quando nasceu (opcional; pulada se a área já sabe);
 *   → "Preparando a sua área…" → o céu do nascimento ("Sol em Áries · Lua em Peixes") → entrar.
 *
 * Tudo com "Pular": a entrada convida, não prende. Pular também grava, para não perguntar de novo.
 */
import * as React from "react";
import { useRouter } from "next/navigation";

import { Sparkles } from "lucide-react";

import type { CeuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { FOCOS, type Foco } from "@/lib/area-do-cliente/perfil";

import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { CAMPO, SERIF, SOBRETITULO_NOTURNO } from "./_tema";

export interface TextosDaEntrada {
  passo: string;
  perguntaDoFoco: string;
  perguntaDoPeso: string;
  dicaDoPeso: string;
  perguntaDoNascimento: string;
  dicaDoNascimento: string;
  continuar: string;
  pular: string;
  preparando: string;
  pronta: string;
  solEm: string;
  luaEm: string;
  ou: string;
  paraCuidarDe: string;
  entrar: string;
  focos: Record<Foco, { nome: string; tema: string; simbolo: string }>;
}

type Etapa = "foco" | "peso" | "nascimento" | "preparando" | "pronta";

const ANIMACAO = `
@keyframes entrada-surge { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
@keyframes entrada-gira { to { transform: rotate(360deg) } }
.entrada-surge { animation: entrada-surge .5s ease-out both }
.entrada-gira { animation: entrada-gira 2.4s linear infinite }
@media (prefers-reduced-motion: reduce) { .entrada-surge, .entrada-gira { animation: none } }
`;

export function EntradaDaArea({
  slug,
  nome,
  jaSabeONascimento,
  tx,
  te,
}: {
  slug: string;
  nome: string;
  jaSabeONascimento: boolean;
  tx: TextosDaArea;
  te: TextosDaEntrada;
}) {
  const router = useRouter();
  const [aberta, setAberta] = React.useState(true);
  const [etapa, setEtapa] = React.useState<Etapa>("foco");
  const [foco, setFoco] = React.useState<Foco | null>(null);
  const [peso, setPeso] = React.useState("");
  const [nascimento, setNascimento] = React.useState("");
  const [ceu, setCeu] = React.useState<CeuDoNascimento | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const total = jaSabeONascimento ? 2 : 3;

  const enviar = async (respostas: { foco: Foco | null; o_que_pesa: string | null; nascimento: string | null }) => {
    setEtapa("preparando");
    setErro(null);
    const [r] = await Promise.all([
      postarJson<{ ceu: CeuDoNascimento | null }>(`/api/v1/area/publica/${slug}/perfil`, respostas, tx),
      new Promise((ok) => window.setTimeout(ok, 1800)),
    ]);
    if (!r.ok) {
      setErro(r.mensagem);
      setEtapa(jaSabeONascimento ? "peso" : "nascimento");
      return;
    }
    setCeu(r.data.ceu);
    setEtapa("pronta");
  };

  const concluir = (comNascimento: string | null) =>
    void enviar({ foco, o_que_pesa: peso.trim() || null, nascimento: comNascimento });

  const pularTudo = () => void enviar({ foco: null, o_que_pesa: null, nascimento: null });

  const entrar = () => {
    setAberta(false);
    router.refresh();
  };

  if (!aberta) return null;

  const numero = etapa === "foco" ? 1 : etapa === "peso" ? 2 : 3;
  const cabecalho =
    etapa === "foco" || etapa === "peso" || etapa === "nascimento" ? (
      <div className="flex items-center justify-between">
        <p className={SOBRETITULO_NOTURNO}>{te.passo.replace("{n}", String(numero)).replace("{total}", String(total))}</p>
        <button type="button" onClick={pularTudo} className="text-sm text-[#b7aecb] underline underline-offset-4" data-testid="entrada-pular">
          {te.pular}
        </button>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#140f26] text-[#f6f0e4]" role="dialog" aria-modal="true" data-testid="entrada-da-area">
      <style>{ANIMACAO}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,165,78,0.18),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10">
        {cabecalho}

        {etapa === "foco" ? (
          <div key="foco" className="entrada-surge mt-6">
            <h2 className={`${SERIF} text-[30px] leading-tight`}>
              {nome ? `${nome}, ` : ""}
              {te.perguntaDoFoco}
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {FOCOS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFoco(f);
                    setEtapa("peso");
                  }}
                  className="flex flex-col items-start gap-1 rounded-2xl border border-[#c9a54e]/35 bg-white/[0.05] p-4 text-left transition hover:border-[#e2c47a] hover:bg-white/10 active:scale-[0.98]"
                  data-testid={`entrada-foco-${f}`}
                >
                  <span className="text-xl text-[#e2c47a]" aria-hidden>
                    {te.focos[f].simbolo}
                  </span>
                  <span className="text-[15px] font-semibold leading-snug">{te.focos[f].nome}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {etapa === "peso" ? (
          <div key="peso" className="entrada-surge mt-6">
            <h2 className={`${SERIF} text-[30px] leading-tight`}>{te.perguntaDoPeso}</h2>
            <p className="mt-2 text-sm text-[#b7aecb]">{te.dicaDoPeso}</p>
            <textarea
              value={peso}
              onChange={(e) => setPeso(e.target.value.slice(0, 300))}
              rows={3}
              className={`${CAMPO} mt-5 resize-none`}
              data-testid="entrada-peso"
            />
            <button
              type="button"
              onClick={() => (jaSabeONascimento ? concluir(null) : setEtapa("nascimento"))}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#c9a54e] text-[15px] font-semibold text-[#1b1433]"
              data-testid="entrada-continuar"
            >
              {te.continuar}
            </button>
          </div>
        ) : null}

        {etapa === "nascimento" ? (
          <div key="nascimento" className="entrada-surge mt-6">
            <h2 className={`${SERIF} text-[30px] leading-tight`}>{te.perguntaDoNascimento}</h2>
            <p className="mt-2 text-sm text-[#b7aecb]">{te.dicaDoNascimento}</p>
            <input
              type="date"
              value={nascimento}
              onChange={(e) => setNascimento(e.target.value)}
              className={`${CAMPO} mt-5`}
              max={new Date().toISOString().slice(0, 10)}
              data-testid="entrada-nascimento"
            />
            <button
              type="button"
              onClick={() => concluir(nascimento || null)}
              className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#c9a54e] text-[15px] font-semibold text-[#1b1433]"
              data-testid="entrada-concluir"
            >
              {te.continuar}
            </button>
          </div>
        ) : null}

        {etapa === "preparando" ? (
          <div className="entrada-surge flex flex-col items-center gap-5 text-center" aria-live="polite">
            <Sparkles className="entrada-gira size-10 text-[#e2c47a]" aria-hidden />
            <p className={`${SERIF} text-[24px]`}>{te.preparando}</p>
          </div>
        ) : null}

        {etapa === "pronta" ? (
          <div className="entrada-surge flex flex-col items-center gap-4 text-center" data-testid="entrada-pronta">
            <Sparkles className="size-9 text-[#e2c47a]" aria-hidden />
            <h2 className={`${SERIF} text-[30px] leading-tight`}>{te.pronta}</h2>
            {ceu ? (
              <p className="rounded-full border border-[#c9a54e]/40 bg-white/[0.06] px-4 py-2 text-[15px]">
                ☉ {te.solEm} {ceu.sol} · ☾ {te.luaEm} {ceu.lua}
                {ceu.luaOutra ? ` ${te.ou} ${ceu.luaOutra}` : ""}
              </p>
            ) : null}
            {foco ? (
              <p className="text-[15px] text-[#d9d0e6]">
                {te.paraCuidarDe} {te.focos[foco].tema}.
              </p>
            ) : null}
            <button
              type="button"
              onClick={entrar}
              className="mt-3 inline-flex h-12 items-center justify-center rounded-full bg-[#c9a54e] px-8 text-[15px] font-semibold text-[#1b1433]"
              data-testid="entrada-entrar"
            >
              {te.entrar}
            </button>
          </div>
        ) : null}

        {erro ? (
          <p role="alert" className="mt-4 text-sm text-[#f3b2a4]">
            {erro}
          </p>
        ) : null}
      </div>
    </div>
  );
}
