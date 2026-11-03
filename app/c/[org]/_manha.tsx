"use client";

/**
 * A SUA MANHÃ na aba Hoje (migration 0956): a carta do dia lida para ela, a energia do dia pelo céu dela e um gesto.
 * Quem tem o Plano da Semana ou o Círculo pede a do dia ao abrir (uma chamada de IA por dia, guardada no servidor);
 * quem não tem e a empresa vende o plano vê o convite, que leva ao Explorar, onde o plano está.
 */
import * as React from "react";

import { Loader2, Sunrise } from "lucide-react";

import type { ManhaDela } from "@/lib/area-do-cliente/manha";

import { BotaoIrParaAba } from "./_abas";
import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { CARTAO, DETALHE, SERIF, SOBRETITULO } from "./_tema";

export interface TextosDaManha {
  sobretitulo: string;
  carta: string;
  energia: string;
  gesto: string;
  preparando: string;
  tentarDeNovo: string;
  convite: string;
  verPlano: string;
}

export function ManhaDoCliente({ slug, cor, tx, tm }: { slug: string; cor: string; tx: TextosDaArea; tm: TextosDaManha }) {
  const [estado, setEstado] = React.useState<{ fase: "carregando" } | { fase: "pronta"; m: ManhaDela } | { fase: "erro"; mensagem: string }>({
    fase: "carregando",
  });
  const pedir = React.useCallback(async () => {
    setEstado({ fase: "carregando" });
    const r = await postarJson<ManhaDela>(`/api/v1/area/publica/${slug}/manha`, {}, tx);
    setEstado(r.ok ? { fase: "pronta", m: r.data } : { fase: "erro", mensagem: r.mensagem });
  }, [slug, tx]);
  React.useEffect(() => {
    void pedir();
  }, [pedir]);

  return (
    <section className={CARTAO} data-testid="area-manha" aria-live="polite">
      <p className={SOBRETITULO}>
        <Sunrise aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
        {tm.sobretitulo}
      </p>
      {estado.fase === "carregando" ? (
        <p className={`mt-3 flex items-center gap-2 ${DETALHE}`}>
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> {tm.preparando}
        </p>
      ) : estado.fase === "erro" ? (
        <div className="mt-3">
          <p className={DETALHE}>{estado.mensagem}</p>
          <button type="button" onClick={() => void pedir()} className="mt-2 text-[15px] font-semibold underline underline-offset-4" style={{ color: cor }}>
            {tm.tentarDeNovo}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <Parte titulo={tm.carta} texto={estado.m.carta} />
          <Parte titulo={tm.energia} texto={estado.m.energia} />
          <div className="rounded-2xl px-4 py-3" style={{ background: `${cor}1f` }}>
            <p className={SOBRETITULO}>{tm.gesto}</p>
            <p className="mt-1 text-[16px] leading-snug text-[#efe7f7]">{estado.m.gesto}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Parte({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className={`${DETALHE} font-semibold uppercase tracking-wide`}>{titulo}</p>
      <p className={`${SERIF} mt-1 text-[18px] leading-snug text-[#efe7f7]`}>{texto}</p>
    </div>
  );
}

/** Para quem ainda não tem o plano: o que ele traria hoje, sem texto da IA (nada é gasto) e sem pressa. */
export function ConviteDaManha({ cor, tm }: { cor: string; tm: TextosDaManha }) {
  return (
    <section className={CARTAO} data-testid="area-manha-convite">
      <p className={SOBRETITULO}>
        <Sunrise aria-hidden className="mr-1 inline h-4 w-4 align-[-3px]" />
        {tm.sobretitulo}
      </p>
      <p className={`${SERIF} mt-2 text-[18px] leading-snug text-[#efe7f7]`}>{tm.convite}</p>
      <BotaoIrParaAba aba="explorar" className="mt-3 inline-block text-[15px] font-semibold underline underline-offset-4" style={{ color: cor }}>
        {tm.verPlano}
      </BotaoIrParaAba>
    </section>
  );
}
