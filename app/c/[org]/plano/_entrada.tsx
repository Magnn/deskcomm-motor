"use client";

/**
 * A entrada pelo plano de 7 dias no navegador: o que vem, o preço na moeda de quem olha, os dados (nome, e-mail,
 * nascimento e foco) e o pagamento. O pedido e o segredo ficam no navegador: quem volta para a página depois de
 * pagar encontra a área abrindo. Pago o plano, a sessão abre por `/entrada/[id]/entrar` e a página leva para a área.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { FOCOS_DA_ENTRADA, type FocoDaEntrada } from "@/lib/area-do-cliente/entrada";
import { moedaDaOferta, precoDaOferta, valorNaMoedaDaPagina, type MoedaDaPagina } from "@/lib/area-do-cliente/moeda-do-visitante";
import type { PrecoInternacional } from "@/lib/preco/tipos";
import { copyToClipboard } from "@/lib/clipboard";

import { CARTAO, SERIF, SOBRETITULO } from "../_tema";
import type { TextosDaEntrada } from "./_textos";

type Cobranca = { forma: "pix"; copiaECola: string; qrPng: string | null } | { forma: "cartao"; url: string };
type Pedido = { id: string; segredo: string };

const com = (texto: string, valores: Record<string, string | number>) =>
  texto.replace(/\{([a-z]+)\}/g, (_, k: string) => String(valores[k] ?? `{${k}}`));

export function EntradaDoPlano(props: {
  slug: string;
  area: string;
  cor: string;
  precoCents: number;
  precosInternacionais: PrecoInternacional[];
  creditos: number;
  tx: TextosDaEntrada;
}) {
  const { slug, area, cor, precoCents, precosInternacionais, creditos, tx } = props;
  const base = `/api/v1/area/publica/${slug}/entrada`;
  const chave = `entrada-${slug}`;

  const [moeda, setMoeda] = useState<MoedaDaPagina>("BRL");
  useEffect(() => {
    let fuso: string | null = null;
    try {
      fuso = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* sem fuso: reais */
    }
    setMoeda(moedaDaOferta({ preco_cents: precoCents, precos_internacionais: precosInternacionais }, fuso));
  }, [precoCents, precosInternacionais]);
  const preco = precoDaOferta({ preco_cents: precoCents, precos_internacionais: precosInternacionais }, moeda) ?? precoCents;
  const valor = valorNaMoedaDaPagina(preco, moeda);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [foco, setFoco] = useState<FocoDaEntrada | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [jaTem, setJaTem] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const consultando = useRef(false);

  // Quem pagou e voltou para a página: o pedido está guardado, a consulta abaixo abre a área.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(chave);
      if (guardado) setPedido(JSON.parse(guardado) as Pedido);
    } catch {
      /* sem armazenamento: começa do zero */
    }
  }, [chave]);

  const consultar = useCallback(async () => {
    if (!pedido || consultando.current) return;
    consultando.current = true;
    try {
      const r = await fetch(`${base}/${pedido.id}/entrar`, {
        method: "POST",
        headers: { "x-segredo": pedido.segredo },
        credentials: "same-origin",
      });
      if (r.ok) {
        const { data } = (await r.json()) as { data: { area: string } };
        setEntrando(true);
        try {
          localStorage.removeItem(chave);
        } catch {
          /* nada a limpar */
        }
        window.location.assign(data.area);
      } else if (r.status === 404) {
        // Segredo de outro aparelho ou pedido apagado: volta ao formulário.
        setPedido(null);
        try {
          localStorage.removeItem(chave);
        } catch {
          /* nada a limpar */
        }
      }
    } catch {
      /* rede: tenta na próxima volta */
    } finally {
      consultando.current = false;
    }
  }, [pedido, base, chave]);

  useEffect(() => {
    if (!pedido || entrando) return;
    void consultar();
    const t = setInterval(() => void consultar(), 4000);
    return () => clearInterval(t);
  }, [pedido, entrando, consultar]);

  async function pagar(forma: "pix" | "cartao") {
    setErro(null);
    setJaTem(false);
    if (!nome.trim() || !email.includes("@") || !foco) {
      setErro(tx.confira);
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          email: email.trim(),
          ...(nascimento ? { nascimento } : {}),
          foco,
          forma,
          moeda,
        }),
      });
      const corpo = (await r.json().catch(() => null)) as
        | { data?: { id: string; segredo: string; cobranca: Cobranca }; error?: { code: string; message: string } }
        | null;
      if (!r.ok || !corpo?.data) {
        setErro(corpo?.error?.message ?? tx.naoFoiPossivel);
        setJaTem(corpo?.error?.code === "ja_tem_area");
        return;
      }
      const p = { id: corpo.data.id, segredo: corpo.data.segredo };
      try {
        localStorage.setItem(chave, JSON.stringify(p));
      } catch {
        /* sem armazenamento: a página segue, só não lembra depois */
      }
      setPedido(p);
      setCobranca(corpo.data.cobranca);
      if (corpo.data.cobranca.forma === "cartao") window.open(corpo.data.cobranca.url, "_blank", "noopener");
    } catch {
      setErro(tx.semConexao);
    } finally {
      setEnviando(false);
    }
  }

  const botao = "w-full rounded-full px-6 py-4 text-base font-semibold text-white shadow-lg disabled:opacity-50";
  const campo =
    "w-full rounded-2xl border border-[#c9a54e]/25 bg-[#120d22] px-4 py-3 text-base text-[#f6f0e4] placeholder:text-[#7d7495] focus:outline-hidden focus:ring-2";

  if (entrando) {
    return (
      <section className="mx-auto max-w-xl px-5 pb-10">
        <div className={`${CARTAO} text-center`}>
          <p className={SOBRETITULO}>{tx.confirmado}</p>
          <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.entrando}</h2>
        </div>
      </section>
    );
  }

  if (pedido) {
    return (
      <section className="mx-auto max-w-xl px-5 pb-10" data-testid="entrada-pagar">
        <div className={CARTAO}>
          <p className={SOBRETITULO}>{tx.quaseLa}</p>
          {cobranca?.forma === "pix" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.pagueComPix}</h2>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px] text-[#c3bad3]">
                <li>{tx.pixPasso1}</li>
                <li>{tx.pixPasso2}</li>
                <li>
                  {tx.pixPasso3} ({valor})
                </li>
              </ol>
              {cobranca.qrPng ? (
                // eslint-disable-next-line @next/next/no-img-element -- QR em data URI, gerado na hora
                <img src={cobranca.qrPng} alt="QR code do Pix" className="mx-auto mt-4 h-48 w-48 rounded-xl bg-white p-2" />
              ) : null}
              <button
                className={`${botao} mt-4`}
                style={{ background: cor }}
                onClick={() => void copyToClipboard(cobranca.copiaECola).then((ok) => setCopiado(ok))}
              >
                {copiado ? tx.copiado : tx.copiar}
              </button>
            </>
          ) : cobranca?.forma === "cartao" ? (
            <>
              <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.pagueNoCartao}</h2>
              <a className={`${botao} mt-4 block text-center`} style={{ background: cor }} href={cobranca.url} target="_blank" rel="noopener noreferrer">
                {tx.abrirPagamento}
              </a>
            </>
          ) : (
            <h2 className={`${SERIF} mt-2 text-2xl text-[#f6e3a8]`}>{tx.esperando}</h2>
          )}
          <p className="mt-4 text-center text-sm text-[#c3bad3]">{tx.assimQueCairArea}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl space-y-5 px-5 pb-10" data-testid="entrada-oferta">
      <p className="text-center text-[16px] leading-relaxed text-[#c3bad3]">
        {com(creditos > 0 ? tx.chamada : tx.chamadaSemCreditos, { preco: valor, n: creditos })}
      </p>

      <div className={CARTAO}>
        <p className={SOBRETITULO}>{tx.oQueVem}</p>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-[#f6f0e4]">
          {tx.itens
            .filter((_, i) => i > 0 || creditos > 0)
            .map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-[#e2c47a]">
                  ✦
                </span>
                <span>{com(item, { n: creditos })}</span>
              </li>
            ))}
        </ul>
        <p className="mt-4 text-sm text-[#c3bad3]">{tx.semSurpresa}</p>
      </div>

      <div className={`${CARTAO} space-y-4`}>
        <label className="block">
          <span className="mb-1 block text-sm text-[#c3bad3]">{tx.nome}</span>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoComplete="given-name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#c3bad3]">{tx.email}</span>
          <input className={campo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#c3bad3]">{tx.nascimento}</span>
          <input className={campo} type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} />
        </label>
        <fieldset>
          <legend className="mb-2 block text-sm text-[#c3bad3]">{tx.foco}</legend>
          <div className="grid grid-cols-2 gap-2">
            {FOCOS_DA_ENTRADA.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFoco(f)}
                aria-pressed={foco === f}
                className={`rounded-2xl border px-3 py-3 text-[15px] ${foco === f ? "border-transparent text-white" : "border-[#c9a54e]/25 text-[#f6f0e4]"}`}
                style={foco === f ? { background: cor } : undefined}
              >
                {tx.focos[f]}
              </button>
            ))}
          </div>
        </fieldset>
        {erro ? (
          <p className="text-sm text-[#f3a6bd]" role="alert">
            {erro}{" "}
            {jaTem ? (
              <a className="underline" href={area}>
                {tx.jaTemArea}
              </a>
            ) : null}
          </p>
        ) : null}
        <div className="space-y-3 pt-1">
          {moeda === "BRL" ? (
            <button className={botao} style={{ background: cor }} disabled={enviando} onClick={() => void pagar("pix")} data-testid="entrada-pix">
              {tx.pagarPix} · {valor}
            </button>
          ) : null}
          <button
            className={`${botao} ${moeda === "BRL" ? "bg-white/10" : ""}`}
            style={moeda === "BRL" ? undefined : { background: cor }}
            disabled={enviando}
            onClick={() => void pagar("cartao")}
            data-testid="entrada-cartao"
          >
            {tx.pagarCartao} · {valor}
          </button>
          {moeda !== "BRL" ? <p className="text-center text-xs text-[#9d94b2]">{tx.soCartao}</p> : null}
        </div>
      </div>
    </section>
  );
}
