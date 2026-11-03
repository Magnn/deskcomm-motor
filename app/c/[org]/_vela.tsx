"use client";

/**
 * POR QUEM EU PEÇO na aba Hoje (migration 0957): a vela de 7 dias com uma intenção.
 *
 * Sem vela aberta, quem tem o plano escreve por quem pede e o quê e acende; acesa, a aba mostra o dia, a oração e a
 * intenção para repetir; depois do sétimo dia (ou quando a graça vier antes), ela marca se a graça veio. As graças
 * marcadas ficam contadas: é o fio dela.
 */
import * as React from "react";

import { Loader2 } from "lucide-react";

import { DIAS_DA_VELA, PEDIDO_MAXIMO, POR_QUEM_MAXIMO, type VelaNaArea } from "@/lib/area-do-cliente/intencao";

import { postarJson } from "./_circulo";
import { type TextosDaArea } from "./_client";
import { BOTAO, BOTAO_CONTORNO, CARTAO, DETALHE, SERIF, SOBRETITULO } from "./_tema";

export interface TextosDaVela {
  sobretitulo: string;
  convite: string;
  porQuem: string;
  porQuemExemplo: string;
  pedido: string;
  pedidoExemplo: string;
  acender: string;
  acendendo: string;
  por: string;
  dia: string;
  repita: string;
  gracaVeio: string;
  apagou: string;
  pergunta: string;
  veio: string;
  aindaNao: string;
  obrigadaVeio: string;
  obrigadaAinda: string;
  acenderOutra: string;
  gracas: string;
}

type Fim = { veio: boolean } | null;

export function VelaDoCliente({
  slug,
  cor,
  tx,
  tv,
  vela: inicial,
  gracas: gracasIniciais,
  podeAcender,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  tv: TextosDaVela;
  vela: VelaNaArea | null;
  gracas: number;
  podeAcender: boolean;
}) {
  const [vela, setVela] = React.useState(inicial);
  const [gracas, setGracas] = React.useState(gracasIniciais);
  const [fim, setFim] = React.useState<Fim>(null);
  const [porQuem, setPorQuem] = React.useState("");
  const [pedido, setPedido] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function acender(e: React.FormEvent) {
    e.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await postarJson<VelaNaArea>(`/api/v1/area/publica/${slug}/vela`, { por_quem: porQuem, pedido }, tx);
    setOcupado(false);
    if (!r.ok) return setErro(r.mensagem);
    setVela(r.data);
    setFim(null);
  }

  async function graca(veio: boolean) {
    if (!vela || ocupado) return;
    setOcupado(true);
    setErro(null);
    const r = await postarJson<{ ok: true }>(`/api/v1/area/publica/${slug}/vela/${vela.id}/graca`, { veio }, tx);
    setOcupado(false);
    if (!r.ok) return setErro(r.mensagem);
    if (veio) setGracas((n) => n + 1);
    // "Ainda não": o pedido volta ao formulário, para acender de novo sem reescrever.
    if (!veio) {
      setPorQuem(vela.porQuem);
      setPedido(vela.pedido);
    }
    setVela(null);
    setFim({ veio });
  }

  if (!vela && !podeAcender && gracas === 0) return null;

  return (
    <section className={CARTAO} data-testid="area-vela" aria-live="polite">
      <p className={SOBRETITULO}>{tv.sobretitulo}</p>

      {vela ? (
        <div className="mt-3">
          <div className="flex items-center gap-4">
            <Chama acesa={vela.dia !== null} />
            <div>
              <p className={DETALHE}>{tv.por}</p>
              <p className="text-[17px] font-semibold text-[#efe7f7]">{vela.porQuem}</p>
              <p className={DETALHE}>
                {vela.dia !== null ? tv.dia.replace("{n}", String(vela.dia)).replace("{total}", String(DIAS_DA_VELA)) : tv.apagou}
              </p>
            </div>
          </div>
          <p className={`${SERIF} mt-4 text-[18px] leading-snug text-[#efe7f7]`}>{vela.oracao}</p>
          <div className="mt-4 rounded-2xl px-4 py-3" style={{ background: `${cor}1f` }}>
            <p className={SOBRETITULO}>{tv.repita}</p>
            <p className="mt-1 text-[16px] leading-snug text-[#efe7f7]">{vela.intencao}</p>
          </div>
          {vela.dia === null ? (
            <div className="mt-4">
              <p className="text-[16px] text-[#efe7f7]">{tv.pergunta}</p>
              <div className="mt-3 flex gap-3">
                <button type="button" disabled={ocupado} onClick={() => void graca(true)} className={`${BOTAO} flex-1`} style={{ background: cor }}>
                  {tv.veio}
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void graca(false)}
                  className={`${BOTAO_CONTORNO} flex-1`}
                >
                  {tv.aindaNao}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void graca(true)}
              className="mt-3 text-[15px] font-semibold underline underline-offset-4"
              style={{ color: cor }}
            >
              {tv.gracaVeio}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2">
          {fim ? <p className="mb-3 text-[16px] leading-snug text-[#efe7f7]">{fim.veio ? tv.obrigadaVeio : tv.obrigadaAinda}</p> : null}
          {podeAcender ? (
            <form onSubmit={(e) => void acender(e)} className="space-y-3">
              {!fim ? <p className={`${SERIF} text-[18px] leading-snug text-[#efe7f7]`}>{tv.convite}</p> : null}
              <label className="block">
                <span className={DETALHE}>{tv.porQuem}</span>
                <input
                  value={porQuem}
                  onChange={(e) => setPorQuem(e.target.value)}
                  maxLength={POR_QUEM_MAXIMO}
                  required
                  placeholder={tv.porQuemExemplo}
                  className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-[16px] text-[#efe7f7] placeholder:text-[#8f86a6]"
                />
              </label>
              <label className="block">
                <span className={DETALHE}>{tv.pedido}</span>
                <textarea
                  value={pedido}
                  onChange={(e) => setPedido(e.target.value)}
                  maxLength={PEDIDO_MAXIMO}
                  required
                  minLength={5}
                  rows={3}
                  placeholder={tv.pedidoExemplo}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[16px] text-[#efe7f7] placeholder:text-[#8f86a6]"
                />
              </label>
              <button type="submit" disabled={ocupado} className={`${BOTAO} w-full`} style={{ background: cor }}>
                {ocupado ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> {tv.acendendo}
                  </span>
                ) : fim ? (
                  tv.acenderOutra
                ) : (
                  tv.acender
                )}
              </button>
            </form>
          ) : null}
        </div>
      )}

      {erro ? (
        <p role="alert" className="mt-3 text-[15px] text-[#f3b4b4]">
          {erro}
        </p>
      ) : null}
      {gracas > 0 ? <p className={`mt-4 ${DETALHE}`}>{tv.gracas.replace("{n}", String(gracas))}</p> : null}
    </section>
  );
}

/** A vela desenhada: a chama tremula enquanto acesa (sem animação para quem pede menos movimento). */
function Chama({ acesa }: { acesa: boolean }) {
  return (
    <div aria-hidden className="relative flex h-16 w-10 shrink-0 flex-col items-center justify-end">
      {acesa ? (
        <span
          className="motion-safe:animate-pulse mb-0.5 block h-6 w-3.5 rounded-[50%_50%_50%_50%/60%_60%_40%_40%]"
          style={{ background: "radial-gradient(circle at 50% 70%, #fff6cf 0%, #f6c75b 45%, #e0782f 100%)", boxShadow: "0 0 18px 6px #f6c75b55" }}
        />
      ) : (
        <span className="mb-0.5 block h-3 w-px bg-[#8f86a6]" />
      )}
      <span className="block h-9 w-6 rounded-t-md" style={{ background: "linear-gradient(#f4ecdf, #d9cdb8)" }} />
    </div>
  );
}
