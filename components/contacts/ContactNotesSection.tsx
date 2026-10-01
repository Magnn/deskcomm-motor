"use client";

import { useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import { randomId } from "@/lib/random-id";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Note as NoteIcon, Trash, Plus, PencilSimple, UserCircle } from "@/lib/ui/icons";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import type { Contact } from "@/lib/types/contacts";

export interface ContactNoteItem {
  id: string;
  body: string;
  author_id: string;
  author_name: string;
  created_at: string;
}

interface Props {
  contact: Contact;
  canEdit?: boolean;
}

export function ContactNotesSection({ contact, canEdit = true }: Props) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const { user } = useAuth();
  const update = useUpdateContact(contact.id);

  const [novaNota, setNovaNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Lê notas salvas em custom_fields._notes
  const customFields = (contact.custom_fields ?? {}) as Record<string, unknown>;
  const notasRaw = customFields._notes;
  const notas: ContactNoteItem[] = Array.isArray(notasRaw) ? (notasRaw as ContactNoteItem[]) : [];

  async function handleAddNote() {
    const texto = novaNota.trim();
    if (!texto) return;

    setSalvando(true);
    const item: ContactNoteItem = {
      id: randomId(),
      body: texto,
      author_id: user?.id ?? "unknown",
      author_name: user?.full_name || user?.email || t("Atendente"),
      created_at: new Date().toISOString(),
    };

    const nextNotas = [item, ...notas];
    const nextCustomFields = {
      ...customFields,
      _notes: nextNotas,
    };

    try {
      await update.mutateAsync({
        custom_fields: nextCustomFields,
      });
      setNovaNota("");
      toast.success(t("Nota interna adicionada."));
    } catch {
      toast.error(t("Erro ao salvar nota interna."));
    } finally {
      setSalvando(false);
    }
  }

  async function handleDeleteNote(id: string) {
    if (!confirm(t("Tem certeza que deseja excluir esta nota?"))) return;

    const nextNotas = notas.filter((n) => n.id !== id);
    const nextCustomFields = {
      ...customFields,
      _notes: nextNotas,
    };

    try {
      await update.mutateAsync({
        custom_fields: nextCustomFields,
      });
      toast.success(t("Nota excluída."));
    } catch {
      toast.error(t("Erro ao excluir nota."));
    }
  }

  async function handleSaveEdit(id: string) {
    const texto = editingText.trim();
    if (!texto) return;

    const nextNotas = notas.map((n) =>
      n.id === id ? { ...n, body: texto, updated_at: new Date().toISOString() } : n
    );
    const nextCustomFields = {
      ...customFields,
      _notes: nextNotas,
    };

    try {
      await update.mutateAsync({
        custom_fields: nextCustomFields,
      });
      setEditingNoteId(null);
      toast.success(t("Nota atualizada."));
    } catch {
      toast.error(t("Erro ao atualizar nota."));
    }
  }

  return (
    <div className="space-y-4">
      {/* Formulário de Nova Nota */}
      {canEdit && (
        <Card className="p-4">
          <div className="flex items-center gap-2 pb-2">
            <NoteIcon size={16} weight="duotone" className="text-warning-fg" aria-hidden />
            <h3 className="text-sm font-semibold">{t("Adicionar nota interna")}</h3>
            <Badge variant="outline" className="text-[11px] text-muted-foreground">
              {t("Apenas a equipe visualiza")}
            </Badge>
          </div>
          <Textarea
            placeholder={t("Escreva observações importantes sobre este cliente, preferências, acordos ou pendências…")}
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            className="min-h-20 text-sm"
          />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={handleAddNote}
              disabled={salvando || !novaNota.trim()}
              className="gap-1.5"
            >
              <Plus size={14} weight="bold" aria-hidden />
              <span>{salvando ? t("Salvando…") : t("Salvar nota")}</span>
            </Button>
          </div>
        </Card>
      )}

      {/* Lista de Notas */}
      {notas.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">
          <NoteIcon size={32} className="opacity-30" aria-hidden />
          <p className="mt-2 font-medium">{t("Nenhuma nota interna registrada.")}</p>
          <p className="text-xs text-muted-foreground">
            {t("Notas internas são úteis para compartilhar contexto de atendimento com o time sem que o cliente veja.")}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notas.map((nota) => {
            const isEditing = editingNoteId === nota.id;
            const dataFormatada = format(new Date(nota.created_at), "dd/MM/yyyy HH:mm", {
              locale: localeDaData,
            });

            return (
              <Card
                key={nota.id}
                className="border-warning/40 bg-warning-bg/30 p-4 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 border-b border-warning/20 pb-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-warning-fg">
                    <UserCircle size={16} weight="bold" aria-hidden />
                    <span>{nota.author_name}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-normal text-muted-foreground">{dataFormatada}</span>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          if (isEditing) {
                            setEditingNoteId(null);
                          } else {
                            setEditingNoteId(nota.id);
                            setEditingText(nota.body);
                          }
                        }}
                        title={t("Editar nota")}
                      >
                        <PencilSimple size={13} aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteNote(nota.id)}
                        title={t("Excluir nota")}
                      >
                        <Trash size={13} aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="min-h-16 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingNoteId(null)}
                      >
                        {t("Cancelar")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(nota.id)}
                        disabled={!editingText.trim()}
                      >
                        {t("Salvar")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {nota.body}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
