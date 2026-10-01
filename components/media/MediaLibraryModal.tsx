"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MagnifyingGlass, ImageIcon, SpeakerHigh, VideoCamera, FileText, Check, Plus } from "@/lib/ui/icons";
import { formatMediaSize, filterMediaLibrary, type MediaItem, type MediaItemType } from "@/lib/media/library";

const MOCK_MEDIA_ITEMS: MediaItem[] = [
  {
    id: "med-01",
    name: "catalogo-produtos-2026.pdf",
    type: "document",
    url: "https://assets.deskcomm.com/docs/catalogo-produtos-2026.pdf",
    mimeType: "application/pdf",
    sizeBytes: 2450000,
    tags: ["catalogo", "vendas"],
    folder: "vendas",
    createdAt: new Date().toISOString(),
  },
  {
    id: "med-02",
    name: "audio-apresentacao-institucional.ogg",
    type: "audio",
    url: "https://assets.deskcomm.com/audio/apresentacao.ogg",
    mimeType: "audio/ogg",
    sizeBytes: 680000,
    durationSeconds: 45,
    tags: ["audio", "boas-vindas"],
    folder: "onboarding",
    createdAt: new Date().toISOString(),
  },
  {
    id: "med-03",
    name: "banner-promocao-black-friday.jpg",
    type: "image",
    url: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=60",
    mimeType: "image/jpeg",
    sizeBytes: 420000,
    tags: ["promo", "blackfriday"],
    folder: "vendas",
    createdAt: new Date().toISOString(),
  },
  {
    id: "med-04",
    name: "video-demonstracao-plataforma.mp4",
    type: "video",
    url: "https://assets.deskcomm.com/videos/demo.mp4",
    mimeType: "video/mp4",
    sizeBytes: 15400000,
    durationSeconds: 120,
    tags: ["demo", "tutorial"],
    folder: "onboarding",
    createdAt: new Date().toISOString(),
  },
];

interface MediaLibraryModalProps {
  onSelectMedia?: (media: MediaItem) => void;
  trigger?: React.ReactNode;
  allowedTypes?: MediaItemType[];
}

export function MediaLibraryModal({
  onSelectMedia,
  trigger,
  allowedTypes,
}: MediaLibraryModalProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<MediaItemType | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = filterMediaLibrary(MOCK_MEDIA_ITEMS, {
    type: selectedType,
    search,
  }).filter((item) => (allowedTypes ? allowedTypes.includes(item.type) : true));

  const handleConfirm = () => {
    if (!selectedId) return;
    const item = MOCK_MEDIA_ITEMS.find((m) => m.id === selectedId);
    if (item && onSelectMedia) {
      onSelectMedia(item);
    }
    setOpen(false);
  };

  const getMediaIcon = (type: MediaItemType) => {
    switch (type) {
      case "image":
        return <ImageIcon className="h-5 w-5 text-sky-500" />;
      case "audio":
        return <SpeakerHigh className="h-5 w-5 text-emerald-500" />;
      case "video":
        return <VideoCamera className="h-5 w-5 text-purple-500" />;
      case "document":
      default:
        return <FileText className="h-5 w-5 text-amber-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <ImageIcon className="h-4 w-4" />
            Acervo de Mídias
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Acervo Central de Mídias</DialogTitle>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Enviar Nova Mídia
            </Button>
          </div>
          <DialogDescription>
            Selecione imagens, áudios gravados, vídeos e documentos para enriquecer seus fluxos e mensagens.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou tag..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Tabs
              value={selectedType}
              onValueChange={(v) => setSelectedType(v as MediaItemType | "all")}
              className="w-full sm:w-auto"
            >
              <TabsList className="grid grid-cols-5 h-9">
                <TabsTrigger value="all" className="text-xs">Todos</TabsTrigger>
                <TabsTrigger value="image" className="text-xs">Imagens</TabsTrigger>
                <TabsTrigger value="audio" className="text-xs">Áudios</TabsTrigger>
                <TabsTrigger value="video" className="text-xs">Vídeos</TabsTrigger>
                <TabsTrigger value="document" className="text-xs">Docs</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                Nenhum arquivo encontrado com estes filtros.
              </div>
            ) : (
              filtered.map((item) => {
                const isSelected = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`group relative flex flex-col items-center justify-between rounded-xl border p-3 text-left transition-all hover:border-primary/60 hover:shadow-sm ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border bg-card"
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground shadow-sm">
                        <Check className="h-3 w-3" />
                      </span>
                    )}

                    <div className="flex h-16 w-full items-center justify-center rounded-lg bg-muted/40">
                      {item.type === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.name}
                          className="h-full w-full object-cover rounded-lg"
                        />
                      ) : (
                        getMediaIcon(item.type)
                      )}
                    </div>

                    <div className="w-full mt-2.5">
                      <p className="truncate text-xs font-medium text-foreground" title={item.name}>
                        {item.name}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-0.5">
                        <span className="capitalize">{item.type}</span>
                        <span>{formatMediaSize(item.sizeBytes)}</span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!selectedId}
              onClick={handleConfirm}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              Inserir Selecionado
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
