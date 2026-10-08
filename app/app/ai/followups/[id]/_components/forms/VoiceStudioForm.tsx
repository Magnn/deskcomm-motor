"use client";

import { useState, useRef, useEffect } from "react";
import {
  Microphone,
  Eye,
  Info,
  ArrowsClockwise,
  Play,
  Pause,
  SpeakerHigh,
  DotsThree,
  Check,
} from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { voiceStudioConfigSchema } from "@/lib/followup/graph-schema";
import { VOZ_LEGADA } from "@/lib/followup/nos-de-envio";
import { preencherVariaveisDoContato } from "@/lib/followup/variaveis-do-contato";
import { VOZES_DA_OPENAI } from "@/lib/voz/catalogo-openai";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"voice_studio">;
  onChange: (c: ConfigOf<"voice_studio">) => void;
}

interface VoiceModel {
  id: string;
  name: string;
  subtitle: string;
  gender: "female" | "male";
  pitch: number;
}

// Vozes REAIS da OpenAI (a mesma lista do Voice Studio do menu e do agente). A chave é a da organização.
const PRE_CONFIGURED_VOICES: VoiceModel[] = VOZES_DA_OPENAI.map((v) => ({
  id: v.id,
  name: v.nome,
  subtitle: v.descricao ?? "",
  gender: v.genero === "masculina" ? "male" : "female",
  pitch: 1,
}));

// Só o que o motor resolve na hora do envio (`lib/followup/variaveis-do-contato.ts`).
const CUSTOM_FIELDS = [
  { id: "{primeiro_nome}", label: "Primeiro Nome" },
  { id: "{nome_completo}", label: "Nome Completo" },
  { id: "{telefone}", label: "Telefone" },
];

export function VoiceStudioForm({ config, onChange }: Props) {
  const t = useT();

  const [text, setText] = useState(config.text || "");
  const [stability, setStability] = useState(config.stability ?? 0.5);
  const [similarity, setSimilarity] = useState(config.similarity ?? 0.7);
  const [style, setStyle] = useState(config.style ?? 0.5); // Sotaque
  const [speed, setSpeed] = useState(config.speed ?? 1.0); // Velocidade
  const [sendAsVoiceNote] = useState(config.send_as_voice_note ?? true);
  const vozInicial = VOZ_LEGADA[config.voice_id] ?? (config.voice_id || "coral");
  const [voiceId, setVoiceId] = useState(vozInicial);
  const [voiceName, setVoiceName] = useState(
    PRE_CONFIGURED_VOICES.find((v) => v.id === vozInicial)?.name ?? config.voice_name ?? "Coral",
  );
  const [erroDaVoz, setErroDaVoz] = useState<string | null>(null);

  const [showCustomFields, setShowCustomFields] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const update = (patch: Partial<ConfigOf<"voice_studio">>) => {
    const next = {
      text: patch.text !== undefined ? patch.text : text,
      stability: patch.stability !== undefined ? patch.stability : stability,
      similarity: patch.similarity !== undefined ? patch.similarity : similarity,
      style: patch.style !== undefined ? patch.style : style,
      speed: patch.speed !== undefined ? patch.speed : speed,
      send_as_voice_note: patch.send_as_voice_note !== undefined ? patch.send_as_voice_note : sendAsVoiceNote,
      voice_id: patch.voice_id !== undefined ? patch.voice_id : voiceId,
      voice_name: patch.voice_name !== undefined ? patch.voice_name : voiceName,
      provider: "openai" as const,
    };
    const parsed = voiceStudioConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const insertVariable = (varName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      const nextText = text + " " + varName;
      setText(nextText);
      update({ text: nextText });
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = text.substring(0, start) + varName + text.substring(end);
    setText(newText);
    update({ text: newText });

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + varName.length, start + varName.length);
    }, 50);
  };

  // Prévia REAL: a rota sintetiza na chave da organização — o que se ouve é o que a pessoa vai receber.
  const stopAudio = () => {
    const a = audioRef.current;
    if (a) {
      a.onended = null;
      a.ontimeupdate = null;
      a.pause();
      audioRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlayingVoiceId(null);
  };

  const tocarPrevia = async (texto: string, vozId: string) => {
    setErroDaVoz(null);
    const amostra = preencherVariaveisDoContato(texto, { name: "Maria Souza", phone: "11 99999-0000", email: "maria@exemplo.com" });
    try {
      const resp = await fetch("/api/v1/ai/voices/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "openai",
          voice_id: vozId,
          text: amostra.slice(0, 300),
          speed: Math.min(1.2, Math.max(0.7, speed || 1)),
        }),
      });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(corpo?.error?.message ?? t("Não foi possível ouvir a voz agora."));
      }
      const url = URL.createObjectURL(await resp.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onloadedmetadata = () => setAudioDuration(Math.round(audio.duration) || 0);
      audio.ontimeupdate = () => setAudioCurrentTime(audio.currentTime);
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setAudioCurrentTime(0);
        stopAudio();
      };
      setIsPlayingAudio(true);
      await audio.play();
    } catch (e) {
      stopAudio();
      setErroDaVoz(e instanceof Error ? e.message : t("Não foi possível ouvir a voz agora."));
    }
  };

  const handleTestAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }
    setAudioCurrentTime(0);
    void tocarPrevia(text.trim() || `Olá! Este é um teste da voz ${voiceName} do Voice Studio.`, voiceId);
  };

  const handlePreviewVoice = (v: VoiceModel, e: React.MouseEvent) => {
    e.stopPropagation();
    if (playingVoiceId === v.id) {
      stopAudio();
      return;
    }
    stopAudio();
    setPlayingVoiceId(v.id);
    setVoiceId(v.id);
    setVoiceName(v.name);
    update({ voice_id: v.id, voice_name: v.name });
    void tocarPrevia(`Olá! Eu sou a voz ${v.name}.`, v.id).then(() => undefined);
  };

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatSliderValue = (val: number) => {
    return val.toFixed(1).replace(".", ",");
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* 1. Header do Campo Texto */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-semibold text-text">
            {t("Texto")}
          </label>
          <button
            type="button"
            onClick={() => setShowCustomFields(!showCustomFields)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cat-blue hover:text-cat-blue-fg transition-colors cursor-pointer"
          >
            <Eye size={14} className="shrink-0" />
            <span>{t("Campos Personalizados")}</span>
          </button>
        </div>

        {/* Gaveta de Campos Personalizados */}
        {showCustomFields && (
          <div className="p-2.5 rounded-lg border border-cat-blue/30 bg-cat-blue-bg space-y-1.5 animate-in fade-in slide-in-from-top-1">
            <span className="text-[11px] font-medium text-cat-blue-fg block">
              {t("Clique para inserir uma variável no áudio:")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_FIELDS.map((cf) => (
                <button
                  key={cf.id}
                  type="button"
                  onClick={() => insertVariable(cf.id)}
                  className="px-2 py-1 rounded-md bg-surface hover:bg-cat-blue-bg text-cat-blue-fg border border-cat-blue/30 text-[11px] font-mono shadow-2xs transition-colors cursor-pointer"
                >
                  {cf.id}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            update({ text: e.target.value });
          }}
          rows={4}
          placeholder={t("Digite aqui o texto desejado para virar um áudio.")}
          className="w-full rounded-lg border border-border-strong bg-surface p-3 text-xs text-text placeholder-neutral-400 focus:border-cat-violet focus:outline-hidden focus:ring-1 focus:ring-cat-violet resize-y"
        />
      </div>

      {/* 2. Divisor de Seção: Configurações de voz */}
      <div className="relative flex items-center justify-center py-1">
        <div className="grow border-t border-border" />
        <div className="mx-3 flex items-center gap-1.5 text-xs text-text-muted font-normal">
          <span>{t("Configurações de voz")}</span>
          <span title={t("Ajuste a estabilidade, similaridade, estilo e velocidade da voz")} className="cursor-help">
            <Info size={14} className="text-cat-blue" />
          </span>
        </div>
        <div className="grow border-t border-border" />
      </div>

      {/* 3. Os 4 Sliders */}
      <div className="space-y-3.5">
        {/* Estabilidade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-text-muted shrink-0">
            {t("Estabilidade")}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={stability}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setStability(val);
              update({ stability: val });
            }}
            className="grow h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded-md border border-cat-blue/30 bg-cat-blue-bg text-cat-blue text-xs font-mono">
            {formatSliderValue(stability)}
          </div>
        </div>

        {/* Similaridade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-text-muted shrink-0">
            {t("Similaridade")}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={similarity}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setSimilarity(val);
              update({ similarity: val });
            }}
            className="grow h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded-md border border-cat-blue/30 bg-cat-blue-bg text-cat-blue text-xs font-mono">
            {formatSliderValue(similarity)}
          </div>
        </div>

        {/* Sotaque */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-text-muted shrink-0">
            {t("Sotaque")}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={style}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setStyle(val);
              update({ style: val });
            }}
            className="grow h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded-md border border-cat-blue/30 bg-cat-blue-bg text-cat-blue text-xs font-mono">
            {formatSliderValue(style)}
          </div>
        </div>

        {/* Velocidade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-text-muted shrink-0">
            {t("Velocidade")}
          </span>
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={speed}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setSpeed(val);
              update({ speed: val });
            }}
            className="grow h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded-md border border-cat-blue/30 bg-cat-blue-bg text-cat-blue text-xs font-mono">
            {formatSliderValue(speed)}x
          </div>
        </div>
      </div>

      {/* Aviso em vermelho de tokens */}
      <div className="text-center pt-1 text-[11px] text-cat-red">
        <span>{t("Testar esse áudio irá consumir ")}</span>
        <strong className="font-semibold text-cat-red-fg">{t("0 tokens.")}</strong>
      </div>

      {/* 4. Player de Teste de Áudio no estilo exato do screenshot */}
      <div className="flex items-center gap-2 p-1.5 rounded-lg border border-border bg-surface-elevated">
        <button
          type="button"
          onClick={handleTestAudio}
          className="flex flex-col items-center justify-center w-14 h-12 rounded-md bg-surface-elevated hover:bg-border-strong/80 text-text-muted transition-colors shrink-0 cursor-pointer"
        >
          <ArrowsClockwise size={16} className={isPlayingAudio ? "animate-spin text-cat-violet" : ""} />
          <span className="text-[10px] font-medium pt-0.5">{t("Testar")}</span>
        </button>

        <div className="grow flex items-center gap-2 bg-surface-elevated rounded-full px-3 py-1.5 text-text-muted">
          <button
            type="button"
            onClick={handleTestAudio}
            className="hover:text-cat-violet transition-colors cursor-pointer"
          >
            {isPlayingAudio ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>

          <span className="text-[11px] font-mono select-none">
            {formatSeconds(audioCurrentTime)} / {formatSeconds(audioDuration)}
          </span>

          {/* Barra de progresso */}
          <div className="grow h-1 bg-border-strong rounded-full overflow-hidden mx-1">
            <div
              className="h-full bg-neutral-500 transition-all duration-100"
              style={{
                width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : "0%",
              }}
            />
          </div>

          <SpeakerHigh size={14} className="shrink-0 text-text-muted" />
          <DotsThree size={16} weight="bold" className="shrink-0 text-text-muted" />
        </div>
      </div>

      {erroDaVoz && (
        <p role="alert" className="rounded-lg border border-cat-red/30 bg-cat-red-bg px-3 py-2 text-[11px] text-cat-red-fg">
          {erroDaVoz}
        </p>
      )}

      {/* O áudio sai sempre como nota de voz (o balão gravado do WhatsApp) — não há a opção de arquivo. */}
      <p className="text-[11px] text-text-muted">
        {t("Sai como nota de voz no WhatsApp. Se a voz não puder ser gerada, a pessoa recebe o texto.")}
      </p>

      {/* 6. Divisor de Seção: Modelo de áudio */}
      <div className="relative flex items-center justify-center py-1">
        <div className="grow border-t border-border" />
        <span className="mx-3 text-xs text-text-muted font-normal">
          {t("Modelo de áudio")}
        </span>
        <div className="grow border-t border-border" />
      </div>

      {/* 7. Grid de 6 Modelos de Voz (2 colunas) */}
      <div className="grid grid-cols-2 gap-2.5">
        {PRE_CONFIGURED_VOICES.map((v) => {
          const isSelected = voiceId === v.id;
          const isPlayingThis = playingVoiceId === v.id;

          return (
            <div
              key={v.id}
              onClick={() => {
                setVoiceId(v.id);
                setVoiceName(v.name);
                update({ voice_id: v.id, voice_name: v.name });
              }}
              className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                isSelected
                  ? "border-[#9333ea] bg-cat-violet-bg shadow-xs"
                  : "border-border bg-surface hover:border-border-strong"
              }`}
            >
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1">
                  <h4 className="text-xs font-semibold text-text truncate">
                    {v.name}
                  </h4>
                  {isSelected && (
                    <Check size={12} weight="bold" className="text-cat-violet shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-text-subtle truncate">
                  {v.subtitle}
                </p>
              </div>

              {/* Botão circular de Play preview */}
              <button
                type="button"
                onClick={(e) => handlePreviewVoice(v, e)}
                title={isPlayingThis ? t("Pausar prévia") : t("Ouvir prévia")}
                className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
                  isPlayingThis
                    ? "border-cat-violet bg-cat-violet text-cat-on animate-pulse"
                    : "border-border-strong bg-surface-elevated text-text-muted hover:bg-surface-elevated"
                }`}
              >
                {isPlayingThis ? (
                  <Pause size={12} weight="fill" />
                ) : (
                  <Play size={12} weight="fill" className="translate-x-[1px]" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
