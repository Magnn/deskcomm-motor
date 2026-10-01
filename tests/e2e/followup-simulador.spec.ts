/**
 * Simulador do construtor de fluxo (`/app/ai/followups/[id]`).
 *
 * Prova pela TELA (Playwright, não curl) que: o botão "Simular" abre um painel
 * na MESMA tela do editor; a simulação atravessa trigger→action→wait sozinha
 * (sem chamar IA nenhuma — o nó de ação usa o modo padrão `ai_message`, e o
 * simulador só mostra a orientação, nunca gera a mensagem de verdade); o nó
 * onde a simulação está parada acende no canvas; digitar uma mensagem como o
 * lead avança até o Fim; e, o mais importante, NADA disso cria uma inscrição
 * real (`followup_enrollments`) — a sessão inteira é efêmera, em memória.
 *
 * Reusa o mesmo padrão de login/criação de fluxo de `followup-builder.spec.ts`
 * (mesmo `.e2e-creds.json`, mesmo helper `connectHandles`).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import pg from "pg";
import { test, expect, type Page } from "@playwright/test";
import { arrastarDoMenu } from "./utils/canvas-do-fluxo";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
}

function loadCreds(): Creds {
  const needsSeed = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    return !c.users?.manager;
  };
  if (needsSeed()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
}

const creds = loadCreds();

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

/** Mesmo helper de followup-builder.spec.ts — arrasta da bolinha de saída até a de entrada. */
async function connectHandles(
  page: Page,
  sourceNodeId: string,
  targetNodeId: string,
): Promise<void> {
  const source = page
    .locator(`.react-flow__node[data-id="${sourceNodeId}"] .react-flow__handle.source`)
    .first();
  const target = page.locator(`.react-flow__node[data-id="${targetNodeId}"] .react-flow__handle.target`);
  const sBox = await source.boundingBox();
  const tBox = await target.boundingBox();
  if (!sBox || !tBox) throw new Error(`handle não encontrado: ${sourceNodeId} -> ${targetNodeId}`);
  await page.mouse.move(sBox.x + sBox.width / 2, sBox.y + sBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sBox.x + sBox.width / 2 + 5, sBox.y + sBox.height / 2 + 5, { steps: 3 });
  await page.mouse.move(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

async function nodeIdsByPrefix(page: Page, prefix: string): Promise<string[]> {
  const els = await page.locator(`.react-flow__node[data-id^="${prefix}-"]`).all();
  const ids: string[] = [];
  for (const el of els) {
    const id = await el.getAttribute("data-id");
    if (id) ids.push(id);
  }
  return ids;
}

test.describe("Simulador do construtor de fluxo", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("simula trigger→ação→espera→fim na MESMA tela, sem criar inscrição real", async ({ page }) => {
    await login(page, creds.users.manager!.email);

    // 1. Monta um fluxo mínimo: trigger → action (default ai_message) → wait → end.
    await page.goto("/app/ai/followups");
    const flowName = `E2E Simulador ${Date.now()}`;
    await page.getByRole("button", { name: "Novo fluxo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill(flowName);
    await dialog.getByRole("button", { name: "Criar fluxo" }).click();
    await expect(dialog).not.toBeVisible();
    await page.locator("li", { hasText: flowName }).getByRole("link").click();
    await page.waitForURL(/\/app\/ai\/followups\/([0-9a-f-]+)$/);
    const flowId = /\/app\/ai\/followups\/([0-9a-f-]+)$/.exec(page.url())?.[1];
    if (!flowId) throw new Error("não consegui extrair o id do fluxo da URL");
    await expect(page.locator(".react-flow")).toBeVisible();

    await arrastarDoMenu(page, "trigger");
    await arrastarDoMenu(page, "action");
    await arrastarDoMenu(page, "wait");
    await arrastarDoMenu(page, "end");

    const [triggerId] = await nodeIdsByPrefix(page, "trigger");
    const [actionId] = await nodeIdsByPrefix(page, "action");
    const [waitId] = await nodeIdsByPrefix(page, "wait");
    const [endId] = await nodeIdsByPrefix(page, "end");
    if (!triggerId || !actionId || !waitId || !endId) throw new Error("algum nó não nasceu");

    await connectHandles(page, triggerId, actionId);
    await connectHandles(page, actionId, waitId);
    await connectHandles(page, waitId, endId);
    await page.locator(".react-flow__pane").click({ position: { x: 10, y: 10 } }); // fecha painel de config aberto pelo último clique de nó
    await page.screenshot({ path: "test-results/simulador-01-grafo-montado.png", fullPage: true });

    // 2. Abre o Simulador NA MESMA TELA — não navega para lugar nenhum.
    await page.getByTestId("open-simulator").click();
    const painel = page.getByTestId("simulator-panel");
    await expect(painel).toBeVisible();
    await expect(page.locator(".react-flow")).toBeVisible(); // o canvas continua na tela, ao lado

    // 3. A rajada inicial atravessa trigger→action sozinha e para no wait — sem
    // digitar nada, sem chamar IA (o texto mostrado é só a orientação salva no nó).
    await expect(painel.getByText("Configure esta etapa.")).toBeVisible();
    await expect(painel.getByText("Simulado — não é enviado de verdade")).toBeVisible();
    await expect(painel.getByTestId("simulator-input")).toBeEnabled();
    await page.screenshot({ path: "test-results/simulador-02-parado-no-wait.png", fullPage: true });

    // 4. O nó onde a simulação está parada acende no CANVAS (feedback visual, turno a turno).
    await expect(page.locator(`[data-testid="node-card-${waitId}"]`)).toHaveAttribute(
      "data-simulating",
      "true",
    );
    await expect(page.locator(`[data-testid="node-card-${actionId}"]`)).not.toHaveAttribute(
      "data-simulating",
      "true",
    );

    // 5. Digita como se fosse o lead — avança até o Fim.
    await painel.getByTestId("simulator-input").fill("oi, tudo bem por aqui");
    await painel.getByTestId("simulator-enviar").click();
    await expect(painel.getByTestId("simulator-fim")).toBeVisible();
    await expect(painel.getByText("oi, tudo bem por aqui")).toBeVisible();
    await expect(painel.getByTestId("simulator-input")).toBeDisabled();
    await expect(page.locator(`[data-testid="node-card-${endId}"]`)).toHaveAttribute(
      "data-simulating",
      "true",
    );
    await page.screenshot({ path: "test-results/simulador-03-concluido.png", fullPage: true });

    // 6. Reiniciar volta ao início — prova que é sessão de cliente, não um estado do servidor.
    await painel.getByTestId("simulator-reiniciar").click();
    await expect(painel.getByTestId("simulator-fim")).toHaveCount(0);
    await expect(painel.getByText("Configure esta etapa.")).toBeVisible();

    // 7. A PROVA que mais importa: nada disto criou inscrição real no banco.
    // Consultado depois de simular duas vezes (inicial + reiniciar) — zero
    // linhas prova que o simulador nunca chamou o motor de verdade.
    expect(["127.0.0.1", "localhost"]).toContain(new URL(credenciaisSupabaseDeTeste().dbUrl).hostname);
    const pool = new pg.Pool({ connectionString: credenciaisSupabaseDeTeste().dbUrl, max: 1 });
    try {
      const { rows } = await pool.query<{ n: string }>(
        "select count(*)::text as n from followup_enrollments where pointer_id = $1",
        [flowId],
      );
      expect(rows[0]?.n).toBe("0");
    } finally {
      await pool.end();
    }
  });
});
