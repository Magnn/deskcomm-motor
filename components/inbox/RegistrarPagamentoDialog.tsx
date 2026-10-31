"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { randomId } from "@/lib/random-id";
import { useRegistrarPagamento, useSugestoesDePagamento } from "@/hooks/inbox/useRegistrarPagamento";
import { METODOS_DE_PAGAMENTO, ROTULO_DO_METODO, type MetodoDePagamento } from "@/lib/pagamentos/pagamento-recebido-tipos";

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/** "130", "130,00" ou "1.300,50" → centavos. `null` quando não é um valor. */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const valor = Math.round(Number(normal) * 100);
  return Number.isFinite(valor) && valor > 0 ? valor : null;
}

const textoDoValor = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

/**
 * A pessoa pagou por fora do checkout (Pix direto, dinheiro), e quem atende registra aqui.
 *
 * O produto vem de uma lista — os que o agente da organização vende — e escolher um já preenche o
 * valor. A chave do registro nasce com o diálogo: é ela que impede o clique duplo de registrar
 * duas vezes.
 */
/** Valor do item "Outro produto" na lista — nunca é nome de produto (a API recebe o que for digitado). */
const OUTRO_PRODUTO = "__outro_produto__";

export function RegistrarPagamentoDialog({ conversationId, open, onOpenChange }: Props) {
  const t = useT();
  const sugestoes = useSugestoesDePagamento(conversationId, open);
  const registrar = useRegistrarPagamento();
  // A chave nasce com o diálogo — quem o usa monta só quando abre (ver `ConversationHeader`).
  const [chave] = useState(() => randomId());
  // `null` = a pessoa ainda não mexeu: vale o que a lista sugere.
  const [produtoEscolhido, setProdutoEscolhido] = useState<string | null>(null);
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const [metodo, setMetodo] = useState<MetodoDePagamento>("pix");
  const [iniciarEntrega, setIniciarEntrega] = useState(false);
  // A lista é a dos produtos do AGENTE; o que é vendido por fluxo ou por fora dela é digitado.
  const [foraDaLista, setForaDaLista] = useState(false);

  const lista = useMemo(() => sugestoes.data ?? [], [sugestoes.data]);

  // Com um produto só, ele já vem escolhido — menos um clique.
  const produto = produtoEscolhido ?? (lista.length === 1 ? (lista[0]?.produto ?? "") : "");
  const sugerido = lista.find((x) => x.produto === produto);
  const valor = valorDigitado ?? (sugerido ? textoDoValor(sugerido.valor_cents) : "");

  const cents = centavosDoTexto(valor);
  const pronto = produto.trim() !== "" && cents !== null && cents >= 100 && chave !== "";

  // Trocar de produto devolve o valor à sugestão dele.
  const escolher = (nome: string) => {
    if (nome === OUTRO_PRODUTO) {
      setForaDaLista(true);
      setProdutoEscolhido("");
      setValorDigitado("");
      return;
    }
    setProdutoEscolhido(nome);
    setValorDigitado(null);
  };

  const [parecido, setParecido] = useState<{ valorCentavos: number; quando: string } | null>(null);

  const enviar = () => {
    if (!pronto || cents === null) return;
    registrar.mutate(
      { conversation_id: conversationId, pagamento: { chave, confirmar_repetido: parecido !== null, produto: produto.trim(), valor_cents: cents, metodo, iniciar_entrega: iniciarEntrega } },
      {
        onSuccess: (r) => {
          if (r.resultado === "parecido") {
            setParecido(r);
            return;
          }
          if (r.resultado === "ja_registrado") toast.info(t("Este pagamento já estava registrado."));
          else if (r.resultado === "registrado") {
            if (r.negocio === "nao_fechou") toast.warning(t("Pagamento registrado, mas o negócio não fechou sozinho. Feche-o no funil."));
            else if (r.entrega === "sem_fluxo") toast.warning(t("Pagamento registrado. A entrega automática não começou: não há fluxo de entrega para este produto."));
            else toast.success(t("Pagamento registrado."));
          }
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="registrar-pagamento">
        <DialogHeader>
          <DialogTitle>{t("Registrar pagamento recebido")}</DialogTitle>
          <DialogDescription>
            {t("Use quando a pessoa pagou por fora do link (Pix direto, dinheiro). O contato fica marcado como pago e o negócio fecha com o valor.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pagamento-produto">{t("O que ela comprou")}</Label>
            {lista.length > 0 && !foraDaLista ? (
              <Select value={produto} onValueChange={escolher}>
                <SelectTrigger id="pagamento-produto" className="w-full" data-testid="pagamento-produto">
                  <SelectValue placeholder={t("Escolha o produto")} />
                </SelectTrigger>
                <SelectContent>
                  {lista.map((s) => (
                    <SelectItem key={s.produto} value={s.produto}>
                      {s.produto}
                    </SelectItem>
                  ))}
                  <SelectItem value={OUTRO_PRODUTO} data-testid="pagamento-produto-outro">
                    {t("Outro produto")}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="pagamento-produto"
                data-testid="pagamento-produto-livre"
                value={produto}
                maxLength={120}
                placeholder={sugestoes.isLoading ? t("Carregando...") : t("Nome do produto")}
                onChange={(e) => setProdutoEscolhido(e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pagamento-valor">{t("Valor recebido (R$)")}</Label>
            <Input
              id="pagamento-valor"
              data-testid="pagamento-valor"
              inputMode="decimal"
              value={valor}
              placeholder="130,00"
              onChange={(e) => setValorDigitado(e.target.value)}
              aria-invalid={valor !== "" && cents === null}
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pagamento-metodo">{t("Como pagou")}</Label>
            <Select value={metodo} onValueChange={(v) => setMetodo(v as MetodoDePagamento)}>
              <SelectTrigger id="pagamento-metodo" className="w-full" data-testid="pagamento-metodo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODOS_DE_PAGAMENTO.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(ROTULO_DO_METODO[m])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
              <Label htmlFor="pagamento-entrega">{t("Iniciar a entrega automática")}</Label>
              <p className="text-xs text-muted-foreground">{t("Deixe desligado se você mesmo vai conduzir a entrega nesta conversa.")}</p>
            </div>
            <Switch id="pagamento-entrega" data-testid="pagamento-entrega" checked={iniciarEntrega} onCheckedChange={setIniciarEntrega} />
          </div>
        </div>

        <DialogFooter>
          {parecido !== null && (
            <p className="text-xs text-warning w-full" data-testid="pagamento-parecido">
              {t("Já existe um pagamento parecido deste contato")} (R$ {(parecido.valorCentavos / 100).toFixed(2).replace(".", ",")},{" "}
              {new Date(parecido.quando).toLocaleDateString()}). {t("Confirme de novo só se for outro pagamento.")}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button data-testid="pagamento-confirmar" disabled={!pronto || registrar.isPending} onClick={enviar}>
            {registrar.isPending ? t("Registrando...") : t("Registrar pagamento")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
