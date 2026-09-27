"use client";
/**
 * "Por anúncio" — dentro da aba Consciência: nível/desejo/medo/promessa POR ANÚNCIO específico, não
 * pelo agente inteiro. Quando o anúncio de origem do contato bate com um brief (por `ad_id` exato do
 * Meta Ads Manager, ou por um trecho do título), ele VENCE o padrão do agente — o dono sabe o ângulo
 * de cada anúncio que ele mesmo escreveu.
 *
 * Cada brief é uma LINHA própria (`ai_agent_ad_briefs`, migration 0904), com seu próprio salvar/editar/
 * apagar — diferente das outras abas, que são um objeto só. Por isso a tela é lista + formulário
 * inline, não um formulário único com botão "Salvar" no fim.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  DESCRICAO_DO_NIVEL,
  NIVEIS_DE_CONSCIENCIA,
  type NivelDeConsciencia,
} from "@/lib/consciencia/tipos";

interface AdBriefRow {
  id: string;
  rotulo: string;
  ad_id: string | null;
  titulo_contem: string | null;
  nivel: NivelDeConsciencia | null;
  desejo_ou_dor: string | null;
  medo_oculto: string | null;
  promessa: string | null;
  ativo: boolean;
}

interface Formulario {
  rotulo: string;
  adId: string;
  tituloContem: string;
  nivel: NivelDeConsciencia | "";
  desejoOuDor: string;
  medoOculto: string;
  promessa: string;
  ativo: boolean;
}

const VAZIO: Formulario = {
  rotulo: "",
  adId: "",
  tituloContem: "",
  nivel: "",
  desejoOuDor: "",
  medoOculto: "",
  promessa: "",
  ativo: true,
};

function doRow(row: AdBriefRow): Formulario {
  return {
    rotulo: row.rotulo,
    adId: row.ad_id ?? "",
    tituloContem: row.titulo_contem ?? "",
    nivel: row.nivel ?? "",
    desejoOuDor: row.desejo_ou_dor ?? "",
    medoOculto: row.medo_oculto ?? "",
    promessa: row.promessa ?? "",
    ativo: row.ativo,
  };
}

function paraCorpo(f: Formulario): Record<string, unknown> {
  return {
    rotulo: f.rotulo.trim(),
    ...(f.adId.trim() !== "" ? { ad_id: f.adId.trim() } : {}),
    ...(f.tituloContem.trim() !== "" ? { titulo_contem: f.tituloContem.trim() } : {}),
    ...(f.nivel !== "" ? { nivel: f.nivel } : {}),
    ...(f.desejoOuDor.trim() !== "" ? { desejo_ou_dor: f.desejoOuDor.trim() } : {}),
    ...(f.medoOculto.trim() !== "" ? { medo_oculto: f.medoOculto.trim() } : {}),
    ...(f.promessa.trim() !== "" ? { promessa: f.promessa.trim() } : {}),
    ativo: f.ativo,
  };
}

interface Props {
  agentId: string;
  readOnly?: boolean;
}

export function BriefsDeAnuncioDoAgente({ agentId, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const queryKey = React.useMemo(() => ["ai", "agents", agentId, "ad-briefs"], [agentId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { ad_briefs: AdBriefRow[] } }>(
        `/api/v1/ai/agents/${agentId}/ad-briefs`,
      );
      return res.data.ad_briefs;
    },
  });

  const [aberto, setAberto] = React.useState<string | "novo" | null>(null);
  const [form, setForm] = React.useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));

  function abrirNovo() {
    setForm(VAZIO);
    setAberto("novo");
  }
  function abrirEdicao(row: AdBriefRow) {
    setForm(doRow(row));
    setAberto(row.id);
  }
  function fechar() {
    setAberto(null);
    setForm(VAZIO);
  }

  async function salvar() {
    if (form.rotulo.trim() === "") {
      toast.error(t("Dê um nome para este brief."));
      return;
    }
    if (form.adId.trim() === "" && form.tituloContem.trim() === "") {
      toast.error(t("Preencha o ID do anúncio ou um trecho do título — pelo menos um dos dois."));
      return;
    }
    setSalvando(true);
    try {
      if (aberto === "novo") {
        await apiClient.post(`/api/v1/ai/agents/${agentId}/ad-briefs`, paraCorpo(form));
        toast.success(t("Brief criado."));
      } else if (aberto !== null) {
        await apiClient.put(`/api/v1/ai/agents/${agentId}/ad-briefs/${aberto}`, paraCorpo(form));
        toast.success(t("Brief salvo."));
      }
      await qc.invalidateQueries({ queryKey });
      fechar();
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    setSalvando(true);
    try {
      await apiClient.delete(`/api/v1/ai/agents/${agentId}/ad-briefs/${id}`);
      await qc.invalidateQueries({ queryKey });
      toast.success(t("Brief apagado."));
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  const briefs = query.data ?? [];

  return (
    <Card className="flex flex-col gap-4 p-4" data-testid="briefs-de-anuncio">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{t("Por anúncio")}</h3>
          <p className="max-w-xl text-xs text-text-muted">
            {t(
              "Quando bate com o anúncio de onde a pessoa veio, o brief abaixo VENCE o padrão acima — pelo ID exato do anúncio (Meta Ads Manager), ou por um trecho do título.",
            )}
          </p>
        </div>
        {!readOnly ? (
          <Button type="button" size="sm" variant="outline" onClick={abrirNovo} disabled={aberto !== null}>
            {t("+ Adicionar")}
          </Button>
        ) : null}
      </div>

      {query.isLoading ? <p className="text-sm text-text-muted">{t("Carregando…")}</p> : null}

      <div className="flex flex-col gap-2">
        {briefs.map((row) => (
          <div key={row.id} className="rounded-md border border-border p-3" data-testid={`brief-${row.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{row.rotulo}</span>
                {row.nivel ? <Badge variant="outline">{t(DESCRICAO_DO_NIVEL[row.nivel].rotulo)}</Badge> : null}
                {!row.ativo ? <Badge variant="secondary">{t("Desligado")}</Badge> : null}
              </div>
              {!readOnly ? (
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => abrirEdicao(row)}>
                    {t("Editar")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => void apagar(row.id)}>
                    {t("Apagar")}
                  </Button>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {row.ad_id
                ? `${t("ID do anúncio")}: ${row.ad_id}`
                : `${t("Título contém")}: "${row.titulo_contem}"`}
            </p>
          </div>
        ))}
        {briefs.length === 0 && !query.isLoading ? (
          <p className="text-sm text-text-muted">{t("Nenhum brief cadastrado ainda.")}</p>
        ) : null}
      </div>

      {aberto !== null ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-4" data-testid="brief-formulario">
          <div className="flex flex-col gap-1">
            <Label htmlFor="brief-rotulo">{t("Nome deste brief")}</Label>
            <Input
              id="brief-rotulo"
              maxLength={80}
              value={form.rotulo}
              onChange={(e) => patch({ rotulo: e.target.value })}
              placeholder={t("ex.: Anúncio dor financeira — fev/26")}
              disabled={salvando}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="brief-ad-id">{t("ID do anúncio (Meta Ads Manager)")}</Label>
              <Input
                id="brief-ad-id"
                maxLength={100}
                value={form.adId}
                onChange={(e) => patch({ adId: e.target.value })}
                placeholder="120211..."
                disabled={salvando}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="brief-titulo-contem">{t("Ou um trecho do título do anúncio")}</Label>
              <Input
                id="brief-titulo-contem"
                maxLength={140}
                value={form.tituloContem}
                onChange={(e) => patch({ tituloContem: e.target.value })}
                placeholder={t("ex.: recomece")}
                disabled={salvando}
              />
            </div>
          </div>
          <p className="text-xs text-text-muted">
            {t("Preencha pelo menos um dos dois. O ID exato tem prioridade quando os dois baterem.")}
          </p>

          <div className="flex flex-col gap-1">
            <Label htmlFor="brief-nivel">{t("Nível de consciência")}</Label>
            <Select value={form.nivel || undefined} onValueChange={(v) => patch({ nivel: v as NivelDeConsciencia })} disabled={salvando}>
              <SelectTrigger id="brief-nivel">
                <SelectValue placeholder={t("Escolha um nível")} />
              </SelectTrigger>
              <SelectContent>
                {NIVEIS_DE_CONSCIENCIA.map((n) => (
                  <SelectItem key={n} value={n}>
                    {t(DESCRICAO_DO_NIVEL[n].rotulo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="brief-desejo">{t("O que ela mais quer resolver ou conquistar")}</Label>
            <Textarea
              id="brief-desejo"
              rows={2}
              maxLength={300}
              value={form.desejoOuDor}
              onChange={(e) => patch({ desejoOuDor: e.target.value })}
              disabled={salvando}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brief-medo">{t("O medo de fundo, raramente dito em voz alta")}</Label>
            <Textarea
              id="brief-medo"
              rows={2}
              maxLength={300}
              value={form.medoOculto}
              onChange={(e) => patch({ medoOculto: e.target.value })}
              disabled={salvando}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="brief-promessa">{t("A promessa central deste anúncio")}</Label>
            <Textarea
              id="brief-promessa"
              rows={2}
              maxLength={300}
              value={form.promessa}
              onChange={(e) => patch({ promessa: e.target.value })}
              disabled={salvando}
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.ativo} onCheckedChange={(v) => patch({ ativo: v })} disabled={salvando} aria-label={t("Brief ativo")} />
            <Label>{t("Ativo (anúncio ainda em veiculação)")}</Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={fechar} disabled={salvando}>
              {t("Cancelar")}
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar brief")}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
