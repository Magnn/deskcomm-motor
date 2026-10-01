"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  MicOff,
  Play,
  Pause,
  UploadCloud,
  X,
  Volume2,
  Sparkles,
  Info,
  CheckCircle2,
  Trash2,
  ChevronRight,
  Headphones,
  RotateCw,
  Sliders,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TEXTO_DO_CONSENTIMENTO } from "@/lib/voz/consentimento";
import type { GeneroDaVoz, VozDisponivel } from "@/lib/voz/tipos";

interface ProvedorNaResposta {
  id: string;
  rotulo: string;
  configurado: boolean;
  erro?: string;
}

interface RespostaDeVozes {
  data: {
    provedores: ProvedorNaResposta[];
    vozes: VozDisponivel[];
  };
}

// Modelos pré-aprovados padrão do ElevenLabs com avatares e iniciais (Fidelidade ao AcassIA)
const VOZES_PRE_CONFIGURADAS: Array<{
  id: string;
  nome: string;
  genero: GeneroDaVoz;
  categoria: "pronta";
  iniciais: string;
}> = [
  { id: "21m00Tcm4TlvDq8ikWAM", nome: "Julieta", genero: "feminina", categoria: "pronta", iniciais: "J" },
  { id: "29vD33N1CtxCmqQRPOHJ", nome: "Marcos Vinicius", genero: "masculina", categoria: "pronta", iniciais: "MV" },
  { id: "EXAVITQu4vr4xnSDxMaL", nome: "Carla", genero: "feminina", categoria: "pronta", iniciais: "C" },
  { id: "5Q0t7uMcjvnagumLfvZi", nome: "João Pedro", genero: "masculina", categoria: "pronta", iniciais: "JP" },
  { id: "MF3mGyEYCl7XYWbV9V6O", nome: "Maria Eduarda", genero: "feminina", categoria: "pronta", iniciais: "ME" },
  { id: "2EiwWnXFnvU5JabPnv8n", nome: "Otavio Luiz", genero: "masculina", categoria: "pronta", iniciais: "OL" },
  { id: "AZnzlk1XvdvUeBnXmlld", nome: "Bia", genero: "feminina", categoria: "pronta", iniciais: "B" },
  { id: "ErXwobaYiN019PkySvjV", nome: "Samuel", genero: "masculina", categoria: "pronta", iniciais: "S" },
];

export default function VoiceStudioPage() {
  const t = useT();
  const qc = useQueryClient();

  // Estados do Sintetizador
  const [selectedVoice, setSelectedVoice] = React.useState<{
    id: string;
    nome: string;
    genero?: string;
    categoria: "pronta" | "clonada";
    iniciais?: string;
    provedor?: "elevenlabs" | "openai";
  } | null>(null);

  const [texto, setTexto] = React.useState("");
  const [estabilidade, setEstabilidade] = React.useState(0.5);
  const [similaridade, setSimilaridade] = React.useState(0.7);
  const [sotaque, setSotaque] = React.useState(0.5);
  const [velocidade, setVelocidade] = React.useState(1.0);

  // Filtro de biblioteca de vozes: "todas" | "clonadas" | "pre"
  const [filtroBiblioteca, setFiltroBiblioteca] = React.useState<"todas" | "clonadas" | "pre">("todas");

  // Áudio gerado
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [gerando, setGerando] = React.useState(false);

  // Modal de Adicionar Nova Voz
  const [modalNovaVozOpen, setModalNovaVozOpen] = React.useState(false);

  // Consulta de vozes reais do provedor / ElevenLabs
  const vozesQuery = useQuery({
    queryKey: ["ai", "voices"],
    queryFn: async () => (await apiClient.get<RespostaDeVozes>("/api/v1/ai/voices")).data,
    staleTime: 30_000,
  });

  const vozesBackend = vozesQuery.data?.vozes ?? [];
  const vozesClonadas = vozesBackend.filter((v) => v.categoria === "clonada");

  // Lista unificada para a biblioteca
  const todasVozes = React.useMemo(() => {
    const clonadas = vozesClonadas.map((v) => ({
      id: v.id,
      nome: v.nome,
      genero: v.genero,
      categoria: "clonada" as const,
      provedor: v.provedor,
      iniciais: v.nome
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join(""),
    }));

    // Se a api retornar vozes prontas, usamos; senão, usamos os presets locais do ElevenLabs
    const prontasDaApi = vozesBackend
      .filter((v) => v.categoria === "pronta")
      .map((v) => ({
        id: v.id,
        nome: v.nome,
        genero: v.genero,
        categoria: "pronta" as const,
        provedor: v.provedor,
        iniciais: v.nome
          .split(" ")
          .slice(0, 2)
          .map((p) => p[0]?.toUpperCase() ?? "")
          .join(""),
      }));

    const prontas = prontasDaApi.length > 0
      ? prontasDaApi
      : VOZES_PRE_CONFIGURADAS.map((p) => ({ ...p, provedor: "elevenlabs" as const }));
    return [...clonadas, ...prontas];
  }, [vozesBackend, vozesClonadas]);

  // Vozes filtradas pelas pílulas
  const vozesExibidas = React.useMemo(() => {
    if (filtroBiblioteca === "clonadas") {
      return todasVozes.filter((v) => v.categoria === "clonada");
    }
    if (filtroBiblioteca === "pre") {
      return todasVozes.filter((v) => v.categoria === "pronta");
    }
    return todasVozes;
  }, [todasVozes, filtroBiblioteca]);

  // Gerar Áudio (Sintetizar)
  const handleGerarAudio = async () => {
    if (!selectedVoice) {
      toast.error(t("Selecione uma voz na biblioteca ao lado."));
      return;
    }
    if (!texto.trim()) {
      toast.error(t("Escreva um texto para sintetizar."));
      return;
    }

    setGerando(true);
    try {
      const res = await fetch("/api/v1/ai/voices/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedVoice.provedor ?? "elevenlabs",
          voice_id: selectedVoice.id,
          text: texto.trim(),
          stability: estabilidade,
          similarity_boost: similaridade,
          style: sotaque,
          speed: velocidade,
        }),
      });

      if (!res.ok) {
        let msg = "";
        try {
          msg = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? "";
        } catch {
          // ignore
        }
        throw new Error(msg || t("Não foi possível sintetizar a voz agora."));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      toast.success(t("Áudio gerado com sucesso!"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("Erro ao gerar áudio."));
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto pb-12 font-sans">
      {/* Cabeçalho Voice Studio */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-purple-100 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Headphones size={20} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 tracking-tight">
              {t("Voice Studio")}
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 mt-1.5">
            <Info size={13} className="text-slate-400" />
            {t("Gerenciar as vozes disponíveis, assim como personalizar vozes de acordo com suas preferências.")}
          </p>
        </div>

        {/* Botão + Nova Voz (Design AcassIA) */}
        <button
          type="button"
          onClick={() => setModalNovaVozOpen(true)}
          className="h-10 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white font-semibold text-xs transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer self-start md:self-auto"
        >
          <span>+ {t("Nova voz")}</span>
        </button>
      </div>

      {/* Grid Principal: 70% Esquerda (Sintetizador) / 30% Direita (Biblioteca) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: SINTETIZADOR DE VOZ */}
        <div className="lg:col-span-8 space-y-5">
          {/* Card: VOZ SELECIONADA */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t("VOZ SELECIONADA")}
            </label>
            <div className="h-16 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 flex items-center justify-between shadow-2xs">
              {selectedVoice ? (
                <div className="flex items-center gap-3.5">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-300 font-bold text-sm flex items-center justify-center">
                    {selectedVoice.iniciais || selectedVoice.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-zinc-100 flex items-center gap-2">
                      <span>{selectedVoice.nome}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/40">
                        {selectedVoice.categoria === "clonada" ? t("Clonada") : t("Pré-configurada")}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {selectedVoice.categoria === "clonada"
                        ? t("Voz clonada personalizada")
                        : t("Modelo pronto ElevenLabs")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center">
                    <Mic size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      {t("Nenhuma voz selecionada")}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {t("Escolha uma voz na biblioteca ao lado")}
                    </p>
                  </div>
                </div>
              )}

              {selectedVoice && (
                <button
                  type="button"
                  onClick={() => setSelectedVoice(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {t("Trocar")}
                </button>
              )}
            </div>
          </div>

          {/* Card: TEXTO */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
              {t("TEXTO")}
            </label>
            <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3 shadow-2xs">
              <textarea
                rows={7}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={t("Escreva o que a voz vai falar...")}
                className="w-full text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 bg-transparent resize-none focus:outline-hidden"
              />

              {/* Rodapé do Textarea: Custo em Tokens e Botão de Gravar Áudio */}
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <p>
                    {t("Essa geração de áudio irá custar:")}{" "}
                    <span className="font-semibold text-slate-700 dark:text-zinc-200">
                      {texto.length} tokens
                    </span>
                  </p>
                  <p>
                    {t("Total de tokens disponíveis:")}{" "}
                    <span className="font-semibold text-slate-700 dark:text-zinc-200">1.000</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toast.info(t("Fale no microfone para transcrever ou digite acima."))}
                  className="h-8 px-3 rounded-lg border border-purple-200 dark:border-purple-800/50 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-300 font-semibold text-xs flex items-center gap-1.5 hover:bg-purple-100/50 transition-colors cursor-pointer self-start sm:self-auto"
                >
                  <Mic size={14} />
                  <span>{t("Gravar áudio")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Ajustes Avançados */}
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-zinc-200">
              <Sliders size={15} className="text-purple-600 dark:text-purple-400" />
              <span>{t("Ajustes avançados")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-1">
              {/* Estabilidade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-zinc-400 w-24 shrink-0 font-medium">
                  {t("Estabilidade")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={estabilidade}
                  onChange={(e) => setEstabilidade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="h-6 w-10 shrink-0 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-mono font-bold flex items-center justify-center border border-purple-100 dark:border-purple-900/40">
                  {estabilidade.toFixed(1)}
                </span>
              </div>

              {/* Similaridade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-zinc-400 w-24 shrink-0 font-medium">
                  {t("Similaridade")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={similaridade}
                  onChange={(e) => setSimilaridade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="h-6 w-10 shrink-0 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-mono font-bold flex items-center justify-center border border-purple-100 dark:border-purple-900/40">
                  {similaridade.toFixed(1)}
                </span>
              </div>

              {/* Sotaque */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-zinc-400 w-24 shrink-0 font-medium">
                  {t("Sotaque")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sotaque}
                  onChange={(e) => setSotaque(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="h-6 w-10 shrink-0 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-mono font-bold flex items-center justify-center border border-purple-100 dark:border-purple-900/40">
                  {sotaque.toFixed(1)}
                </span>
              </div>

              {/* Velocidade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-slate-600 dark:text-zinc-400 w-24 shrink-0 font-medium">
                  {t("Velocidade")}
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={velocidade}
                  onChange={(e) => setVelocidade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-slate-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
                <span className="h-6 w-10 shrink-0 rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 text-xs font-mono font-bold flex items-center justify-center border border-purple-100 dark:border-purple-900/40">
                  {velocidade.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Botão de Ação: Gerar Áudio */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={gerando || !texto.trim() || !selectedVoice}
              onClick={handleGerarAudio}
              className="w-full h-11 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {gerando ? (
                <>
                  <RotateCw size={15} className="animate-spin" />
                  <span>{t("Sintetizando áudio...")}</span>
                </>
              ) : (
                <span>{t("Gerar áudio")}</span>
              )}
            </button>

            {/* Player de Áudio Gerado */}
            {audioUrl && (
              <div className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-4 space-y-2 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-purple-900 dark:text-purple-200">
                  <span className="flex items-center gap-1.5">
                    <Volume2 size={15} />
                    {t("Resultado da síntese")}
                  </span>
                  <a
                    href={audioUrl}
                    download="audio-sintetizado.mp3"
                    className="text-[11px] underline hover:text-purple-600"
                  >
                    {t("Baixar áudio")}
                  </a>
                </div>
                <audio src={audioUrl} controls autoPlay className="w-full h-9" />
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: BIBLIOTECA DE VOZES */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-2xs">
          <h2 className="text-xs font-bold text-slate-800 dark:text-zinc-200">
            {t("Biblioteca de vozes")}
          </h2>

          {/* Filtros em Pílulas: Todas | Clonadas | Pré-configuradas */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-zinc-800/60">
            <button
              type="button"
              onClick={() => setFiltroBiblioteca("todas")}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center",
                filtroBiblioteca === "todas"
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
              )}
            >
              {t("Todas")}
            </button>
            <button
              type="button"
              onClick={() => setFiltroBiblioteca("clonadas")}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center",
                filtroBiblioteca === "clonadas"
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
              )}
            >
              {t("Clonadas")}
            </button>
            <button
              type="button"
              onClick={() => setFiltroBiblioteca("pre")}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center",
                filtroBiblioteca === "pre"
                  ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"
              )}
            >
              {t("Pré-configuradas")}
            </button>
          </div>

          {/* Lista de Vozes */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-0.5">
            {vozesExibidas.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 italic">
                {filtroBiblioteca === "clonadas"
                  ? t("Nenhuma voz clonada ainda. Clique em '+ Nova voz' para clonar.")
                  : t("Nenhuma voz encontrada.")}
              </div>
            ) : (
              vozesExibidas.map((v) => {
                const isSelected = selectedVoice?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVoice(v)}
                    className={cn(
                      "p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer shadow-2xs group",
                      isSelected
                        ? "border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 ring-1 ring-purple-500 text-purple-950 dark:text-purple-200"
                        : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0",
                          isSelected
                            ? "bg-purple-600 text-white"
                            : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200"
                        )}
                      >
                        {v.iniciais || v.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-100">
                          {v.nome}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {v.categoria === "clonada" ? t("Clonada") : t("Pré-configurada")}
                        </p>
                      </div>
                    </div>

                    <ChevronRight
                      size={15}
                      className={cn(
                        "transition-transform",
                        isSelected
                          ? "text-purple-600 dark:text-purple-400"
                          : "text-slate-300 dark:text-zinc-600 group-hover:translate-x-0.5"
                      )}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Adicionar nova voz (Fidelidade ao Print 2) */}
      <AdicionarNovaVozModal
        open={modalNovaVozOpen}
        onOpenChange={setModalNovaVozOpen}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["ai", "voices"] });
        }}
      />
    </div>
  );
}

// ── MODAL: ADICIONAR NOVA VOZ (Print 2 AcassIA) ──────────────────────────

function AdicionarNovaVozModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [nome, setNome] = React.useState("");
  const [genero, setGenero] = React.useState<GeneroDaVoz>("neutra");
  const [removerRuido, setRemoverRuido] = React.useState(true);
  const [consentimento, setConsentimento] = React.useState(false);

  // Amostras de arquivos
  const [arquivos, setArquivos] = React.useState<File[]>([]);

  // Gravação por microfone
  const [gravando, setGravando] = React.useState(false);
  const [segundosGravados, setSegundosGravados] = React.useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<number | null>(null);

  const [salvando, setSalvando] = React.useState(false);

  // Iniciar Gravação
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
      const mr = preferredMime ? new MediaRecorder(stream, { mimeType: preferredMime }) : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const mime = preferredMime || mr.mimeType || "audio/webm";
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const file = new File([blob], `gravacao-${Date.now()}.${ext}`, { type: mime });
        setArquivos((prev) => [...prev, file].slice(0, 5));
        stream.getTracks().forEach((track) => track.stop());
      };
      mr.start(250);
      mediaRecorderRef.current = mr;
      setGravando(true);
      setSegundosGravados(0);
      timerRef.current = window.setInterval(() => {
        setSegundosGravados((s) => s + 1);
      }, 1000);
    } catch {
      toast.error(t("Não foi possível acessar o microfone."));
    }
  };

  // Parar Gravação
  const stopRecording = () => {
    if (mediaRecorderRef.current && gravando) {
      mediaRecorderRef.current.stop();
      setGravando(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Upload de arquivos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const novos = Array.from(e.target.files);
      setArquivos((prev) => [...prev, ...novos].slice(0, 5));
    }
  };

  const handleRemoverArquivo = (index: number) => {
    setArquivos((prev) => prev.filter((_, i) => i !== index));
  };

  // Submeter Clonagem
  const handleCriarVoz = async () => {
    if (!nome.trim()) {
      toast.error(t("Informe o nome da voz."));
      return;
    }
    if (arquivos.length === 0) {
      toast.error(t("Envie ao menos uma amostra de áudio ou grave pelo microfone."));
      return;
    }
    if (!consentimento) {
      toast.error(t("Confirme o termo de direitos e consentimento."));
      return;
    }

    setSalvando(true);
    try {
      const fd = new FormData();
      fd.append("name", nome.trim());
      fd.append("gender", genero);
      fd.append("consent", "true");
      for (const a of arquivos) {
        fd.append("samples", a, a.name);
      }

      const res = await fetch("/api/v1/ai/voices/clone", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        let msg = "";
        try {
          msg = ((await res.json()) as { error?: { message?: string } })?.error?.message ?? "";
        } catch {
          // ignore
        }
        throw new Error(msg || t("Erro ao clonar voz."));
      }

      toast.success(t("Voz clonada com sucesso!"));
      onSuccess();
      onOpenChange(false);
      // Reset form
      setNome("");
      setArquivos([]);
      setConsentimento(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("Falha na clonagem de voz."));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden border border-slate-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-950 shadow-2xl">
        {/* Header Roxo AcassIA */}
        <div className="bg-purple-600 px-6 py-4 flex items-center justify-between text-white">
          <DialogTitle className="text-base font-bold text-white tracking-tight">
            {t("Adicionar nova voz")}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-5 text-xs">
          <p className="text-slate-500 dark:text-zinc-400 text-[11.5px] leading-relaxed">
            {t("Envie amostras de áudio para clonar uma voz. Quanto mais limpo o áudio, melhor o resultado.")}
          </p>

          {/* Nome da voz */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800 dark:text-zinc-200">
              {t("Nome da voz")}
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Atendente Comercial"
              className="w-full h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5 text-xs text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-500 transition-colors shadow-2xs"
            />
          </div>

          {/* Gênero da voz */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800 dark:text-zinc-200">
              {t("Gênero da voz")}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "feminina", label: "Feminina" },
                  { id: "masculina", label: "Masculina" },
                  { id: "neutra", label: "Neutra" },
                ] as const
              ).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGenero(g.id)}
                  className={cn(
                    "h-9 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5",
                    genero === g.id
                      ? "border-purple-600 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 shadow-2xs"
                      : "border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-zinc-850"
                  )}
                >
                  {genero === g.id && <Check size={13} className="text-purple-600 dark:text-purple-400" />}
                  <span>{t(g.label)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amostras de Áudio */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-800 dark:text-zinc-200">
              {t("Amostras de áudio")}
            </label>

            <div className="grid grid-cols-2 gap-3 items-center relative">
              {/* Box Upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-32 rounded-2xl border-2 border-dashed border-purple-200 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-950/20 hover:bg-purple-50/70 p-3 flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer"
              >
                <UploadCloud size={24} className="text-purple-600 dark:text-purple-400" />
                <span className="font-bold text-[11.5px] text-slate-800 dark:text-zinc-200">
                  {t("Arraste arquivos ou clique para enviar")}
                </span>
                <span className="text-[9.5px] text-slate-400 leading-tight">
                  {t("MP3, WAV, OGG ou OPUS · máx. 10MB por arquivo · até 5 arquivos")}
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  multiple
                  accept="audio/mp3,audio/wav,audio/ogg,audio/opus,audio/mpeg,audio/m4a"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </button>

              {/* Divisor "ou" */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-white dark:bg-zinc-950 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest rounded-full border border-slate-200 dark:border-zinc-800">
                {t("ou")}
              </div>

              {/* Box Gravar Áudio */}
              <div className="h-32 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-700 p-3 flex flex-col items-center justify-center text-center gap-1.5 transition-all relative">
                {gravando ? (
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <div className="h-8 w-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center animate-pulse">
                      <Mic size={16} />
                    </div>
                    <span className="font-mono text-xs font-bold text-red-600">
                      {Math.floor(segundosGravados / 60)}:
                      {String(segundosGravados % 60).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="text-[10px] uppercase font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      {t("Parar Gravação")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="w-full h-full flex flex-col items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Mic size={24} className="text-slate-400" />
                    <span className="font-bold text-[11.5px] text-slate-800 dark:text-zinc-200">
                      {t("Clique para gravar áudio")}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {t("Pressione para iniciar")}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Lista de Arquivos Anexados */}
            {arquivos.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500">
                  {t("Amostras selecionadas:")} ({arquivos.length}/5)
                </span>
                <div className="space-y-1">
                  {arquivos.map((arq, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px]"
                    >
                      <span className="truncate max-w-[320px] font-medium text-slate-700 dark:text-zinc-200">
                        {arq.name} ({(arq.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverArquivo(idx)}
                        className="text-red-500 hover:text-red-700 cursor-pointer p-0.5"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Checkboxes de Ruído e Consentimento */}
          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-850 transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={removerRuido}
                onChange={(e) => setRemoverRuido(e.target.checked)}
                className="mt-0.5 accent-purple-600 rounded-md"
              />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold text-slate-800 dark:text-zinc-200 block">
                  {t("Remover ruído de fundo das amostras de voz")}
                </span>
                <span className="text-slate-400">
                  {t("Recomendado somente para áudios com ruído ambiente.")}
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 cursor-pointer hover:bg-slate-50 dark:hover:bg-zinc-850 transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={consentimento}
                onChange={(e) => setConsentimento(e.target.checked)}
                className="mt-0.5 accent-purple-600 rounded-md shrink-0"
              />
              <span className="text-[10.5px] leading-relaxed text-slate-600 dark:text-zinc-400 font-medium">
                {t(
                  "Eu confirmo possuir todos os direitos ou consentimentos necessários para carregar e clonar amostras de voz. Reafirmo meu compromisso em cumprir os Termos de Serviço e a Política de Privacidade."
                )}
              </span>
            </label>
          </div>

          {/* Botões do Rodapé: Cancelar e Criar Voz */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer shadow-2xs"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              disabled={salvando || !nome.trim() || arquivos.length === 0 || !consentimento}
              onClick={handleCriarVoz}
              className="h-10 rounded-xl bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {salvando ? (
                <>
                  <RotateCw size={14} className="animate-spin" />
                  <span>{t("Criando voz...")}</span>
                </>
              ) : (
                <span>{t("Criar voz")}</span>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
