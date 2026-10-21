/**
 * A PRÓXIMA DA SEQUÊNCIA — quem acabou de comprar um produto que abre outro (`depois_de`, sem espera) ouve a
 * oferta do seguinte no mesmo dia, sem depender de o modelo lembrar.
 *
 * Medido em 21/10/2026: uma cliente pagou a Oração dos Sonhos (R$ 35), recebeu a oração, e os Sons Vocálicos
 * (R$ 45, `depois_de: "Oração dos Sonhos"`, espera 0 h) nunca foram oferecidos. O bloco "A OFERTA DE HOJE é
 * Sons Vocálicos" estava no turno, mas o turno era sobre a Noite 1 do trabalho e o modelo seguiu a entrega.
 *
 * A regra: a compra aprovada de X agenda, para depois da entrega de X, UM turno do agente cujo motivo é
 * oferecer o produto que tem `depois_de: X` e `espera_horas: 0`. O turno escreve a oferta (ou decide não
 * oferecer, se a pessoa está num momento difícil). Pura; quem agenda é `agendar-proxima-da-sequencia.ts`.
 */
import { slugDoProduto } from "@/lib/preco/pos-venda";

import { nomeCasaComCompra, produtosComprados } from "./oferta-da-vez";
import type { CatalogoConfig, ProdutoDoCatalogo } from "./tipos";

/** Quanto depois da compra o turno da oferta sai: a entrega do que ela comprou vem antes. */
export const ESPERA_DA_OFERTA_DA_SEQUENCIA_MIN = 20;

/** O produto que a compra de `comprado` abre agora, se a pessoa ainda não o tem. `null` = nada a oferecer. */
export function proximaDaSequencia(
  catalogo: CatalogoConfig | null,
  comprado: string | null,
  tags: readonly string[],
): ProdutoDoCatalogo | null {
  if (catalogo === null || comprado === null || slugDoProduto(comprado) === "") return null;
  const jaTem = produtosComprados(tags);
  return (
    catalogo.produtos.find(
      (p) =>
        p.ativo &&
        p.espera_horas === 0 &&
        p.depois_de !== undefined &&
        nomeCasaComCompra(p.depois_de, [slugDoProduto(comprado)]) &&
        !nomeCasaComCompra(p.nome, jaTem),
    ) ?? null
  );
}

/** O motivo que o turno lê. Sem prazo, sem pressão, e sem oferta se a pessoa está num momento difícil. */
export function motivoDaOfertaDaSequencia(comprado: string, p: ProdutoDoCatalogo): string {
  const valor = `R$ ${(p.preco_cents / 100).toFixed(2).replace(".", ",").replace(",00", "")}`;
  return (
    `oferta da sequência: ela acabou de comprar ${comprado} e já recebeu. Agora ofereça ${p.nome} (${valor}, pagamento único)` +
    (p.descricao ? ` — ${p.descricao}` : "") +
    (p.recebe ? ` O que ela recebe: ${p.recebe}.` : "") +
    ` Primeiro pergunte em meia frase como foi com ${comprado}; depois, ligado ao que ela contou, use o molde do bloco PREÇO E PRÓXIMA OFERTA: ` +
    `"Pelo que você me contou, tem algo que combina com este momento: ${p.nome}. Fica ${valor}, pagamento único. Quer que eu te mande?" ` +
    "O link só se ela disser que quer. Sem prazo, sem \"só hoje\", e nunca diga que o que ela comprou não funciona sem isto. " +
    "Se ela está no meio de uma dificuldade, pediu para não ser procurada ou disse que não tem dinheiro, não ofereça: só acompanhe."
  );
}
