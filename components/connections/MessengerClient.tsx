"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { Trash } from "@/lib/ui/icons";

import { ChannelAiAccess } from "./ChannelAiAccess";
import { DesconectarCanalDialog } from "./DesconectarCanalDialog";

interface Pagina {
  id: string;
  pageId: string;
  nome: string | null;
  status: string;
  fotoUrl: string | null;
  conectadaEm: string;
  falha: string | null;
}

interface Estado {
  configurado: boolean;
  paginas: Pagina[];
}

/** O motivo que volta do login do Facebook (`?erro=`), na frase de quem vai consertar. */
const FRASE_DO_ERRO: Record<string, string> = {
  nao_configurado: "O Messenger não está configurado nesta instalação.",
  sessao_expirada: "A conexão demorou demais e expirou. Tente de novo.",
  recusado: "A permissão foi recusada na tela do Facebook. Para conectar, aceite as permissões pedidas.",
  sem_codigo: "O Facebook não devolveu a autorização. Tente de novo.",
  nenhuma_pagina: "Nenhuma página foi liberada no Facebook. Ao conectar, marque as páginas que vão atender.",
  cifra_indisponivel: "A chave de cifra da instalação não está disponível: a página não pôde ser guardada com segurança.",
  falha_na_meta: "O Facebook recusou a conexão. Tente de novo em instantes.",
};

/** Por que uma página autorizada não virou canal (`?recusas=`). */
const FRASE_DA_RECUSA: Record<string, string> = {
  de_outra_empresa: "Uma das páginas já atende por outra empresa nesta instalação e ficou de fora.",
  sem_permissao_de_mensagens: "Uma das páginas não deu permissão de mensagens a quem conectou e ficou de fora.",
  avisos_nao_ligados: "Uma das páginas foi gravada, mas o recebimento não ligou. Veja o motivo no cartão dela e conecte de novo.",
};

/**
 * Conexões › Messenger — a página do Facebook atendendo pelo CRM, direto pela
 * Meta (sem intermediário). Conectar é um clique: a escolha das páginas acontece
 * na tela do próprio Facebook. Cada página vira um canal como os outros: inbox,
 * agente, fluxo, janela de 24h.
 */
export function MessengerClient() {
  const t = useT();
  const params = useSearchParams();
  const query = useQuery({
    queryKey: ["messenger-paginas"],
    queryFn: async () => (await apiClient.get<{ data: Estado }>("/api/v1/messenger")).data,
  });
  const [excluir, setExcluir] = useState<Pagina | null>(null);

  // O resultado do login volta pela URL: avisa uma vez, ao chegar.
  const erro = params.get("erro");
  const conectadas = params.get("conectadas");
  const recusas = params.get("recusas");
  useEffect(() => {
    if (conectadas && Number(conectadas) > 0) {
      toast.success(Number(conectadas) === 1 ? t("Página conectada.") : t("Páginas conectadas."));
    }
  }, [conectadas, t]);

  const estado = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">{t("Messenger (página do Facebook)")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("As mensagens da sua página chegam na caixa de entrada, e o agente e os fluxos respondem como no WhatsApp. Responder é possível até 24h depois da última mensagem da pessoa.")}
        </p>
      </div>

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {t(FRASE_DO_ERRO[erro] ?? "Não foi possível conectar a página.")}
        </p>
      )}
      {recusas &&
        recusas.split(",").map((r) => (
          <p key={r} role="status" className="text-sm text-muted-foreground">
            {t(FRASE_DA_RECUSA[r] ?? "Uma das páginas não pôde ser conectada.")}
          </p>
        ))}

      {query.isPending ? (
        <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>
      ) : query.isError || !estado ? (
        <p role="alert" className="text-sm text-destructive">{t("Não foi possível carregar o Messenger.")}</p>
      ) : !estado.configurado ? (
        <Card className="p-4 text-sm">
          {t("O Messenger ainda não está configurado nesta instalação: falta o ID do app da Meta (META_APP_ID) ou o segredo do app em Admin › API Oficial (Meta).")}
        </Card>
      ) : (
        <>
          <div>
            {/* Navegação, não chamada de API: o login do Facebook é uma página da Meta. */}
            <Button asChild>
              <a href="/api/v1/messenger/oauth/start">
                {estado.paginas.length === 0 ? t("Conectar página do Facebook") : t("Conectar outra página")}
              </a>
            </Button>
          </div>

          {estado.paginas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("Nenhuma página conectada ainda.")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {estado.paginas.map((p) => (
                <Card key={p.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto da página, servida pela CDN da Meta
                      <img src={p.fotoUrl} alt="" className="h-10 w-10 rounded-full" />
                    ) : null}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{p.nome ?? p.pageId}</span>
                      <span className="text-xs text-muted-foreground">ID {p.pageId}</span>
                    </div>
                    <Badge className="ml-auto" variant={p.status === "WORKING" ? "neutral" : "warning"}>
                      {p.status === "WORKING" ? t("Recebendo") : t("Precisa de atenção")}
                    </Badge>
                  </div>
                  <p className="text-sm">
                    {p.status === "WORKING"
                      ? t("Recebimento configurado. Novas mensagens entram na caixa de entrada.")
                      : t("O recebimento desta página não ligou. Conecte a página de novo; se continuar, confira as permissões do app na Meta.")}
                  </p>
                  {p.status !== "WORKING" && p.falha && (
                    <p className="text-xs text-muted-foreground">
                      {t("Motivo informado pela Meta:")} {p.falha}
                    </p>
                  )}
                  <ChannelAiAccess channelId={p.id} phoneTesting={false} />
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline">
                      <Link href="/app/inbox">{t("Abrir atendimento")}</Link>
                    </Button>
                    <Button variant="ghost" onClick={() => setExcluir(p)}>
                      <Trash size={14} aria-hidden />
                      {t("Desconectar")}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {excluir && (
        <DesconectarCanalDialog
          canalId={excluir.id}
          nome={excluir.nome ?? excluir.pageId}
          descricao={t("As mensagens desta página deixam de chegar ao CRM. O histórico de conversas continua guardado, e conectar a página de novo retoma as mesmas conversas.")}
          sucesso={t("Página desconectada. As conversas continuam no inbox.")}
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
