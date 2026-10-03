"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { Trash } from "@/lib/ui/icons";

import { ChannelAiAccess } from "./ChannelAiAccess";
import { DesconectarCanalDialog } from "./DesconectarCanalDialog";

interface Bot {
  id: string;
  botId: string;
  nome: string | null;
  status: string;
  falha: string | null;
  conectadoEm: string;
}

/**
 * Conexões › Telegram — o bot da empresa atendendo pelo CRM. A pessoa cria o bot
 * no @BotFather, cola o token aqui, e cada bot vira um canal como os outros:
 * inbox, agente, fluxos. Sem janela de 24h: o bot responde a qualquer hora quem
 * já falou com ele.
 */
export function TelegramClient() {
  const t = useT();
  const query = useQuery({
    queryKey: ["telegram-bots"],
    queryFn: async () => (await apiClient.get<{ data: { bots: Bot[] } }>("/api/v1/telegram")).data,
  });
  const [token, setToken] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluir, setExcluir] = useState<Bot | null>(null);

  const conectar = async () => {
    setEnviando(true);
    setErro(null);
    try {
      const r = await apiClient.post<{ data: { username: string; recebendo: boolean } }>("/api/v1/telegram", { token: token.trim() });
      setToken("");
      if (r.data.recebendo) toast.success(`${t("Bot conectado:")} @${r.data.username}`);
      else toast.warning(t("O bot foi gravado, mas o recebimento não ligou. Veja o motivo no cartão."));
      await query.refetch();
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("Não foi possível conectar o bot."));
    } finally {
      setEnviando(false);
    }
  };

  const bots = query.data?.bots ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("Telegram")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("As conversas com o seu bot chegam na caixa de entrada, e o agente e os fluxos respondem. No Telegram não há janela de 24h: o bot responde a qualquer hora quem já falou com ele.")}
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>{t("No Telegram, abra o @BotFather e envie /newbot (ou /token para um bot que já existe).")}</li>
          <li>{t("Copie o token que ele devolve e cole abaixo.")}</li>
        </ol>
        <div className="flex flex-col gap-2">
          <Label htmlFor="telegram-token">{t("Token do bot")}</Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="telegram-token"
              type="password"
              autoComplete="off"
              placeholder="123456789:AA…"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="max-w-md"
            />
            <Button disabled={enviando || token.trim().length < 20} onClick={() => void conectar()}>
              {t("Conectar bot")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Se o bot estava ligado em outra plataforma, ele passa a responder só por aqui.")}
          </p>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
      </Card>

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">{t("Não foi possível carregar o Telegram.")}</p>
      ) : bots.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Nenhum bot conectado ainda.")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {bots.map((b) => (
            <Card key={b.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{b.nome ?? b.botId}</span>
                  <span className="text-xs text-muted-foreground">ID {b.botId}</span>
                </div>
                <Badge className="ml-auto" variant={b.status === "WORKING" ? "neutral" : "warning"}>
                  {b.status === "WORKING" ? t("Recebendo") : t("Precisa de atenção")}
                </Badge>
              </div>
              <p className="text-sm">
                {b.status === "WORKING"
                  ? t("Recebimento configurado. Novas mensagens entram na caixa de entrada.")
                  : t("O recebimento deste bot não ligou. Cole o token de novo para tentar outra vez.")}
              </p>
              {b.status !== "WORKING" && b.falha && (
                <p className="text-xs text-muted-foreground">
                  {t("Motivo informado pelo Telegram:")} {b.falha}
                </p>
              )}
              <ChannelAiAccess channelId={b.id} phoneTesting={false} />
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/app/inbox">{t("Abrir atendimento")}</Link>
                </Button>
                <Button variant="ghost" onClick={() => setExcluir(b)}>
                  <Trash size={14} aria-hidden />
                  {t("Desconectar")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {excluir && (
        <DesconectarCanalDialog
          canalId={excluir.id}
          nome={excluir.nome ?? excluir.botId}
          descricao={t("As mensagens deste bot deixam de chegar ao CRM e o webhook dele é desligado. O histórico de conversas continua guardado, e conectar o bot de novo retoma as mesmas conversas.")}
          sucesso={t("Bot desconectado. As conversas continuam no inbox.")}
          onCancel={() => setExcluir(null)}
          onDone={() => {
            setExcluir(null);
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
