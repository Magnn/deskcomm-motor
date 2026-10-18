"use client";
/**
 * AS ETAPAS DO TRABALHO na área do cliente: a linha do tempo (aba Meu trabalho)
 * e a etapa da vez (aba Hoje).
 *
 * O estado mora num provedor só, acima das abas: marcar "Fiz esta etapa" na
 * Hoje já aparece na linha do tempo, sem recarregar. A marcação é otimista e
 * volta atrás se a rota recusar.
 */
import * as React from "react";
import { Check, Sparkles } from "lucide-react";

import { etapaDaVez, linhaDoTempo, type Etapa, type EtapaNaLinhaDoTempo } from "@/lib/area-do-cliente/etapas";

import { BotaoIrParaAba } from "./_abas";
import { CARTAO, DETALHE, SERIF, SOBRETITULO, TEXTO_SUAVE } from "./_tema";

export interface TextosDasEtapas {
  etapaDeHoje: string;
  de: string;
  fizEstaEtapa: string;
  desfazer: string;
  feitaEm: string;
  verTrabalho: string;
  concluido: string;
  etapasFeitas: string;
  naoFoiPossivel: string;
  semConexao: string;
  jaFizTodas: string;
  eAgora: string;
  proximoPasso: string;
  conhecer: string;
  contarComoFoi: string;
}

export interface TrabalhoInicial {
  servicoId: string;
  nome: string;
  etapas: EtapaNaLinhaDoTempo[];
}

interface Trabalho {
  servicoId: string;
  nome: string;
  etapas: Etapa[];
  feitas: Map<number, string>;
}

interface Contexto {
  trabalhos: Trabalho[];
  marcar: (servicoId: string, indice: number, feita: boolean) => Promise<void>;
  erro: string | null;
  te: TextosDasEtapas;
  cor: string;
  tag: string;
  fuso: string;
}

const EtapasContexto = React.createContext<Contexto | null>(null);

export function EtapasDaArea({
  slug,
  inicial,
  te,
  cor,
  tag,
  fuso,
  children,
}: {
  slug: string;
  inicial: TrabalhoInicial[];
  te: TextosDasEtapas;
  cor: string;
  tag: string;
  fuso: string;
  children: React.ReactNode;
}) {
  const [trabalhos, setTrabalhos] = React.useState<Trabalho[]>(() =>
    inicial.map((t) => ({
      servicoId: t.servicoId,
      nome: t.nome,
      etapas: t.etapas.map(({ titulo, orientacao }) => (orientacao ? { titulo, orientacao } : { titulo })),
      feitas: new Map(t.etapas.filter((e) => e.feitaEm).map((e) => [e.indice, e.feitaEm as string] as const)),
    })),
  );
  const [erro, setErro] = React.useState<string | null>(null);

  const aplicar = React.useCallback((servicoId: string, indice: number, feitaEm: string | null) => {
    setTrabalhos((lista) =>
      lista.map((t) => {
        if (t.servicoId !== servicoId) return t;
        const feitas = new Map(t.feitas);
        if (feitaEm) feitas.set(indice, feitaEm);
        else feitas.delete(indice);
        return { ...t, feitas };
      }),
    );
  }, []);

  const marcar = React.useCallback(
    async (servicoId: string, indice: number, feita: boolean) => {
      setErro(null);
      const antes = trabalhos.find((t) => t.servicoId === servicoId)?.feitas.get(indice) ?? null;
      aplicar(servicoId, indice, feita ? new Date().toISOString() : null);
      try {
        const res = await fetch(`/api/v1/area/publica/${slug}/etapas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ servico_id: servicoId, indice, feita }),
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => null)) as { data?: { feita_em: string | null }; error?: { message?: string } } | null;
        if (!res.ok) {
          aplicar(servicoId, indice, antes);
          setErro(json?.error?.message ?? te.naoFoiPossivel);
        } else if (json?.data?.feita_em) {
          aplicar(servicoId, indice, json.data.feita_em);
        }
      } catch {
        aplicar(servicoId, indice, antes);
        setErro(te.semConexao);
      }
    },
    [aplicar, slug, te.naoFoiPossivel, te.semConexao, trabalhos],
  );

  const valor = React.useMemo(() => ({ trabalhos, marcar, erro, te, cor, tag, fuso }), [trabalhos, marcar, erro, te, cor, tag, fuso]);
  return <EtapasContexto.Provider value={valor}>{children}</EtapasContexto.Provider>;
}

function useEtapas(): Contexto {
  const c = React.useContext(EtapasContexto);
  if (!c) throw new Error("EtapasDaArea ausente");
  return c;
}

function quando(iso: string, tag: string, fuso: string): string {
  return new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

function Progresso({ feitas, total }: { feitas: number; total: number }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#efe7d6]" aria-hidden>
      <div className="h-full rounded-full bg-[#c9a54e] transition-[width] duration-500" style={{ width: `${(feitas / total) * 100}%` }} />
    </div>
  );
}

/** Um trabalho da vitrine que a pessoa ainda não tem, para o "e agora?" de quem terminou. */
export interface ProximoPasso {
  nome: string;
  descricao: string | null;
}

/**
 * Aba Hoje: a etapa da vez do trabalho mais recente, com o "Fiz esta etapa".
 *
 * Duas lacunas medidas em 18/10/2026, pensando em quem está lá dentro:
 *  - quem comprou antes da área existir fez as noites pela conversa e nunca marcou nada; abria a área dez
 *    dias depois e via "Noite 1" como se o trabalho nem tivesse começado. "Já fiz todas as etapas" resolve
 *    num toque;
 *  - quem terminava via só "Você concluiu", e a área acabava ali. Agora o fim tem um "e agora?": contar
 *    como foi (a conversa) e, sem pressa, o próximo trabalho que ela ainda não tem.
 */
export function EtapaDeHoje({ proximo = null }: { proximo?: ProximoPasso | null }) {
  const { trabalhos, marcar, erro, te, cor } = useEtapas();
  const [marcandoTodas, setMarcandoTodas] = React.useState(false);
  const t = trabalhos.at(0);
  if (!t) return null;
  const linha = linhaDoTempo(t.etapas, t.feitas);
  const vez = etapaDaVez(linha);
  const feitas = linha.filter((e) => e.estado === "feita").length;

  const marcarTodas = async () => {
    setMarcandoTodas(true);
    // Em sequência, não em paralelo: cada marcação é otimista e a rota tem limite por pessoa.
    for (const e of linha) if (e.estado !== "feita") await marcar(t.servicoId, e.indice, true);
    setMarcandoTodas(false);
  };

  if (!vez) {
    return (
      <section className={CARTAO} data-testid="area-etapas-concluidas">
        <div className="text-center">
          <Sparkles className="mx-auto size-7 text-[#a8842f]" strokeWidth={1.5} aria-hidden />
          <p className={`${SERIF} mt-2 text-[22px] leading-snug`}>{te.concluido}</p>
          <p className={`mt-1 ${TEXTO_SUAVE}`}>{t.nome}</p>
        </div>
        <div className="mt-6 border-t border-[#efe7d6] pt-5">
          <p className={SOBRETITULO}>{te.eAgora}</p>
          <BotaoIrParaAba
            aba="conversa"
            className="mt-3 inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold text-white"
            style={{ background: cor }}
          >
            {te.contarComoFoi}
          </BotaoIrParaAba>
          {proximo ? (
            <div className="mt-5" data-testid="area-proximo-passo">
              <p className={TEXTO_SUAVE}>{te.proximoPasso}</p>
              <p className={`${SERIF} mt-2 text-[20px] leading-snug`}>{proximo.nome}</p>
              {proximo.descricao ? <p className={`mt-1 ${TEXTO_SUAVE}`}>{proximo.descricao}</p> : null}
              <BotaoIrParaAba
                aba="explorar"
                className="mt-3 text-sm font-semibold text-[#8a6b22] underline decoration-[#e2c47a] decoration-2 underline-offset-4"
              >
                {te.conhecer}
              </BotaoIrParaAba>
            </div>
          ) : null}
        </div>
      </section>
    );
  }
  return (
    <section className={CARTAO} data-testid="area-etapa-de-hoje">
      <p className={SOBRETITULO}>
        {te.etapaDeHoje} · {vez.indice + 1} {te.de} {linha.length}
      </p>
      <p className={`${SERIF} mt-2 text-[24px] leading-tight`}>{vez.titulo}</p>
      {vez.orientacao ? <p className={`mt-2 ${TEXTO_SUAVE}`}>{vez.orientacao}</p> : null}
      <p className={`mt-3 ${DETALHE}`}>{t.nome}</p>
      <Progresso feitas={feitas} total={linha.length} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void marcar(t.servicoId, vez.indice, true)}
          className="inline-flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold text-white shadow-[0_8px_20px_-10px_rgba(36,31,49,0.6)] transition hover:brightness-110 active:scale-[0.98]"
          style={{ background: cor }}
          data-testid="area-fiz-etapa-hoje"
        >
          <Check className="size-4" strokeWidth={2.5} aria-hidden />
          {te.fizEstaEtapa}
        </button>
        <BotaoIrParaAba aba="trabalho" className="text-sm font-semibold text-[#8a6b22] underline decoration-[#e2c47a] decoration-2 underline-offset-4">
          {te.verTrabalho}
        </BotaoIrParaAba>
      </div>
      {feitas < linha.length - 1 ? (
        <button
          type="button"
          onClick={() => void marcarTodas()}
          disabled={marcandoTodas}
          className="mt-4 text-sm text-[#6f6880] underline underline-offset-4 disabled:opacity-60"
          data-testid="area-ja-fiz-todas"
        >
          {te.jaFizTodas}
        </button>
      ) : null}
      {erro ? (
        <p role="alert" className="mt-3 text-sm text-[#a5361f]">
          {erro}
        </p>
      ) : null}
    </section>
  );
}

/** Aba Meu trabalho: a linha do tempo de cada trabalho comprado que tem etapas. */
export function LinhasDoTempo() {
  const { trabalhos, marcar, erro, te, cor, tag, fuso } = useEtapas();
  if (trabalhos.length === 0) return null;
  return (
    <>
      {trabalhos.map((t) => {
        const linha = linhaDoTempo(t.etapas, t.feitas);
        const feitas = linha.filter((e) => e.estado === "feita").length;
        return (
          <section key={t.servicoId} className={CARTAO} data-testid="area-linha-do-tempo">
            <p className={SOBRETITULO}>
              {feitas} {te.de} {linha.length} {te.etapasFeitas}
            </p>
            <h2 className={`${SERIF} mt-1 text-[22px] leading-tight`}>{t.nome}</h2>
            <Progresso feitas={feitas} total={linha.length} />
            <ol className="mt-5">
              {linha.map((e, i) => {
                const ultima = i === linha.length - 1;
                return (
                  <li key={e.indice} className="relative flex gap-4 pb-5 last:pb-0" data-estado={e.estado}>
                    {!ultima ? (
                      <span
                        className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${e.estado === "feita" ? "bg-[#c9a54e]" : "bg-[#efe7d6]"}`}
                        aria-hidden
                      />
                    ) : null}
                    <span
                      className={
                        e.estado === "feita"
                          ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#c9a54e] text-white"
                          : e.estado === "agora"
                            ? "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-white text-sm font-bold"
                            : "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#e4dccb] bg-[#fdfbf7] text-sm text-[#a59eb0]"
                      }
                      style={e.estado === "agora" ? { borderColor: cor, color: cor, boxShadow: `0 0 0 4px ${cor}1f` } : undefined}
                      aria-hidden
                    >
                      {e.estado === "feita" ? <Check className="size-4" strokeWidth={3} /> : e.indice + 1}
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className={e.estado === "depois" ? "text-[15px] text-[#8b8497]" : "text-[15px] font-semibold"}>{e.titulo}</p>
                      {e.orientacao && e.estado !== "depois" ? <p className="mt-1 text-sm leading-relaxed text-[#5f586c]">{e.orientacao}</p> : null}
                      {e.estado === "feita" && e.feitaEm ? (
                        <p className={`mt-1 ${DETALHE}`}>
                          {te.feitaEm} {quando(e.feitaEm, tag, fuso)} ·{" "}
                          <button type="button" onClick={() => void marcar(t.servicoId, e.indice, false)} className="underline underline-offset-2">
                            {te.desfazer}
                          </button>
                        </p>
                      ) : null}
                      {e.estado === "agora" ? (
                        <button
                          type="button"
                          onClick={() => void marcar(t.servicoId, e.indice, true)}
                          className="mt-3 inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white"
                          style={{ background: cor }}
                          data-testid="area-fiz-etapa"
                        >
                          <Check className="size-4" strokeWidth={2.5} aria-hidden />
                          {te.fizEstaEtapa}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            {erro ? (
              <p role="alert" className="mt-3 text-sm text-[#a5361f]">
                {erro}
              </p>
            ) : null}
          </section>
        );
      })}
    </>
  );
}
