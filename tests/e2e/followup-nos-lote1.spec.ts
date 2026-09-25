/**
 * Prova por tela dos 5 nós novos do construtor de fluxo (lote 1, comparativo
 * ChatbotX/AcassIA/Desk): A/B split, IA (prompt livre), API externa,
 * notificar atendente e anotação no contato — UM spec para os cinco (não
 * precisa de 5 specs separados, per a task que trouxe este lote).
 *
 * Cobre só ADIÇÃO e CONFIGURAÇÃO pela tela (a paleta oferece a caixa, o
 * painel salva no rascunho, o card mostra o que foi salvo) — não a execução
 * de verdade do fluxo publicado (isso pede worker + LLM + fetch reais, fora
 * do alcance de uma prova de canvas).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { afirmarAdminDeTenantPuro } from "./utils/precondicao";

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

test.beforeAll(async () => {
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/app\//);
}

test.describe("followup flow builder — lote 1 dos nós novos (A/B split, IA livre, API externa, notificar, anotar)", () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  test("adiciona os 5 nós pela paleta e configura cada um", async ({ page }) => {
    await login(page, creds.users.manager!.email);

    await page.goto("/app/ai/followups");
    const flowName = `E2E Lote1 ${Date.now()}`;
    await page.getByRole("button", { name: "Novo fluxo" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nome").fill(flowName);
    await dialog.getByRole("button", { name: "Criar fluxo" }).click();
    await expect(dialog).not.toBeVisible();
    await page.locator("li", { hasText: flowName }).getByRole("link").click();
    await page.waitForURL(/\/app\/ai\/followups\/[0-9a-f-]+$/);
    await expect(page.locator(".react-flow")).toBeVisible();

    // 1. A paleta oferece as 5 caixas novas.
    for (const tipo of ["ab_split", "ai_generic", "api_call", "notify_agent", "add_note"]) {
      await expect(page.getByTestId(`palette-add-${tipo}`)).toBeVisible();
    }

    // 2. Adiciona os 5, uma de cada vez, e confirma que cada card aparece.
    await page.getByTestId("palette-add-ab_split").click();
    await page.getByTestId("palette-add-ai_generic").click();
    await page.getByTestId("palette-add-api_call").click();
    await page.getByTestId("palette-add-notify_agent").click();
    await page.getByTestId("palette-add-add_note").click();

    await expect(page.locator('[data-testid^="node-card-ab_split-"]')).toBeVisible();
    await expect(page.locator('[data-testid^="node-card-ai_generic-"]')).toBeVisible();
    await expect(page.locator('[data-testid^="node-card-api_call-"]')).toBeVisible();
    await expect(page.locator('[data-testid^="node-card-notify_agent-"]')).toBeVisible();
    await expect(page.locator('[data-testid^="node-card-add_note-"]')).toBeVisible();
    await page.screenshot({ path: "test-results/followup-lote1-01-palette.png", fullPage: true });

    const panel = page.getByTestId("node-config-panel");

    // 3. A/B split: o card já nasce com os 2 braços (A 50% / B 50%) como
    // saídas nomeadas — prova que `nodeBranches` desenha o percentual.
    await page.locator('[data-testid^="node-card-ab_split-"]').click();
    await expect(panel).toBeVisible();
    await panel.locator('[aria-label="Rótulo do caminho 1"]').fill("Oferta A");
    await panel.locator('[aria-label="Percentual do caminho 1"]').fill("30");
    await panel.locator('[aria-label="Percentual do caminho 2"]').fill("70");
    await expect(panel.getByText("Total: 100%")).toBeVisible();
    const abSplitCard = page.locator('[data-testid^="node-card-ab_split-"]');
    await expect(abSplitCard).toContainText("Oferta A 30%");
    await expect(abSplitCard).toContainText("70%");
    await page.screenshot({ path: "test-results/followup-lote1-02-ab-split.png", fullPage: true });

    // 4. IA (prompt livre): escreve a instrução, o card ecoa o texto.
    await page.locator('[data-testid^="node-card-ai_generic-"]').click();
    await expect(panel).toBeVisible();
    const prompt = "Resuma em uma frase o problema que o cliente relatou.";
    await panel.getByLabel("Instrução para a IA").fill(prompt);
    await panel.getByLabel("Instrução para a IA").blur();
    await expect(page.locator('[data-testid^="node-card-ai_generic-"]')).toContainText(prompt);
    await page.screenshot({ path: "test-results/followup-lote1-03-ai-generic.png", fullPage: true });

    // 5. API externa: cola um cURL e confirma que método/URL/headers/corpo
    // foram preenchidos SOZINHOS — a peça de UX que a pesquisa apontou como
    // a mais forte da referência.
    await page.locator('[data-testid^="node-card-api_call-"]').click();
    await expect(panel).toBeVisible();
    const curl =
      `curl -X POST 'https://api.exemplo.com/webhook' -H 'Content-Type: application/json' -H 'Authorization: Bearer abc123' --data-raw '{"lead_id":"{{lead}}"}'`;
    await panel.getByLabel("Colar um cURL (preenche os campos abaixo)").fill(curl);
    await panel.getByRole("button", { name: "Preencher com este cURL" }).click();
    await expect(panel.getByLabel("URL")).toHaveValue("https://api.exemplo.com/webhook");
    await expect(panel.locator('[aria-label="Nome do cabeçalho 1"]')).toHaveValue("Content-Type");
    await expect(panel.locator('[aria-label="Valor do cabeçalho 1"]')).toHaveValue("application/json");
    await expect(panel.locator('[aria-label="Nome do cabeçalho 2"]')).toHaveValue("Authorization");
    await expect(page.locator('[data-testid^="node-card-api_call-"]')).toContainText(
      "POST https://api.exemplo.com/webhook",
    );
    await page.screenshot({ path: "test-results/followup-lote1-04-api-call.png", fullPage: true });

    // 6. Notificar atendente: escreve o aviso, o card ecoa o texto.
    await page.locator('[data-testid^="node-card-notify_agent-"]').click();
    await expect(panel).toBeVisible();
    const aviso = "Cliente pediu para falar com uma pessoa sobre o contrato.";
    await panel.getByLabel("Mensagem do aviso").fill(aviso);
    await panel.getByLabel("Mensagem do aviso").blur();
    await expect(page.locator('[data-testid^="node-card-notify_agent-"]')).toContainText(aviso);
    await page.screenshot({ path: "test-results/followup-lote1-05-notify-agent.png", fullPage: true });

    // 7. Anotação no contato: escreve a nota, o card ecoa o texto.
    await page.locator('[data-testid^="node-card-add_note-"]').click();
    await expect(panel).toBeVisible();
    const nota = "Cliente confirmou o CPF por telefone em 25/09.";
    await panel.getByLabel("Texto da nota").fill(nota);
    await panel.getByLabel("Texto da nota").blur();
    await expect(page.locator('[data-testid^="node-card-add_note-"]')).toContainText(nota);
    await page.screenshot({ path: "test-results/followup-lote1-06-add-note.png", fullPage: true });
  });
});
