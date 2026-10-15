"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import type { LoginDoCanalOficial } from "@/hooks/channels/useOfficialChannel";
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";
import { Plus, QrCode, ShieldCheck } from "@/lib/ui/icons";

import { AvisosDaJanela, ManterNoCelular, TextoDoPortfolio, useJanelaDoFacebook } from "./ConectarComFacebook";

export type TipoDeConexao = "qr" | "oficial";

interface Props {
  /**
   * QR: abre o QR do número novo (em janela, sem trocar de tela).
   * Oficial: só é chamado quando a instalação NÃO tem o login do Facebook
   * configurado — aí o caminho é o formulário colado da aba oficial.
   */
  onEscolher: (tipo: TipoDeConexao) => void;
  /** O login do Facebook da instalação; `null` = não configurado. */
  login?: LoginDoCanalOficial | null;
  /** Já há número oficial nesta empresa? Muda só o rótulo (trocar, não conectar). */
  oficialConectado?: boolean;
}

/**
 * "Conectar WhatsApp" — o ÚNICO botão de conectar número da tela de Conexões.
 *
 * Ele abre a escolha entre as duas formas, e cada forma segue em janela:
 * QR abre o QR; API oficial abre a janela do Facebook ali mesmo, sem levar a
 * pessoa a uma aba para clicar num segundo botão. Até 15/10/2026 a escolha só
 * trocava de aba, e cada aba tinha o seu botão de conectar — três botões para
 * a mesma intenção (pedido do dono: "só devia ter um botão de conexão").
 *
 * A diferença entre as duas decide o que o número aguenta: o pareado por QR tem
 * travas anti-banimento (texto repetido barrado, limite diário de número novo,
 * janela de horário) que o oficial não tem. Os números mostrados vêm dos MESMOS
 * padrões que o motor aplica — nunca copiados para cá.
 */
export function EscolherConexao({ onEscolher, login = null, oficialConectado = false }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [noCelular, setNoCelular] = useState(false);
  // Montado com a tela (e não com a janela de escolha) para o SDK já estar
  // pronto no clique: a janela do Facebook só abre dentro do próprio clique.
  const janela = useJanelaDoFacebook(login, () => setAberto(false));
  const ocupado = janela.naJanela || janela.conectando;

  const limiteDoNumeroNovo = PACING_DEFAULTS.warmupDailyCaps[0]?.cap ?? null;
  const repeticaoBarrada = SPINNING_DEFAULTS.repetitionThreshold + 1;
  const horario = `${PACING_DEFAULTS.windowStartHour}h–${PACING_DEFAULTS.windowEndHour}h`;

  const escolher = (tipo: TipoDeConexao) => {
    setAberto(false);
    onEscolher(tipo);
  };

  return (
    <>
      <Button size="sm" onClick={() => setAberto(true)} data-testid="conectar-whatsapp">
        <Plus size={14} aria-hidden />
        {t("Conectar WhatsApp")}
      </Button>

      {/* Fechar a escolha com a janela do Facebook aberta perderia o aviso de
          volta (conta e número) — por isso ela não fecha enquanto ocupada. */}
      <Dialog open={aberto} onOpenChange={(v) => !ocupado && setAberto(v)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("Como você quer conectar o WhatsApp?")}</DialogTitle>
            <DialogDescription>
              {t("As duas formas funcionam. A diferença é o que o número aguenta depois de conectado.")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <section
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
              data-testid="conexao-qr"
              aria-labelledby="conexao-qr-titulo"
            >
              <div className="flex items-center gap-2">
                <QrCode size={20} className="text-primary" aria-hidden />
                <h3 id="conexao-qr-titulo" className="text-base font-semibold text-text">
                  {t("Sem API (QR code)")}
                </h3>
              </div>
              <p className="text-sm text-text-muted">
                {t("Você lê um QR code com o celular, como no WhatsApp Web. Fica pronto em um minuto.")}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-text">
                <li>{t("Sem cadastro na Meta e sem cobrança dela.")}</li>
                <li>{t("Tem risco de banimento se o número disparar em massa.")}</li>
                <li>
                  {t("Por isso o sistema barra a mesma mensagem repetida")} ({repeticaoBarrada}ª {t("igual seguida")}).
                </li>
                {limiteDoNumeroNovo !== null && (
                  <li>
                    {t("Número novo começa com limite de")} {limiteDoNumeroNovo} {t("envios por dia, que sobe com o tempo.")}
                  </li>
                )}
                <li>
                  {t("Envia só no horário")} {horario}.
                </li>
              </ul>
              <p className="text-sm font-medium text-text">{t("Indicado para atendimento e conversa.")}</p>
              <Button
                className="mt-auto"
                variant="outline"
                disabled={ocupado}
                onClick={() => escolher("qr")}
                data-testid="escolher-qr"
              >
                {t("Conectar por QR code")}
              </Button>
            </section>

            <section
              className="flex flex-col gap-3 rounded-lg border border-border p-4"
              data-testid="conexao-oficial"
              aria-labelledby="conexao-oficial-titulo"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary" aria-hidden />
                <h3 id="conexao-oficial-titulo" className="text-base font-semibold text-text">
                  {t("API oficial (Meta)")}
                </h3>
              </div>
              <p className="text-sm text-text-muted">
                {login
                  ? t("A janela do Facebook abre aqui mesmo: você escolhe o portfólio, a conta do WhatsApp e o número. Nada para copiar ou colar.")
                  : t("Você cadastra o número na Meta e cola as credenciais aqui. Leva mais tempo para configurar.")}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-text">
                <li>{t("Sem risco de banimento por volume.")}</li>
                <li>{t("Sem as travas de mensagem repetida, limite diário e horário.")}</li>
                <li>{t("A Meta pode cobrar pelas mensagens que a empresa inicia.")}</li>
                <li>{t("Depois de 24 horas sem resposta do contato, só envia modelo aprovado pela Meta.")}</li>
              </ul>
              <p className="text-sm font-medium text-text">{t("Indicado para funil fixo e volume.")}</p>
              {login ? (
                <div className="mt-auto flex flex-col gap-2">
                  <ManterNoCelular marcado={noCelular} desabilitado={ocupado} aoMudar={setNoCelular} />
                  <TextoDoPortfolio />
                  <Button
                    onClick={() => janela.abrir(noCelular)}
                    disabled={!janela.pronto || ocupado}
                    data-testid="escolher-oficial"
                  >
                    {janela.conectando
                      ? t("Conectando…")
                      : janela.naJanela
                        ? t("Conclua na janela do Facebook…")
                        : oficialConectado
                          ? t("Trocar o número com Facebook")
                          : t("Conectar com Facebook")}
                  </Button>
                  <AvisosDaJanela bloqueado={janela.bloqueado} aviso={janela.aviso} />
                </div>
              ) : (
                <Button className="mt-auto" onClick={() => escolher("oficial")} data-testid="escolher-oficial">
                  {t("Conectar pela API oficial")}
                </Button>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
