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

const PRE_CONFIGURED_VOICES: VoiceModel[] = [
  { id: "julieta", name: "Julieta", subtitle: "Pré Configurada", gender: "female", pitch: 1.1 },
  { id: "marcos_vinicius", name: "Marcos Vinicius", subtitle: "Pré Configurada", gender: "male", pitch: 0.9 },
  { id: "carla", name: "Carla", subtitle: "Pré Configurada", gender: "female", pitch: 1.0 },
  { id: "joao_pedro", name: "João Pedro", subtitle: "Pré Configurada", gender: "male", pitch: 0.85 },
  { id: "maria_eduarda", name: "Maria Eduarda", subtitle: "Pré Configurada", gender: "female", pitch: 1.15 },
  { id: "otavio_luiz", name: "Otavio Luiz", subtitle: "Pré Configurada", gender: "male", pitch: 0.95 },
];

const CUSTOM_FIELDS = [
  { id: "{primeiro_nome}", label: "Primeiro Nome" },
  { id: "{nome_completo}", label: "Nome Completo" },
  { id: "{telefone}", label: "Telefone" },
  { id: "{chave_pix}", label: "Chave PIX" },
  { id: "{valor_cobranca}", label: "Valor" },
  { id: "{nome_empresa}", label: "Empresa" },
];

export function VoiceStudioForm({ config, onChange }: Props) {
  const t = useT();

  const [text, setText] = useState(config.text || "");
  const [stability, setStability] = useState(config.stability ?? 0.5);
  const [similarity, setSimilarity] = useState(config.similarity ?? 0.7);
  const [style, setStyle] = useState(config.style ?? 0.5); // Sotaque
  const [speed, setSpeed] = useState(config.speed ?? 1.0); // Velocidade
  const [sendAsVoiceNote, setSendAsVoiceNote] = useState(config.send_as_voice_note ?? true);
  const [voiceId, setVoiceId] = useState(config.voice_id || "julieta");
  const [voiceName, setVoiceName] = useState(config.voice_name || "Julieta");

  const [showCustomFields, setShowCustomFields] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Áudio Player Test (usando Web Speech API se disponível no navegador)
  const stopAudio = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (audioIntervalRef.current) {
      clearInterval(audioIntervalRef.current);
      audioIntervalRef.current = null;
    }
    setIsPlayingAudio(false);
    setPlayingVoiceId(null);
  };

  const handleTestAudio = () => {
    if (isPlayingAudio) {
      stopAudio();
      return;
    }

    const phraseToSpeak = text.trim() || `Olá! Este é um teste da voz ${voiceName} do Voice Studio no Deskcomm CRM.`;
    const estimatedDuration = Math.max(3, Math.round(phraseToSpeak.length / 15 / (speed || 1)));
    setAudioDuration(estimatedDuration);
    setAudioCurrentTime(0);
    setIsPlayingAudio(true);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(phraseToSpeak);
      utterance.rate = speed || 1.0;
      utterance.lang = "pt-BR";
      const activeVoiceObj = PRE_CONFIGURED_VOICES.find((v) => v.id === voiceId);
      if (activeVoiceObj) {
        utterance.pitch = activeVoiceObj.pitch;
      }

      utterance.onend = () => {
        stopAudio();
      };
      utterance.onerror = () => {
        stopAudio();
      };

      window.speechSynthesis.speak(utterance);
    }

    // Intervalo para animar o progresso
    const startTime = Date.now();
    audioIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= estimatedDuration) {
        stopAudio();
        setAudioCurrentTime(0);
      } else {
        setAudioCurrentTime(elapsed);
      }
    }, 100);
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

    const sampleText = `Olá! Eu sou a voz ${v.name}, pré-configurada no Voice Studio.`;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(sampleText);
      utterance.rate = speed || 1.0;
      utterance.pitch = v.pitch;
      utterance.lang = "pt-BR";
      utterance.onend = () => {
        setPlayingVoiceId(null);
      };
      utterance.onerror = () => {
        setPlayingVoiceId(null);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPlayingVoiceId(null), 2500);
    }
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
          <label className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {t("Texto")}
          </label>
          <button
            type="button"
            onClick={() => setShowCustomFields(!showCustomFields)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors cursor-pointer"
          >
            <Eye size={14} className="shrink-0" />
            <span>{t("Campos Personalizados")}</span>
          </button>
        </div>

        {/* Gaveta de Campos Personalizados */}
        {showCustomFields && (
          <div className="p-2.5 rounded-lg border border-blue-200 bg-blue-50/70 dark:border-blue-900/60 dark:bg-blue-950/30 space-y-1.5 animate-in fade-in slide-in-from-top-1">
            <span className="text-[11px] font-medium text-blue-900 dark:text-blue-300 block">
              {t("Clique para inserir uma variável no áudio:")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_FIELDS.map((cf) => (
                <button
                  key={cf.id}
                  type="button"
                  onClick={() => insertVariable(cf.id)}
                  className="px-2 py-1 rounded bg-white hover:bg-blue-100/80 text-blue-800 border border-blue-200 dark:bg-zinc-900 dark:text-blue-300 dark:border-blue-800 text-[11px] font-mono shadow-2xs transition-colors cursor-pointer"
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
          className="w-full rounded-lg border border-neutral-300 bg-white p-3 text-xs text-neutral-900 placeholder-neutral-400 focus:border-purple-600 focus:outline-hidden focus:ring-1 focus:ring-purple-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-neutral-100 dark:placeholder-zinc-500 resize-y"
        />
      </div>

      {/* 2. Divisor de Seção: Configurações de voz */}
      <div className="relative flex items-center justify-center py-1">
        <div className="grow border-t border-neutral-200 dark:border-zinc-800" />
        <div className="mx-3 flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400 font-normal">
          <span>{t("Configurações de voz")}</span>
          <span title={t("Ajuste a estabilidade, similaridade, estilo e velocidade da voz")} className="cursor-help">
            <Info size={14} className="text-blue-500" />
          </span>
        </div>
        <div className="grow border-t border-neutral-200 dark:border-zinc-800" />
      </div>

      {/* 3. Os 4 Sliders */}
      <div className="space-y-3.5">
        {/* Estabilidade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-neutral-700 dark:text-neutral-300 shrink-0">
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
            className="grow h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#a855f7] dark:bg-zinc-700"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-mono">
            {formatSliderValue(stability)}
          </div>
        </div>

        {/* Similaridade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-neutral-700 dark:text-neutral-300 shrink-0">
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
            className="grow h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#a855f7] dark:bg-zinc-700"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-mono">
            {formatSliderValue(similarity)}
          </div>
        </div>

        {/* Sotaque */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-neutral-700 dark:text-neutral-300 shrink-0">
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
            className="grow h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#a855f7] dark:bg-zinc-700"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-mono">
            {formatSliderValue(style)}
          </div>
        </div>

        {/* Velocidade */}
        <div className="flex items-center justify-between gap-3">
          <span className="w-24 text-xs font-normal text-neutral-700 dark:text-neutral-300 shrink-0">
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
            className="grow h-1.5 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[#a855f7] dark:bg-zinc-700"
          />
          <div className="w-14 shrink-0 text-center py-0.5 px-2 rounded border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-mono">
            {formatSliderValue(speed)}x
          </div>
        </div>
      </div>

      {/* Aviso em vermelho de tokens */}
      <div className="text-center pt-1 text-[11px] text-red-600 dark:text-red-400">
        <span>{t("Testar esse áudio irá consumir ")}</span>
        <strong className="font-semibold text-red-700 dark:text-red-300">{t("0 tokens.")}</strong>
      </div>

      {/* 4. Player de Teste de Áudio no estilo exato do screenshot */}
      <div className="flex items-center gap-2 p-1.5 rounded-lg border border-neutral-200 bg-neutral-50/80 dark:border-zinc-800 dark:bg-zinc-900/60">
        <button
          type="button"
          onClick={handleTestAudio}
          className="flex flex-col items-center justify-center w-14 h-12 rounded-md bg-neutral-200/70 hover:bg-neutral-300/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-neutral-700 dark:text-neutral-200 transition-colors shrink-0 cursor-pointer"
        >
          <ArrowsClockwise size={16} className={isPlayingAudio ? "animate-spin text-purple-600" : ""} />
          <span className="text-[10px] font-medium pt-0.5">{t("Testar")}</span>
        </button>

        <div className="grow flex items-center gap-2 bg-neutral-200/50 dark:bg-zinc-800/60 rounded-full px-3 py-1.5 text-neutral-600 dark:text-neutral-300">
          <button
            type="button"
            onClick={handleTestAudio}
            className="hover:text-purple-600 transition-colors cursor-pointer"
          >
            {isPlayingAudio ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>

          <span className="text-[11px] font-mono select-none">
            {formatSeconds(audioCurrentTime)} / {formatSeconds(audioDuration)}
          </span>

          {/* Barra de progresso */}
          <div className="grow h-1 bg-neutral-300 dark:bg-zinc-700 rounded-full overflow-hidden mx-1">
            <div
              className="h-full bg-neutral-500 dark:bg-zinc-400 transition-all duration-100"
              style={{
                width: audioDuration > 0 ? `${(audioCurrentTime / audioDuration) * 100}%` : "0%",
              }}
            />
          </div>

          <SpeakerHigh size={14} className="shrink-0 text-neutral-500" />
          <DotsThree size={16} weight="bold" className="shrink-0 text-neutral-500" />
        </div>
      </div>

      {/* 5. Toggle Switch: Enviar como áudio gravado? */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
          {t("Enviar como áudio gravado?")}
        </span>
        <label className="relative inline-flex items-center cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendAsVoiceNote}
            onChange={(e) => {
              const val = e.target.checked;
              setSendAsVoiceNote(val);
              update({ send_as_voice_note: val });
            }}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#9333ea] dark:bg-zinc-700" />
        </label>
      </div>

      {/* 6. Divisor de Seção: Modelo de áudio */}
      <div className="relative flex items-center justify-center py-1">
        <div className="grow border-t border-neutral-200 dark:border-zinc-800" />
        <span className="mx-3 text-xs text-neutral-500 dark:text-neutral-400 font-normal">
          {t("Modelo de áudio")}
        </span>
        <div className="grow border-t border-neutral-200 dark:border-zinc-800" />
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
                  ? "border-[#9333ea] bg-purple-50/50 dark:border-purple-600 dark:bg-purple-950/30 shadow-xs"
                  : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              }`}
            >
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1">
                  <h4 className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                    {v.name}
                  </h4>
                  {isSelected && (
                    <Check size={12} weight="bold" className="text-purple-600 shrink-0" />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
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
                    ? "border-purple-600 bg-purple-600 text-white animate-pulse"
                    : "border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-neutral-300"
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
