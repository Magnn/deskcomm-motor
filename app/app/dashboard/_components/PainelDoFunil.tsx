"use client";

/**
 * As peças do painel por funil (`lib/resultado/funis.ts`): o funil de passos de uma página ou quiz e a faixa do que
 * ainda não tem funil — produto vendido por checkout de fora e campanha de anúncio —, com "ligar a um funil" ali
 * mesmo. Ligar grava em `settings.painel` (`/api/v1/settings/painel`) e o painel recarrega.
 */
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";

export interface FunilDaLista {
  chave: string;
  tipo: "agente" | "quiz" | "pagina";
  nome: string;
}

export interface PassosDoFunil {
  funil: { passo: string; pessoas: number; doTotal: number; doAnterior: number | null }[];
  maiorPerda: { de: string; para: string; perdidos: number } | null;
  whatsapp: number | null;
}

export interface Pendencias {
  produtos: { nome: string; vendas: number; valor: number }[];
  campanhas: { id: string; nome: string; gasto: number; sugestao: string | null }[];
}

const formatBRL = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function FunilDePassos({ passos }: { passos: PassosDoFunil }) {
  const t = useT();
  const nomeDoPasso: Record<string, string> = {
    abriu: t("Abriu a página"),
    dados: t("Preencheu nome e data"),
    perguntas: t("Respondeu as perguntas"),
    email: t("Chegou ao e-mail"),
    previa: t("Viu a prévia"),
    pagar: t("Clicou em pagar"),
    cobranca: t("Recebeu o Pix ou o link do cartão"),
    pago: t("Pagou"),
    leitura: t("Viu a leitura"),
    meio: t("Leu até o meio"),
    oferta: t("Viu a oferta"),
    comprar: t("Clicou em comprar"),
    whatsapp: t("Chamou no WhatsApp"),
  };
  return (
    <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm space-y-3" data-testid="dashboard-funil-passos">
      <div className="text-sm font-semibold text-text">{t("Funil completo")}</div>
      <div className="space-y-2">
        {passos.funil.map((l) => (
          <div key={l.passo} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text">{nomeDoPasso[l.passo] ?? l.passo}</span>
              <span className="text-text-muted tabular-nums">
                {l.pessoas} · {Math.round(l.doTotal * 100)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${Math.max(2, Math.round(l.doTotal * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="text-xs text-text-muted space-y-0.5">
        {passos.maiorPerda ? (
          <div>
            {t("Maior perda")}: {nomeDoPasso[passos.maiorPerda.de] ?? passos.maiorPerda.de} → {nomeDoPasso[passos.maiorPerda.para] ?? passos.maiorPerda.para} (
            {passos.maiorPerda.perdidos})
          </div>
        ) : null}
        {passos.whatsapp !== null ? (
          <div>
            {t("Chamou no WhatsApp")}: {passos.whatsapp}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FaixaDePendencias({
  pendencias,
  funis,
  aoLigar,
}: {
  pendencias: Pendencias;
  funis: FunilDaLista[];
  aoLigar: () => void;
}) {
  const t = useT();
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  if (funis.length === 0 || (pendencias.produtos.length === 0 && pendencias.campanhas.length === 0)) return null;

  const ligar = async (chave: string, corpo: Record<string, unknown>) => {
    setSalvando(chave);
    setErro(null);
    try {
      const r = await fetch("/api/v1/settings/painel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!r.ok) setErro(r.status === 403 ? t("Só gerente ou administrador liga a um funil.") : t("Não foi possível salvar."));
      else aoLigar();
    } finally {
      setSalvando(null);
    }
  };

  const seletor = (chave: string, sugestao: string | null, aoEscolher: (f: string) => void) => (
    <select
      defaultValue={sugestao ?? ""}
      disabled={salvando === chave}
      onChange={(e) => e.target.value && aoEscolher(e.target.value)}
      aria-label={t("Ligar a um funil")}
      className="text-xs bg-surface-elevated border border-border rounded-lg px-2 py-1 text-text"
    >
      <option value="">{t("Ligar a um funil")}</option>
      {funis.map((f) => (
        <option key={f.chave} value={f.chave}>
          {f.nome}
        </option>
      ))}
    </select>
  );

  return (
    <div className="bg-warning-bg border border-border rounded-2xl p-4 space-y-3" data-testid="dashboard-pendencias">
      <div className="text-sm font-semibold text-text">{t("Sem funil: entram só em \"Todos os funis\"")}</div>
      {pendencias.produtos.map((p) => (
        <div key={`p-${p.nome}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-text">
            {t("Produto")}: <strong>{p.nome}</strong> · {p.vendas} {t("vendas")} · {formatBRL(p.valor)}
          </span>
          {seletor(`p-${p.nome}`, null, (f) => void ligar(`p-${p.nome}`, { produto: { nome: p.nome, funil: f } }))}
        </div>
      ))}
      {pendencias.campanhas.map((c) => (
        <div key={`c-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-text">
            {t("Campanha")}: <strong>{c.nome}</strong> · {formatBRL(c.gasto)}
          </span>
          <span className="flex items-center gap-2">
            {c.sugestao ? (
              <button
                type="button"
                disabled={salvando === `c-${c.id}`}
                onClick={() => void ligar(`c-${c.id}`, { campanha: { id: c.id, funil: c.sugestao } })}
                className="text-xs font-semibold px-2 py-1 rounded-lg bg-accent text-white"
              >
                {t("Ligar a")} {funis.find((f) => f.chave === c.sugestao)?.nome ?? c.sugestao}
              </button>
            ) : null}
            {seletor(`c-${c.id}`, null, (f) => void ligar(`c-${c.id}`, { campanha: { id: c.id, funil: f } }))}
          </span>
        </div>
      ))}
      {erro ? <div className="text-xs text-danger">{erro}</div> : null}
    </div>
  );
}
