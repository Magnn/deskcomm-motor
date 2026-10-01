import type { Page } from "@playwright/test";

/**
 * Reduz o zoom do canvas de follow-up até a escala ALVO, MEDINDO — nunca
 * contando cliques.
 *
 * As cinco specs do canvas clicavam N vezes em "reduzir zoom" para compensar o
 * salto a 200% que o enquadramento automático dava no primeiro nó de um fluxo
 * vazio (`FlowCanvas.tsx`, corrigido no mesmo PR que trouxe este arquivo).
 * Sem o salto, o mesmo número de cliques leva a escalas pequenas demais — os
 * cartões e as bolinhas de saída viram alvos de poucos pixels, e o arrasto
 * passa a errar. Medir a escala e parar no alvo vale antes e depois.
 *
 * É módulo compartilhado, e não a sexta cópia, porque a regra é a mesma nos
 * cinco arquivos e já cobrou o preço de divergir: três specs foram corrigidas
 * numa rodada e as duas que ficaram para trás reprovaram na seguinte.
 */
export async function zoomAte(page: Page, alvo: number): Promise<void> {
  const escala = async (): Promise<number> =>
    page.locator(".react-flow__viewport").evaluate((el) => {
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return m.a || 1;
    });
  const zoomOut = page.locator(".react-flow__controls-zoomout");
  for (let i = 0; i < 10 && (await escala()) > alvo + 0.01; i++) {
    await zoomOut.click();
    await page.waitForTimeout(80);
  }
}

/**
 * Adiciona um nó do menu ao canvas do jeito que a pessoa faz: ARRASTANDO.
 *
 * No desktop clicar no item do menu não adiciona nada (decisão de produto:
 * o nó entra só pelo arrasto, e entra sem abrir a configuração). Abaixo de
 * `lg` o menu é uma gaveta por cima do canvas e o toque não arrasta — lá o
 * toque no item adiciona, e este helper toca.
 *
 * O ponto de soltura é uma grade de 3 colunas dentro do canvas, escolhida
 * pelo número de nós que já existem — cada nó novo cai num lugar livre, como
 * a posição automática do antigo clique fazia.
 */
export async function arrastarDoMenu(page: Page, tipo: string): Promise<void> {
  const item = page.getByTestId(`palette-add-${tipo}`).first();
  const nos = page.locator(".react-flow__node");
  const antes = await nos.count();
  const largura = page.viewportSize()?.width ?? 1600;
  if (largura < 1024) {
    await item.click();
  } else {
    const canvas = page.getByTestId("flow-canvas");
    await item.dragTo(canvas, {
      targetPosition: { x: 140 + (antes % 3) * 320, y: 120 + Math.floor(antes / 3) * 240 },
    });
  }
  await page.waitForFunction(
    (n) => document.querySelectorAll(".react-flow__node").length > n,
    antes,
  );
}
