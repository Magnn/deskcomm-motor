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
import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";
import { Plus, QrCode, ShieldCheck } from "@/lib/ui/icons";

export type TipoDeConexao = "qr" | "oficial";

interface Props {
  /** Leva o usuário ao passo a passo do tipo escolhido (a aba que já existe). */
  onEscolher: (tipo: TipoDeConexao) => void;
}

/**
 * "Conectar WhatsApp" — a escolha ANTES do passo a passo.
 *
 * As duas formas de conectar já existiam, cada uma na sua aba, sem nada que
 * dissesse a diferença. E a diferença decide o que o número aguenta: o pareado
 * por QR tem travas anti-banimento (texto repetido barrado, limite diário de
 * número novo, janela de horário) que o oficial não tem. Quem montava um funil
 * de volume num número por QR descobria isso com o funil parado.
 *
 * Os números mostrados vêm dos MESMOS padrões que o motor aplica — nunca
 * copiados para cá: se o padrão mudar, a tela muda junto.
 */
export function EscolherConexao({ onEscolher }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);

  const limiteDoNumeroNovo = PACING_DEFAULTS.warmupDailyCaps[0]?.cap ?? null;
  const repeticaoBarrada = SPINNING_DEFAULTS.repetitionThreshold + 1;
  const janela = `${PACING_DEFAULTS.windowStartHour}h–${PACING_DEFAULTS.windowEndHour}h`;

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

      <Dialog open={aberto} onOpenChange={setAberto}>
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
                  {t("Envia só no horário")} {janela}.
                </li>
              </ul>
              <p className="text-sm font-medium text-text">{t("Indicado para atendimento e conversa.")}</p>
              <Button className="mt-auto" variant="outline" onClick={() => escolher("qr")} data-testid="escolher-qr">
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
                {t("Você cadastra o número na Meta e cola as credenciais aqui. Leva mais tempo para configurar.")}
              </p>
              <ul className="list-disc space-y-1 pl-4 text-sm text-text">
                <li>{t("Sem risco de banimento por volume.")}</li>
                <li>{t("Sem as travas de mensagem repetida, limite diário e horário.")}</li>
                <li>{t("A Meta pode cobrar pelas mensagens que a empresa inicia.")}</li>
                <li>{t("Depois de 24 horas sem resposta do contato, só envia modelo aprovado pela Meta.")}</li>
              </ul>
              <p className="text-sm font-medium text-text">{t("Indicado para funil fixo e volume.")}</p>
              <Button className="mt-auto" onClick={() => escolher("oficial")} data-testid="escolher-oficial">
                {t("Conectar pela API oficial")}
              </Button>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
