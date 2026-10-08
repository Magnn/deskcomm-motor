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

import { ApagarVozClonada } from "@/components/ai/ApagarVozClonada";

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
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-accent/10 via-accent/15 to-accent/10 border border-accent/30 flex items-center justify-center text-accent shadow-2xs">
              <Headphones size={20} className="stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text tracking-tight flex items-center gap-2">
                <span>{t("Voice Studio")}</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent">
                  AI Audio
                </span>
              </h1>
            </div>
          </div>
          <p className="text-xs text-text-muted flex items-center gap-1.5 mt-2">
            <Info size={13} className="text-accent shrink-0" />
            {t("Gerenciar as vozes disponíveis, assim como personalizar vozes de acordo com suas preferências.")}
          </p>
        </div>

        {/* Botão + Nova Voz (Design AcassIA de Alto Nível) */}
        <button
          type="button"
          onClick={() => setModalNovaVozOpen(true)}
          className="h-10 px-5 rounded-xl bg-gradient-to-r from-accent to-accent-hover hover:from-accent-hover hover:to-accent-hover active:scale-[0.98] text-white font-semibold text-xs transition-all shadow-sm hover:shadow-md hover:shadow-accent/25 flex items-center justify-center gap-2 cursor-pointer self-start md:self-auto"
        >
          <Sparkles size={14} className="text-white" />
          <span>+ {t("Nova voz")}</span>
        </button>
      </div>

      {/* Grid Principal: 70% Esquerda (Sintetizador) / 30% Direita (Biblioteca) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA ESQUERDA: SINTETIZADOR DE VOZ */}
        <div className="lg:col-span-8 space-y-5">
          {/* Card: VOZ SELECIONADA */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-text-subtle uppercase tracking-wider">
              {t("VOZ SELECIONADA")}
            </label>
            <div className="h-17 rounded-2xl border border-border bg-surface px-4 flex items-center justify-between shadow-2xs transition-all">
              {selectedVoice ? (
                <div className="flex items-center gap-3.5">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-accent to-accent-hover text-white font-bold text-sm flex items-center justify-center shadow-xs ring-2 ring-accent/20">
                    {selectedVoice.iniciais || selectedVoice.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text flex items-center gap-2">
                      <span>{selectedVoice.nome}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent">
                        {selectedVoice.categoria === "clonada" ? t("Clonada") : t("Pré-configurada")}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted">
                      {selectedVoice.categoria === "clonada"
                        ? t("Voz clonada personalizada")
                        : t("Modelo pronto ElevenLabs")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-accent-soft text-accent border border-accent flex items-center justify-center">
                    <Mic size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-text">
                      {t("Nenhuma voz selecionada")}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {t("Escolha uma voz na biblioteca ao lado")}
                    </p>
                  </div>
                </div>
              )}

              {selectedVoice && selectedVoice.categoria === "clonada" && selectedVoice.provedor ? (
                <ApagarVozClonada
                  provedor={selectedVoice.provedor}
                  vozId={selectedVoice.id}
                  nome={selectedVoice.nome}
                  aoApagar={() => {
                    setSelectedVoice(null);
                    void qc.invalidateQueries({ queryKey: ["ai", "voices"] });
                  }}
                />
              ) : null}
              {selectedVoice && (
                <button
                  type="button"
                  onClick={() => setSelectedVoice(null)}
                  className="text-xs font-medium text-accent hover:text-accent transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-accent-soft"
                >
                  {t("Trocar")}
                </button>
              )}
            </div>
          </div>

          {/* Card: TEXTO */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-text-subtle uppercase tracking-wider">
              {t("TEXTO")}
            </label>
            <div className="rounded-2xl border border-border bg-surface p-4 space-y-3 shadow-2xs focus-within:border-accent focus-within:ring-2 focus-within:ring-accent transition-all">
              <textarea
                rows={7}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={t("Escreva o que a voz vai falar...")}
                className="w-full text-xs text-text placeholder:text-text-subtle bg-transparent resize-none focus:outline-hidden leading-relaxed"
              />

              {/* Rodapé do Textarea: Custo em Tokens e Botão de Gravar Áudio */}
              <div className="pt-2.5 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-text-subtle flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-md bg-surface-elevated border border-border">
                    {t("Essa geração de áudio irá custar:")}{" "}
                    <strong className="text-text font-semibold">
                      {texto.length} tokens
                    </strong>
                  </span>
                  <span>
                    {t("Total de tokens disponíveis:")}{" "}
                    <strong className="text-text-muted font-semibold">1.000</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => toast.info(t("Fale no microfone para transcrever ou digite acima."))}
                  className="h-8 px-3.5 rounded-xl border border-accent bg-accent-soft text-accent font-semibold text-xs flex items-center gap-1.5 hover:bg-accent-soft active:scale-[0.98] transition-all cursor-pointer self-start sm:self-auto shadow-2xs"
                >
                  <Mic size={14} className="text-accent" />
                  <span>{t("Gravar áudio")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card: Ajustes Avançados */}
          <div className="rounded-2xl border border-border bg-surface p-4.5 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2 text-xs font-bold text-text">
              <Sliders size={15} className="text-accent" />
              <span>{t("Ajustes avançados")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-1">
              {/* Estabilidade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted w-24 shrink-0 font-medium">
                  {t("Estabilidade")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={estabilidade}
                  onChange={(e) => setEstabilidade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="h-6 w-10 shrink-0 rounded-lg bg-accent-soft text-accent text-xs font-mono font-bold flex items-center justify-center border border-accent">
                  {estabilidade.toFixed(1)}
                </span>
              </div>

              {/* Similaridade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted w-24 shrink-0 font-medium">
                  {t("Similaridade")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={similaridade}
                  onChange={(e) => setSimilaridade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="h-6 w-10 shrink-0 rounded-lg bg-accent-soft text-accent text-xs font-mono font-bold flex items-center justify-center border border-accent">
                  {similaridade.toFixed(1)}
                </span>
              </div>

              {/* Sotaque */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted w-24 shrink-0 font-medium">
                  {t("Sotaque")}
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sotaque}
                  onChange={(e) => setSotaque(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="h-6 w-10 shrink-0 rounded-lg bg-accent-soft text-accent text-xs font-mono font-bold flex items-center justify-center border border-accent">
                  {sotaque.toFixed(1)}
                </span>
              </div>

              {/* Velocidade */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-text-muted w-24 shrink-0 font-medium">
                  {t("Velocidade")}
                </span>
                <input
                  type="range"
                  min={0.7}
                  max={1.2}
                  step={0.05}
                  value={velocidade}
                  onChange={(e) => setVelocidade(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-accent"
                />
                <span className="h-6 w-10 shrink-0 rounded-lg bg-accent-soft text-accent text-xs font-mono font-bold flex items-center justify-center border border-accent">
                  {velocidade.toFixed(1)}
                </span>
              </div>
            </div>
          </div>

          {/* Botão de Ação: Gerar Áudio (Hero Action Button) */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={gerando || !texto.trim() || !selectedVoice}
              onClick={handleGerarAudio}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-accent via-accent-hover to-accent-hover hover:from-accent-hover hover:to-accent-hover active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs transition-all shadow-md shadow-accent/20 hover:shadow-lg hover:shadow-accent/30 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:shadow-none"
            >
              {gerando ? (
                <>
                  <RotateCw size={16} className="animate-spin text-white" />
                  <span>{t("Sintetizando áudio...")}</span>
                </>
              ) : (
                <>
                  <Play size={15} className="fill-white" />
                  <span>{t("Gerar áudio")}</span>
                </>
              )}
            </button>

            {/* Player de Áudio Gerado */}
            {audioUrl && (
              <div className="rounded-2xl border border-accent bg-accent-soft p-4 space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs font-semibold text-text">
                  <span className="flex items-center gap-1.5">
                    <Volume2 size={16} className="text-accent" />
                    {t("Resultado da síntese")}
                  </span>
                  <a
                    href={audioUrl}
                    download="audio-sintetizado.mp3"
                    className="text-[11px] font-semibold text-accent hover:underline"
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
        <div className="lg:col-span-4 rounded-2xl border border-border bg-surface p-4 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-text flex items-center gap-2">
              <span>{t("Biblioteca de vozes")}</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                {vozesExibidas.length}
              </span>
            </h2>
          </div>

          {/* Filtros em Pílulas: Todas | Clonadas | Pré-configuradas (Paleta AcassIA Índigo) */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-elevated border border-border">
            <button
              type="button"
              onClick={() => setFiltroBiblioteca("todas")}
              className={cn(
                "flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all cursor-pointer text-center",
                filtroBiblioteca === "todas"
                  ? "bg-accent text-white shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-white/60"
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
                  ? "bg-accent text-white shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-white/60"
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
                  ? "bg-accent text-white shadow-xs"
                  : "text-text-muted hover:text-text hover:bg-white/60"
              )}
            >
              {t("Pré-configuradas")}
            </button>
          </div>

          {/* Lista de Vozes */}
          <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-surface-elevated dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700">
            {vozesExibidas.length === 0 ? (
              <div className="text-center py-8 text-xs text-text-subtle italic">
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
                        ? "border-accent bg-accent-soft ring-2 ring-accent text-text"
                        : "border-border bg-surface hover:border-accent hover:bg-surface-elevated"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "h-9 w-9 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-colors",
                          isSelected
                            ? "bg-gradient-to-br from-accent to-accent-hover text-white shadow-xs"
                            : "bg-accent-soft text-accent border border-accent"
                        )}
                      >
                        {v.iniciais || v.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-text">
                          {v.nome}
                        </p>
                        <p className="text-[10px] text-text-subtle">
                          {v.categoria === "clonada" ? t("Clonada") : t("Pré-configurada")}
                        </p>
                      </div>
                    </div>

                    <ChevronRight
                      size={15}
                      className={cn(
                        "transition-transform",
                        isSelected
                          ? "text-accent translate-x-0.5"
                          : "text-text-subtle group-hover:translate-x-0.5 group-hover:text-accent"
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
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden border border-border rounded-3xl bg-surface shadow-2xl">
        {/* Header Roxo AcassIA */}
        <div className="bg-accent px-6 py-4 flex items-center justify-between text-white">
          <DialogTitle className="text-base font-bold text-white tracking-tight">
            {t("Adicionar nova voz")}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-white hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="p-6 space-y-5 text-xs">
          <p className="text-text-muted text-[11.5px] leading-relaxed">
            {t("Envie amostras de áudio para clonar uma voz. Quanto mais limpo o áudio, melhor o resultado.")}
          </p>

          {/* Nome da voz */}
          <div className="space-y-1.5">
            <label className="block font-bold text-text">
              {t("Nome da voz")}
            </label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Atendente Comercial"
              className="w-full h-10 rounded-xl border border-border bg-surface px-3.5 text-xs text-text placeholder:text-text-subtle focus:outline-hidden focus:border-accent transition-colors shadow-2xs"
            />
          </div>

          {/* Gênero da voz */}
          <div className="space-y-1.5">
            <label className="block font-bold text-text">
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
                      ? "border-accent bg-accent-soft text-accent shadow-2xs"
                      : "border-border bg-surface text-text-muted hover:bg-surface-elevated"
                  )}
                >
                  {genero === g.id && <Check size={13} className="text-accent" />}
                  <span>{t(g.label)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Amostras de Áudio */}
          <div className="space-y-1.5">
            <label className="block font-bold text-text">
              {t("Amostras de áudio")}
            </label>

            <div className="grid grid-cols-2 gap-3 items-center relative">
              {/* Box Upload */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-32 rounded-2xl border-2 border-dashed border-accent bg-accent-soft hover:bg-accent-soft p-3 flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer"
              >
                <UploadCloud size={24} className="text-accent" />
                <span className="font-bold text-[11.5px] text-text">
                  {t("Arraste arquivos ou clique para enviar")}
                </span>
                <span className="text-[9.5px] text-text-subtle leading-tight">
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
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-surface px-1.5 py-0.5 text-[10px] font-bold text-text-subtle uppercase tracking-widest rounded-full border border-border">
                {t("ou")}
              </div>

              {/* Box Gravar Áudio */}
              <div className="h-32 rounded-2xl border-2 border-dashed border-border bg-surface hover:border-border p-3 flex flex-col items-center justify-center text-center gap-1.5 transition-all relative">
                {gravando ? (
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <div className="h-8 w-8 rounded-full bg-error-bg text-error flex items-center justify-center animate-pulse">
                      <Mic size={16} />
                    </div>
                    <span className="font-mono text-xs font-bold text-error">
                      {Math.floor(segundosGravados / 60)}:
                      {String(segundosGravados % 60).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="text-[10px] uppercase font-bold text-error hover:underline cursor-pointer"
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
                    <Mic size={24} className="text-text-subtle" />
                    <span className="font-bold text-[11.5px] text-text">
                      {t("Clique para gravar áudio")}
                    </span>
                    <span className="text-[10px] text-text-subtle">
                      {t("Pressione para iniciar")}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Lista de Arquivos Anexados */}
            {arquivos.length > 0 && (
              <div className="pt-2 space-y-1.5">
                <span className="text-[11px] font-semibold text-text-muted">
                  {t("Amostras selecionadas:")} ({arquivos.length}/5)
                </span>
                <div className="space-y-1">
                  {arquivos.map((arq, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-elevated border border-border text-[11px]"
                    >
                      <span className="truncate max-w-[320px] font-medium text-text-muted">
                        {arq.name} ({(arq.size / 1024 / 1024).toFixed(2)} MB)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoverArquivo(idx)}
                        className="text-error hover:text-error cursor-pointer p-0.5"
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
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-surface cursor-pointer hover:bg-surface-elevated transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={removerRuido}
                onChange={(e) => setRemoverRuido(e.target.checked)}
                className="mt-0.5 accent-accent rounded-md"
              />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold text-text block">
                  {t("Remover ruído de fundo das amostras de voz")}
                </span>
                <span className="text-text-subtle">
                  {t("Recomendado somente para áudios com ruído ambiente.")}
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-border bg-surface cursor-pointer hover:bg-surface-elevated transition-colors shadow-2xs">
              <input
                type="checkbox"
                checked={consentimento}
                onChange={(e) => setConsentimento(e.target.checked)}
                className="mt-0.5 accent-accent rounded-md shrink-0"
              />
              <span className="text-[10.5px] leading-relaxed text-text-muted font-medium">
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
              className="h-10 rounded-xl border border-border bg-surface text-text-muted font-bold text-xs hover:bg-surface-elevated transition-colors cursor-pointer shadow-2xs"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              disabled={salvando || !nome.trim() || arquivos.length === 0 || !consentimento}
              onClick={handleCriarVoz}
              className="h-10 rounded-xl bg-accent hover:bg-accent active:bg-accent-hover disabled:opacity-50 text-white font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
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
