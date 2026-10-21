"use client";

/**
 * "Enviar Pix" — o atendente cobra por Pix sem sair da conversa.
 *
 * O produto vem da mesma lista do "Registrar pagamento" (os que o agente da organização vende), e escolher um
 * já preenche o valor; "Outro produto" libera digitar. O valor pode ser mudado: é o caso da entrada combinada
 * ou do desconto que o atendente fechou. Quem monta este diálogo o monta só quando abre (`ConversationHeader`).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { centavosDoTexto } from "@/components/inbox/RegistrarPagamentoDialog";
import { useEnviarPix, useSugestoesDePagamento } from "@/hooks/inbox/useRegistrarPagamento";
import { useT } from "@/hooks/i18n/useT";

const OUTRO_PRODUTO = "__outro_produto__";
const textoDoValor = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnviarPixDialog({ conversationId, open, onOpenChange }: Props) {
  const t = useT();
  const sugestoes = useSugestoesDePagamento(conversationId, open);
  const enviar = useEnviarPix();
  const [produtoEscolhido, setProdutoEscolhido] = useState<string | null>(null);
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const [foraDaLista, setForaDaLista] = useState(false);

  const lista = useMemo(() => sugestoes.data ?? [], [sugestoes.data]);
  const produto = produtoEscolhido ?? (lista.length === 1 ? (lista[0]?.produto ?? "") : "");
  const sugerido = lista.find((x) => x.produto === produto);
  const valor = valorDigitado ?? (sugerido ? textoDoValor(sugerido.valor_cents) : "");
  const cents = centavosDoTexto(valor);
  const pronto = produto.trim() !== "" && cents !== null && cents >= 100;

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

  const mandar = () => {
    if (!pronto || cents === null) return;
    enviar.mutate(
      {
        conversation_id: conversationId,
        // A cobrança avulsa só vale no valor da lista: valor mexido vira um Pix comum.
        pix: { produto: produto.trim(), valor_cents: cents, ...(sugerido?.extra && cents === sugerido.valor_cents ? { extra: sugerido.extra } : {}) },
      },
      {
        onSuccess: () => {
          toast.success(t("Pix enviado na conversa. O pagamento é confirmado sozinho."));
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="enviar-pix-dialog">
        <DialogHeader>
          <DialogTitle>{t("Enviar Pix")}</DialogTitle>
          <DialogDescription>
            {t("A pessoa recebe a instrução e o código copia e cola neste valor. Quando ela pagar, o contato é marcado como pago e a entrega começa sozinha.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pix-produto">{t("O que ela está comprando")}</Label>
            {lista.length > 0 && !foraDaLista ? (
              <Select value={produto} onValueChange={escolher}>
                <SelectTrigger id="pix-produto" className="w-full" data-testid="pix-produto">
                  <SelectValue placeholder={t("Escolha o produto")} />
                </SelectTrigger>
                <SelectContent>
                  {lista.map((s) => (
                    <SelectItem key={s.produto} value={s.produto}>
                      {s.produto}
                    </SelectItem>
                  ))}
                  <SelectItem value={OUTRO_PRODUTO}>{t("Outro produto")}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="pix-produto"
                data-testid="pix-produto-livre"
                value={produto}
                maxLength={120}
                placeholder={sugestoes.isLoading ? t("Carregando...") : t("Nome do produto")}
                onChange={(e) => setProdutoEscolhido(e.target.value)}
              />
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="pix-valor">{t("Valor do Pix (R$)")}</Label>
            <Input
              id="pix-valor"
              data-testid="pix-valor"
              inputMode="decimal"
              value={valor}
              placeholder="0,00"
              onChange={(e) => setValorDigitado(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("Pode ser o valor cheio, o valor negociado ou a entrada combinada.")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button data-testid="pix-enviar" onClick={mandar} disabled={!pronto || enviar.isPending}>
            {enviar.isPending ? t("Enviando…") : t("Enviar Pix")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
