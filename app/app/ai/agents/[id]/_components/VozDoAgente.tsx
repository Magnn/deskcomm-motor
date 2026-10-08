"use client";
/**
 * A aba "Voz": a agente responde em ÁUDIO quando a pessoa mandou áudio (e, no modo
 * "momentos", também nas respostas longas).
 *
 * Aqui o operador escolhe o provedor (OpenAI ou ElevenLabs), ouve as vozes
 * antes de escolher, ajusta a fala e — na ElevenLabs — clona uma voz a partir
 * de gravações. Nada disto é uma versão do prompt: a configuração mora em
 * `ai_agents.config.voice_reply` e vale no PRÓXIMO turno, sem publicar.
 *
 * Duas garantias que a tela existe para tornar visíveis:
 *  - se qualquer coisa falhar com a voz (chave, cota, provedor), a agente
 *    responde em TEXTO — a pessoa nunca fica sem resposta;
 *  - o link de pagamento sai sempre como texto, depois do áudio.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CampoDeChave } from "@/components/ui/campo-de-chave";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { credentialsListQueryKey, type CredentialRow } from "@/hooks/ai/useCredentials";
import { apiClient } from "@/lib/api/client";
import { TEXTO_DO_CONSENTIMENTO } from "@/lib/voz/consentimento";
import type { VozDaBiblioteca } from "@/lib/voz/provedores/tipos";
import {
  PROVEDORES_DE_VOZ,
  voiceReplySchema,
  type GeneroDaVoz,
  type IdDeProvedorDeVoz,
  type VoiceReplyConfig,
  type VozDisponivel,
} from "@/lib/voz/tipos";

interface ProvedorNaResposta {
  id: IdDeProvedorDeVoz;
  rotulo: string;
  quandoUsar: string;
  clona: boolean;
  ondePegarAChave: string;
  prefixoDaChave: string;
  configurado: boolean;
  erro?: string;
}

interface RespostaDeVozes {
  data: { provedores: ProvedorNaResposta[]; vozes: VozDisponivel[] };
}

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  active: boolean;
  readOnly?: boolean;
}

type Formulario = Partial<VoiceReplyConfig> & { enabled: boolean };

const vozesQueryKey = ["ai", "voices"] as const;

/** Lê o que já está salvo SEM lançar: shape estranho vira "desligada". */
function formularioInicial(config: Props["config"]): Formulario {
  const bruto = (config as { voice_reply?: unknown } | null | undefined)?.voice_reply;
  const r = voiceReplySchema.safeParse(bruto);
  if (r.success) return r.data;
  return { enabled: false };
}

async function pedirAudio(corpo: Record<string, unknown>): Promise<Blob> {
  const res = await fetch("/api/v1/ai/voices/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "audio/*" },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) {
    let mensagem = "";
    try {
      mensagem = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // sem corpo legível
    }
    throw new Error(mensagem || `http_${res.status}`);
  }
  return res.blob();
}

export function VozDoAgente({ agentId, config, active, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [genero, setGenero] = React.useState<"all" | GeneroDaVoz>("all");
  const [salvando, setSalvando] = React.useState(false);
  const [tocando, setTocando] = React.useState<string | null>(null);
  const [textoDeTeste, setTextoDeTeste] = React.useState("");
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const vozes = useQuery({
    queryKey: vozesQueryKey,
    queryFn: async () => (await apiClient.get<RespostaDeVozes>("/api/v1/ai/voices")).data,
    enabled: active,
    staleTime: 15_000,
  });
  const credenciais = useQuery({
    queryKey: credentialsListQueryKey,
    queryFn: async () => (await apiClient.get<{ data: CredentialRow[] }>("/api/v1/ai/credentials")).data,
    enabled: active,
    staleTime: 15_000,
  });

  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));
  const provedorAtual = form.provider;
  const provedores = vozes.data?.provedores ?? [];
  const infoDoProvedor = (id: IdDeProvedorDeVoz) => provedores.find((p) => p.id === id);

  const listaDeVozes = (vozes.data?.vozes ?? []).filter(
    (v) => (provedorAtual === undefined || v.provedor === provedorAtual) && (genero === "all" || v.genero === genero),
  );
  const vozEscolhida = (vozes.data?.vozes ?? []).find(
    (v) => v.provedor === form.provider && v.id === form.voice_id,
  );

  const ajustesParaOuvir = (): Record<string, unknown> | null => {
    if (!form.provider || !form.voice_id) return null;
    return {
      provider: form.provider,
      voice_id: form.voice_id,
      ...(form.model ? { model: form.model } : {}),
      ...(form.speed !== undefined ? { speed: form.speed } : {}),
      ...(form.stability !== undefined ? { stability: form.stability } : {}),
      ...(form.similarity_boost !== undefined ? { similarity_boost: form.similarity_boost } : {}),
      ...(form.style !== undefined ? { style: form.style } : {}),
      ...(form.style_instructions ? { style_instructions: form.style_instructions } : {}),
    };
  };

  const ouvir = async (chave: string, corpo: Record<string, unknown>) => {
    audioRef.current?.pause();
    setTocando(chave);
    try {
      const blob = await pedirAudio(corpo);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTocando(null);
      };
      audio.onerror = () => setTocando(null);
      await audio.play();
    } catch (err) {
      setTocando(null);
      toast.error(err instanceof Error && err.message ? err.message : t("Não consegui gerar a voz agora."));
    }
  };

  const salvar = async () => {
    if (form.enabled && (!form.provider || !form.voice_id)) {
      toast.error(t("Escolha uma voz antes de ligar as respostas em áudio."));
      return;
    }
    setSalvando(true);
    try {
      const corpo = form.provider && form.voice_id
        ? {
            ...form,
            mode: form.mode ?? ("mirror" as const),
            voice_name: vozEscolhida?.nome ?? form.voice_name,
          }
        : { enabled: false, mode: "mirror" as const };
      await apiClient.patch(`/api/v1/ai/agents/${agentId}`, { config: { voice_reply: corpo } });
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(form.enabled ? t("Voz salva. Vale a partir da próxima conversa.") : t("Respostas em áudio desligadas."));
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  // `CredentialRow.provider` só conhece os provedores de chat; a chave de voz vive na mesma tabela.
  const chaveDaElevenLabs = (credenciais.data ?? []).find((c) => (c.provider as string) === "elevenlabs");

  return (
    <div className="flex flex-col gap-4" data-testid="voz-do-agente">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium">{t("Responder em áudio")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                "Quando a pessoa mandar um áudio, a agente responde com uma nota de voz. Se qualquer coisa falhar com a voz, ela responde em texto — a pessoa nunca fica sem resposta. O link de pagamento sempre vai como texto, depois do áudio.",
              )}
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
            disabled={readOnly}
            aria-label={t("Responder em áudio")}
          />
        </div>

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("Quando a agente fala")}>
          {(
            [
              ["mirror", t("Só quando a pessoa mandar áudio")],
              ["moments", t("Também nas respostas longas (as explicações)")],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="voz-modo"
                value={valor}
                checked={(form.mode ?? "mirror") === valor}
                onChange={() => patch({ mode: valor })}
                disabled={readOnly}
              />
              {rotulo}
            </label>
          ))}
          {(form.mode ?? "mirror") === "moments" ? (
            <div className="flex flex-col gap-1 pl-6">
              <Label htmlFor="voz-min-chars">{t("Falar a partir de quantos caracteres")}</Label>
              <Input
                id="voz-min-chars"
                type="number"
                min={80}
                max={1500}
                value={form.min_chars_for_voice ?? 240}
                onChange={(e) => patch({ min_chars_for_voice: Number(e.target.value) })}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "Respostas curtas seguem em texto; as mais longas (uma leitura, uma explicação) saem em áudio mesmo que a pessoa esteja escrevendo. Link e emoji não contam.",
                )}
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-base font-medium">{t("Serviço de voz")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PROVEDORES_DE_VOZ.map((p) => {
            const info = infoDoProvedor(p.id);
            const escolhido = provedorAtual === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={readOnly}
                onClick={() => patch({ provider: p.id, voice_id: escolhido ? form.voice_id : undefined, voice_name: undefined })}
                className={`flex flex-col gap-2 rounded-md border p-3 text-left transition-colors ${
                  escolhido ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                }`}
                aria-pressed={escolhido}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{p.rotulo}</span>
                  <Badge variant={info?.configurado ? "default" : "outline"}>
                    {info?.configurado ? t("Chave pronta") : t("Sem chave")}
                  </Badge>
                </span>
                <span className="text-sm text-muted-foreground">{t(p.quandoUsar)}</span>
                {info?.erro ? <span className="text-xs text-destructive">{info.erro}</span> : null}
              </button>
            );
          })}
        </div>

        {provedorAtual === "openai" && infoDoProvedor("openai")?.configurado === false ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            {t("Cadastre uma chave da OpenAI em IA › Credenciais. É a mesma que transcreve os áudios que a pessoa manda.")}
          </p>
        ) : null}

        {provedorAtual === "elevenlabs" ? (
          <ChaveDaElevenLabs
            existente={chaveDaElevenLabs}
            readOnly={readOnly}
            prefixo={PROVEDORES_DE_VOZ[1].prefixoDaChave}
            onMudou={() => {
              void qc.invalidateQueries({ queryKey: credentialsListQueryKey });
              // A chave é validada em segundo plano: olha de novo em instantes.
              window.setTimeout(() => void qc.invalidateQueries({ queryKey: vozesQueryKey }), 3000);
              window.setTimeout(() => void qc.invalidateQueries({ queryKey: vozesQueryKey }), 8000);
              void qc.invalidateQueries({ queryKey: vozesQueryKey });
            }}
          />
        ) : null}
      </Card>

      {provedorAtual ? (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium">{t("Escolha a voz")}</h2>
            <div className="flex gap-1" role="group" aria-label={t("Filtrar por gênero")}>
              {(["all", "feminina", "masculina"] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  size="sm"
                  variant={genero === g ? "default" : "outline"}
                  onClick={() => setGenero(g)}
                >
                  {g === "all" ? t("Todas") : g === "feminina" ? t("Femininas") : t("Masculinas")}
                </Button>
              ))}
            </div>
          </div>

          {provedorAtual === "openai" ? (
            <p className="text-xs text-muted-foreground">
              {t("A OpenAI não classifica as vozes por gênero: a divisão abaixo é como cada uma costuma soar.")}
            </p>
          ) : null}

          {vozes.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("Carregando as vozes…")}</p>
          ) : listaDeVozes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {infoDoProvedor(provedorAtual)?.configurado
                ? t("Nenhuma voz encontrada com este filtro.")
                : t("Cadastre a chave do serviço para ver as vozes.")}
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2" data-testid="lista-de-vozes">
              {listaDeVozes.map((v) => {
                const escolhida = form.voice_id === v.id && form.provider === v.provedor;
                const chave = `${v.provedor}:${v.id}`;
                return (
                  <li
                    key={chave}
                    className={`flex items-start justify-between gap-2 rounded-md border p-3 ${
                      escolhida ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {v.nome}
                        <Badge variant="outline">
                          {v.genero === "feminina" ? t("Feminina") : v.genero === "masculina" ? t("Masculina") : t("Neutra")}
                        </Badge>
                        {v.categoria === "clonada" ? <Badge variant="secondary">{t("Clonada")}</Badge> : null}
                      </p>
                      {v.descricao ? <p className="line-clamp-2 text-xs text-muted-foreground">{v.descricao}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={tocando !== null}
                        onClick={() =>
                          void ouvir(chave, {
                            provider: v.provedor,
                            voice_id: v.id,
                            ...(form.model ? { model: form.model } : {}),
                            ...(v.provedor === "elevenlabs" && form.stability !== undefined ? { stability: form.stability } : {}),
                            ...(v.provedor === "elevenlabs" && form.similarity_boost !== undefined ? { similarity_boost: form.similarity_boost } : {}),
                            ...(v.provedor === "elevenlabs" && form.style !== undefined ? { style: form.style } : {}),
                            ...(form.speed !== undefined ? { speed: form.speed } : {}),
                            ...(form.style_instructions ? { style_instructions: form.style_instructions } : {}),
                          })
                        }
                      >
                        {tocando === chave ? t("Gerando…") : t("Ouvir")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={escolhida ? "default" : "secondary"}
                        disabled={readOnly}
                        onClick={() => patch({ provider: v.provedor, voice_id: v.id, voice_name: v.nome })}
                      >
                        {escolhida ? t("Escolhida") : t("Usar")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {provedorAtual === "elevenlabs" && infoDoProvedor("elevenlabs")?.configurado ? (
        <BibliotecaDeVozes
          readOnly={readOnly}
          onAdicionada={(voz) => {
            void qc.invalidateQueries({ queryKey: vozesQueryKey });
            patch({ provider: voz.provedor, voice_id: voz.id, voice_name: voz.nome });
            toast.success(t("Voz adicionada. Ouça e clique em Salvar voz para usá-la."));
          }}
        />
      ) : null}

      {form.provider && form.voice_id ? (
        <Card className="flex flex-col gap-4 p-4">
          <h2 className="text-base font-medium">{t("Ajustes da fala")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Regua
              rotulo={t("Velocidade")}
              min={0.7}
              max={1.2}
              passo={0.05}
              valor={form.speed ?? 1}
              onChange={(n) => patch({ speed: n })}
              desabilitado={readOnly}
              dica={form.provider === "openai" ? t("Não vale para o modelo padrão da OpenAI: use o estilo da fala abaixo.") : undefined}
            />
            {form.provider === "elevenlabs" ? (
              <>
                <Regua
                  rotulo={t("Estabilidade (menor = mais expressiva)")}
                  min={0}
                  max={1}
                  passo={0.05}
                  valor={form.stability ?? 0.5}
                  onChange={(n) => patch({ stability: n })}
                  desabilitado={readOnly}
                />
                <Regua
                  rotulo={t("Fidelidade à voz original")}
                  min={0}
                  max={1}
                  passo={0.05}
                  valor={form.similarity_boost ?? 0.75}
                  onChange={(n) => patch({ similarity_boost: n })}
                  desabilitado={readOnly}
                />
                <Regua
                  rotulo={t("Expressividade (estilo)")}
                  min={0}
                  max={1}
                  passo={0.05}
                  valor={form.style ?? 0}
                  onChange={(n) => patch({ style: n })}
                  desabilitado={readOnly}
                  dica={t("Acima de 0,5 costuma ficar teatral. Para conversa, de 0 a 0,3.")}
                />
                <div className="flex flex-col gap-1">
                  <Label htmlFor="voz-modelo">{t("Modelo da voz")}</Label>
                  <select
                    id="voz-modelo"
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={form.model ?? ""}
                    disabled={readOnly}
                    onChange={(e) => patch({ model: e.target.value || undefined })}
                  >
                    <option value="">{t("Padrão (multilíngue, estável)")}</option>
                    <option value="eleven_v3">{t("v3 (mais expressiva — ouça antes de salvar)")}</option>
                    <option value="eleven_flash_v2_5">{t("Flash (mais rápida, menos natural)")}</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={readOnly}
                    onClick={() => patch({ stability: 0.35, similarity_boost: 0.8, style: 0.2, speed: 0.95 })}
                  >
                    {t("Deixar mais natural")}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t("Menos estável = mais variação de tom, como fala de gente. Ouça antes de salvar.")}
                  </p>
                </div>
              </>
            ) : null}
            <div className="flex flex-col gap-1">
              <Label htmlFor="voz-max-chars">{t("Tamanho máximo de cada áudio (caracteres)")}</Label>
              <Input
                id="voz-max-chars"
                type="number"
                min={100}
                max={1500}
                value={form.max_chars_per_note ?? 700}
                onChange={(e) => patch({ max_chars_per_note: Number(e.target.value) })}
                disabled={readOnly}
              />
              <p className="text-xs text-muted-foreground">
                {t("Respostas maiores viram até 3 áudios; passando disso, saem em texto.")}
              </p>
            </div>
          </div>

          {form.provider === "openai" ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="voz-estilo">{t("Estilo da fala (opcional)")}</Label>
              <Textarea
                id="voz-estilo"
                rows={2}
                maxLength={400}
                placeholder={t("Ex.: voz calma e acolhedora, ritmo lento, com pausas.")}
                value={form.style_instructions ?? ""}
                onChange={(e) => patch({ style_instructions: e.target.value || undefined })}
                disabled={readOnly}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <Label htmlFor="voz-teste">{t("Ouvir com um texto seu")}</Label>
            <Textarea
              id="voz-teste"
              rows={2}
              maxLength={300}
              placeholder={t("Escreva uma frase que a agente falaria.")}
              value={textoDeTeste}
              onChange={(e) => setTextoDeTeste(e.target.value)}
            />
            <div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={tocando !== null || textoDeTeste.trim() === ""}
                onClick={() => {
                  const base = ajustesParaOuvir();
                  if (base) void ouvir("teste", { ...base, text: textoDeTeste.trim() });
                }}
              >
                {tocando === "teste" ? t("Gerando…") : t("Ouvir esta frase")}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {provedorAtual === "elevenlabs" && infoDoProvedor("elevenlabs")?.configurado ? (
        <ClonarVoz
          readOnly={readOnly}
          onClonada={(voz) => {
            void qc.invalidateQueries({ queryKey: vozesQueryKey });
            patch({ provider: voz.provedor, voice_id: voz.id, voice_name: voz.nome });
            toast.success(t("Voz criada. Ela já aparece na lista — ouça e clique em Salvar para usar."));
          }}
        />
      ) : null}

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? t("Salvando…") : t("Salvar voz")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Regua(props: {
  rotulo: string;
  min: number;
  max: number;
  passo: number;
  valor: number;
  onChange: (n: number) => void;
  desabilitado?: boolean;
  dica?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="flex justify-between">
        <span>{props.rotulo}</span>
        <span className="tabular-nums text-muted-foreground">{props.valor.toFixed(2)}</span>
      </Label>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.passo}
        value={props.valor}
        disabled={props.desabilitado}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="w-full accent-current"
      />
      {props.dica ? <p className="text-xs text-muted-foreground">{props.dica}</p> : null}
    </div>
  );
}

function ChaveDaElevenLabs(props: {
  existente: CredentialRow | undefined;
  readOnly?: boolean;
  prefixo: string;
  onMudou: () => void;
}) {
  const t = useT();
  const [chave, setChave] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);

  const salvar = async () => {
    setOcupado(true);
    try {
      await apiClient.post("/api/v1/ai/credentials", {
        provider: "elevenlabs",
        label: "Voz (ElevenLabs)",
        api_key: chave.trim(),
      });
      setChave("");
      toast.success(t("Chave guardada. Validando…"));
      props.onMudou();
    } catch (err) {
      showApiError(err);
    } finally {
      setOcupado(false);
    }
  };

  const remover = async () => {
    if (!props.existente) return;
    setOcupado(true);
    try {
      await apiClient.delete(`/api/v1/ai/credentials/${props.existente.id}`);
      toast.success(t("Chave removida."));
      props.onMudou();
    } catch (err) {
      showApiError(err);
    } finally {
      setOcupado(false);
    }
  };

  if (props.existente) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <span>
          {t("Chave da ElevenLabs guardada")} · <span className="tabular-nums">…{props.existente.api_key_last4}</span>
          {props.existente.validated_at ? null : (
            <span className="ml-2 text-muted-foreground">{t("(validando ou inválida — confira em instantes)")}</span>
          )}
        </span>
        {!props.readOnly ? (
          <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={() => void remover()}>
            {t("Remover chave")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <Label htmlFor="chave-elevenlabs">{t("Chave da ElevenLabs")}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <CampoDeChave
          id="chave-elevenlabs"
          placeholder={props.prefixo}
          value={chave}
          onChange={(e) => setChave(e.target.value)}
          disabled={props.readOnly}
        />
        <Button type="button" disabled={ocupado || props.readOnly || chave.trim().length < 8} onClick={() => void salvar()}>
          {t("Guardar chave")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("A chave fica guardada criptografada e a cobrança vai direto para a sua conta na ElevenLabs. Pegue em elevenlabs.io › Configurações › Chaves de API.")}
      </p>
    </div>
  );
}

function BibliotecaDeVozes(props: { readOnly?: boolean; onAdicionada: (v: VozDisponivel) => void }) {
  const t = useT();
  const [texto, setTexto] = React.useState("");
  const [genero, setGenero] = React.useState<"all" | GeneroDaVoz>("feminina");
  const [resultado, setResultado] = React.useState<VozDaBiblioteca[] | null>(null);
  const [buscando, setBuscando] = React.useState(false);
  const [adicionando, setAdicionando] = React.useState<string | null>(null);

  const buscar = async () => {
    setBuscando(true);
    try {
      const q = new URLSearchParams();
      if (texto.trim() !== "") q.set("q", texto.trim());
      if (genero !== "all") q.set("genero", genero);
      const qs = q.toString();
      const res = await apiClient.get<{ data: { vozes: VozDaBiblioteca[] } }>(
        `/api/v1/ai/voices/library${qs ? `?${qs}` : ""}`,
      );
      setResultado(res.data.vozes);
    } catch (err) {
      showApiError(err);
    } finally {
      setBuscando(false);
    }
  };

  const adicionar = async (v: VozDaBiblioteca) => {
    setAdicionando(v.id);
    try {
      const res = await apiClient.post<{ data: VozDisponivel }>("/api/v1/ai/voices/library", {
        public_owner_id: v.publicOwnerId,
        voice_id: v.id,
        name: v.nome.slice(0, 60),
      });
      props.onAdicionada({ ...res.data, genero: v.genero });
    } catch (err) {
      showApiError(err);
    } finally {
      setAdicionando(null);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="biblioteca-de-vozes">
      <div className="space-y-1">
        <h2 className="text-base font-medium">{t("Vozes em português do Brasil")}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t(
            "As vozes prontas costumam ser de falantes de inglês e ganham sotaque estrangeiro em português — é o que mais denuncia uma nota de voz de robô. Aqui você acha vozes brasileiras na biblioteca da ElevenLabs, ouve a amostra e adiciona à sua conta. Pode exigir plano pago.",
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t("Buscar voz")}
          placeholder={t("Ex.: acolhedora, calma, madura")}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void buscar();
          }}
        />
        <div className="flex gap-1" role="group" aria-label={t("Filtrar por gênero")}>
          {(["feminina", "masculina", "all"] as const).map((g) => (
            <Button key={g} type="button" size="sm" variant={genero === g ? "default" : "outline"} onClick={() => setGenero(g)}>
              {g === "all" ? t("Todas") : g === "feminina" ? t("Femininas") : t("Masculinas")}
            </Button>
          ))}
        </div>
        <Button type="button" disabled={buscando} onClick={() => void buscar()}>
          {buscando ? t("Buscando…") : t("Buscar")}
        </Button>
      </div>
      {resultado !== null && resultado.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhuma voz encontrada. Tente outra palavra.")}</p>
      ) : null}
      {resultado && resultado.length > 0 ? (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="lista-da-biblioteca">
          {resultado.map((v) => (
            <li key={`${v.publicOwnerId}:${v.id}`} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="min-w-0 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {v.nome}
                  <Badge variant="outline">
                    {v.genero === "feminina" ? t("Feminina") : v.genero === "masculina" ? t("Masculina") : t("Neutra")}
                  </Badge>
                  {v.sotaque ? <Badge variant="secondary">{v.sotaque}</Badge> : null}
                </p>
                {v.descricao ? <p className="line-clamp-2 text-xs text-muted-foreground">{v.descricao}</p> : null}
              </div>
              {v.previewUrl ? <audio controls preload="none" src={v.previewUrl} className="h-8 w-full" /> : null}
              <div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={props.readOnly || adicionando !== null}
                  onClick={() => void adicionar(v)}
                >
                  {adicionando === v.id ? t("Adicionando…") : t("Adicionar à minha conta")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

function ClonarVoz(props: { readOnly?: boolean; onClonada: (v: VozDisponivel) => void }) {
  const t = useT();
  const [nome, setNome] = React.useState("");
  const [genero, setGenero] = React.useState<GeneroDaVoz>("feminina");
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [consentiu, setConsentiu] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);

  const pronto = nome.trim().length >= 2 && arquivos.length >= 1 && arquivos.length <= 5 && consentiu;

  const enviar = async () => {
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.set("name", nome.trim());
      corpo.set("gender", genero);
      corpo.set("consent", "true");
      for (const a of arquivos) corpo.append("samples", a);
      const res = await fetch("/api/v1/ai/voices/clone", { method: "POST", body: corpo });
      const json = (await res.json().catch(() => ({}))) as { data?: VozDisponivel; error?: { message?: string } };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message || t("Não consegui clonar a voz."));
        return;
      }
      setNome("");
      setArquivos([]);
      setConsentiu(false);
      props.onClonada(json.data);
    } catch {
      toast.error(t("Não consegui clonar a voz."));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-4" data-testid="clonar-voz">
      <div className="space-y-1">
        <h2 className="text-base font-medium">{t("Clonar uma voz")}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            "Envie de 1 a 5 gravações limpas da voz (juntas, de 1 a 3 minutos, sem música nem eco). A ElevenLabs cria a voz e ela passa a aparecer na lista acima. Até 9 MB no total (mp3 é o ideal). É preciso um plano da ElevenLabs que inclua clonagem.",
          )}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="clone-nome">{t("Nome da voz")}</Label>
          <Input id="clone-nome" maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} disabled={props.readOnly} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="clone-genero">{t("Gênero da voz")}</Label>
          <select
            id="clone-genero"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={genero}
            onChange={(e) => setGenero(e.target.value as GeneroDaVoz)}
            disabled={props.readOnly}
          >
            <option value="feminina">{t("Feminina")}</option>
            <option value="masculina">{t("Masculina")}</option>
            <option value="neutra">{t("Neutra")}</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="clone-arquivos">{t("Gravações")}</Label>
        <Input
          id="clone-arquivos"
          type="file"
          multiple
          accept="audio/*,video/mp4,video/webm"
          onChange={(e) => setArquivos(Array.from(e.target.files ?? []).slice(0, 5))}
          disabled={props.readOnly}
        />
        {arquivos.length > 0 ? (
          <p className="text-xs text-muted-foreground">{arquivos.map((a) => a.name).join(", ")}</p>
        ) : null}
      </div>
      <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={consentiu}
          onChange={(e) => setConsentiu(e.target.checked)}
          disabled={props.readOnly}
        />
        <span>{t(TEXTO_DO_CONSENTIMENTO)}</span>
      </label>
      <div>
        <Button type="button" disabled={!pronto || enviando || props.readOnly} onClick={() => void enviar()}>
          {enviando ? t("Clonando…") : t("Clonar voz")}
        </Button>
      </div>
    </Card>
  );
}
