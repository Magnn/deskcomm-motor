"use client";
/**
 * AS SIMPATIAS e a CONTRIBUIÇÃO na área do cliente (`lib/area-do-cliente/simpatias.ts`).
 *
 * Cada simpatia tem duas saídas: "fazer em casa" (o passo a passo, que pode ser só de quem está no Círculo) e
 * "o templo faz por mim" (serviço pago à parte). Os pedidos pagos aparecem com o estado: o templo vai fazer, ou
 * feita em tal dia, com o recado da equipe. A contribuição é voluntária e fica separada, com o aviso de que não
 * muda nada no atendimento.
 */
import * as React from "react";
import { ChevronDown, Flame, HandHeart } from "lucide-react";

import { TituloDaSecao, type TextosDaArea } from "./_client";
import { PagarNaArea } from "./_circulo";
import { CAMPO, CARTAO, SERIF, TEXTO_SUAVE } from "./_tema";

export interface TextosDasSimpatias {
  titulo: string;
  convite: string;
  fazerEmCasa: string;
  materiais: string;
  passoAPasso: string;
  cuidado: string;
  soNoCirculo: string;
  temploFaz: string;
  temploFazExplica: string;
  paraQuem: string;
  paraQuemExemplo: string;
  seusPedidos: string;
  vaiFazer: string;
  feitaEm: string;
  semPromessa: string;
  contribuicaoTitulo: string;
  contribuicaoTexto: string;
  contribuicaoValor: string;
  contribuicaoMinimo: string;
}

export interface SimpatiaNaArea {
  id: string;
  titulo: string;
  intencao: string;
  /** `null` quando a pessoa não vê o passo a passo (só o Círculo vê). */
  materiais: string | null;
  passos: string | null;
  cuidado: string | null;
}

export interface PedidoNaArea {
  id: string;
  titulo: string;
  feitaEm: string | null;
  nota: string | null;
}

function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\n+/).map((linha, i) => (
        <p key={i} className={`${TEXTO_SUAVE} mt-1.5`}>
          {linha}
        </p>
      ))}
    </>
  );
}

function CartaoDaSimpatia({
  s,
  slug,
  cor,
  tx,
  ts,
  preco,
}: {
  s: SimpatiaNaArea;
  slug: string;
  cor: string;
  tx: TextosDaArea;
  ts: TextosDasSimpatias;
  preco: string;
}) {
  const [aberta, setAberta] = React.useState(false);
  const [pedindo, setPedindo] = React.useState(false);
  const [paraQuem, setParaQuem] = React.useState("");
  return (
    <article className="rounded-2xl border border-[#ebe3d3] bg-[#fdfbf7] p-5" data-testid="area-simpatia">
      <h3 className={`${SERIF} text-xl leading-snug`}>{s.titulo}</h3>
      <p className={`mt-1.5 ${TEXTO_SUAVE}`}>{s.intencao}</p>

      {s.passos ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            aria-expanded={aberta}
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: cor }}
            data-testid="area-simpatia-fazer-em-casa"
          >
            {ts.fazerEmCasa}
            <ChevronDown className={`size-4 transition-transform ${aberta ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {aberta ? (
            <div className="mt-3 space-y-3 rounded-xl bg-white p-4" data-testid="area-simpatia-passos">
              {s.materiais ? (
                <div>
                  <p className="text-sm font-semibold">{ts.materiais}</p>
                  <Paragrafos texto={s.materiais} />
                </div>
              ) : null}
              <div>
                <p className="text-sm font-semibold">{ts.passoAPasso}</p>
                <Paragrafos texto={s.passos} />
              </div>
              {s.cuidado ? (
                <div>
                  <p className="text-sm font-semibold">{ts.cuidado}</p>
                  <Paragrafos texto={s.cuidado} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[#6f6880]" data-testid="area-simpatia-so-circulo">
          {ts.soNoCirculo}
        </p>
      )}

      <div className="mt-4 border-t border-[#efe7d6] pt-4">
        {pedindo ? (
          <>
            <p className="text-sm">{ts.temploFazExplica}</p>
            <label className="mt-3 block">
              <span className="text-sm font-semibold">{ts.paraQuem}</span>
              <input
                value={paraQuem}
                onChange={(e) => setParaQuem(e.target.value)}
                maxLength={200}
                className={`mt-2 ${CAMPO}`}
                placeholder={ts.paraQuemExemplo}
              />
            </label>
            <PagarNaArea
              endpoint={`/api/v1/area/publica/${slug}/simpatias`}
              corpo={{ simpatia_id: s.id, ...(paraQuem.trim() ? { para_quem: paraQuem.trim() } : {}) }}
              cor={cor}
              tx={tx}
              rotulo={preco}
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setPedindo(true)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border-2 bg-white px-5 text-[15px] font-semibold"
            style={{ borderColor: cor, color: cor }}
            data-testid="area-simpatia-templo-faz"
          >
            <Flame className="size-4" aria-hidden />
            {ts.temploFaz} · {preco}
          </button>
        )}
      </div>
    </article>
  );
}

export function SimpatiasDoCliente({
  slug,
  cor,
  tx,
  ts,
  preco,
  simpatias,
  pedidos,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  ts: TextosDasSimpatias;
  preco: string;
  simpatias: SimpatiaNaArea[];
  pedidos: PedidoNaArea[];
}) {
  if (simpatias.length === 0 && pedidos.length === 0) return null;
  return (
    <section className={CARTAO} data-testid="area-simpatias">
      <TituloDaSecao titulo={ts.titulo} icone={<Flame className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{ts.convite}</p>

      {pedidos.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-[#fdf9ef] p-4" data-testid="area-simpatias-pedidos">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#a8842f]">{ts.seusPedidos}</h3>
          <ul className="mt-3 space-y-3">
            {pedidos.map((p) => (
              <li key={p.id} className="text-sm">
                <span className="font-semibold">{p.titulo}</span>
                <span className={p.feitaEm ? "ml-2 text-xs font-semibold text-[#2f7a4f]" : "ml-2 text-xs text-[#8b8497]"}>
                  {p.feitaEm ? `${ts.feitaEm} ${p.feitaEm} ✓` : ts.vaiFazer}
                </span>
                {p.nota ? <p className={`mt-1 ${TEXTO_SUAVE}`}>{p.nota}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {simpatias.map((s) => (
          <CartaoDaSimpatia key={s.id} s={s} slug={slug} cor={cor} tx={tx} ts={ts} preco={preco} />
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-[#8b8497]">{ts.semPromessa}</p>
    </section>
  );
}

export function ContribuicaoDoCliente({
  slug,
  cor,
  tx,
  ts,
  minimoCents,
  minimo,
}: {
  slug: string;
  cor: string;
  tx: TextosDaArea;
  ts: TextosDasSimpatias;
  minimoCents: number;
  minimo: string;
}) {
  const [valor, setValor] = React.useState("");
  const cents = Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100);
  const valido = Number.isInteger(cents) && cents >= minimoCents;
  return (
    <section className={CARTAO} data-testid="area-contribuicao">
      <TituloDaSecao titulo={ts.contribuicaoTitulo} icone={<HandHeart className="size-5" />} />
      <p className={`mt-2 ${TEXTO_SUAVE}`}>{ts.contribuicaoTexto}</p>
      <label className="mt-4 block">
        <span className="text-sm font-semibold">{ts.contribuicaoValor}</span>
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
          inputMode="decimal"
          className={`mt-2 ${CAMPO}`}
          placeholder={minimo}
          data-testid="area-contribuicao-valor"
        />
      </label>
      <p className="mt-1 text-xs text-[#8b8497]">
        {ts.contribuicaoMinimo} {minimo}
      </p>
      {valido ? <PagarNaArea endpoint={`/api/v1/area/publica/${slug}/contribuicao`} corpo={{ valor_cents: cents }} cor={cor} tx={tx} /> : null}
    </section>
  );
}
