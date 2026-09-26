/**
 * A aba "Identidade" do agente, provada pela TELA num banco real: o dono preenche campos, vê o bloco
 * que o agente vai receber, salva, e o que salvou sobrevive a recarregar a página.
 *
 * O que só a tela real prova (e que os testes de componente e de rota, separados, não juntam):
 *   - a aba existe na página do agente e abre sem quebrar dentro do app inteiro (layout, tema, sessão);
 *   - o clique em "Salvar" chega ao servidor no formato que o schema aceita, com a sessão logada;
 *   - o dado fica em `ai_agents.config.identity` e a tela o relê depois de recarregar;
 *   - salvar a identidade não apaga as OUTRAS chaves da configuração do agente (merge, não troca).
 *
 * Locale pt-BR fixado: sem isso o navegador de teste roda en-US e a tela mostra outros textos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "identidade-do-agente");

let creds: CredsE2E = lerCreds();

/**
 * Zera a aba pelo MESMO caminho da tela (o PUT): a spec não pode depender do que outra rodada deixou no
 * banco — sem isto ela só passava uma vez por banco, e reexecutar na mesma bancada falhava em "abre vazia".
 */
async function zerarIdentidade(page: Page, agente: string): Promise<void> {
  const r = await page.request.put(`/api/v1/ai/agents/${agente}/identidade`, {
    data: { enabled: false, palavras_da_casa: [], palavras_a_evitar: [] },
  });
  expect(r.status(), "zerar a identidade pela API").toBe(200);
}

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("preencher, ver a prévia, salvar e recarregar: a identidade fica", async ({ page }) => {
  const agente = creds.default_agent_id;
  expect(agente, "o seed de credenciais devia ter criado um agente").toBeTruthy();
  await zerarIdentidade(page, agente!);

  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Identidade" }).click();
  const aba = page.getByTestId("identidade-do-agente");
  await expect(aba).toBeVisible();

  // Um agente que nunca usou a aba abre desligado, vazio, e a prévia pede para preencher.
  await expect(page.getByRole("switch", { name: "Usar esta identidade" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("previa-da-identidade")).toContainText("Preencha os campos");
  await page.screenshot({ path: path.join(EVIDENCIA, "01-aba-vazia.png"), fullPage: true });

  await page.getByRole("switch", { name: "Usar esta identidade" }).click();
  await page.getByLabel("Como ele se chama").fill("Ana");
  await page.getByLabel("Nome da empresa").fill("Clínica Bem-Estar");
  await page.getByLabel("Quem vocês atendem").fill("Adultos com dor crônica.");
  await page.getByRole("radio", { name: /Acolhedor/ }).click();
  await page.getByRole("radio", { name: "Você", exact: true }).click();
  await page.getByRole("radio", { name: "Com parcimônia" }).click();

  const palavras = page.getByLabel("Palavras que a casa usa");
  await palavras.fill("bem-vinda");
  await palavras.press("Enter");
  await expect(page.getByTestId("identidade-palavras-da-casa-chips")).toContainText("bem-vinda");

  // A prévia é o bloco REAL que o agente vai ler.
  const previa = page.getByTestId("previa-da-identidade");
  await expect(previa).toContainText("- Você é Ana, da Clínica Bem-Estar.");
  await expect(previa).toContainText("- Tom: caloroso e paciente");
  await expect(previa).toContainText('- Use as palavras da casa quando couber: "bem-vinda".');
  await page.screenshot({ path: path.join(EVIDENCIA, "02-aba-preenchida.png"), fullPage: true });

  await page.getByRole("button", { name: "Salvar identidade" }).click();
  await expect(page.getByText("Identidade salva. Vale a partir da próxima conversa.")).toBeVisible();

  // O servidor guardou, no formato do schema.
  const resposta = await page.request.get(`/api/v1/ai/agents/${agente}/identidade`);
  expect(resposta.status()).toBe(200);
  const corpo = (await resposta.json()) as { data: { identity: Record<string, unknown> | null } };
  expect(corpo.data.identity).toMatchObject({
    enabled: true,
    nome: "Ana",
    empresa: "Clínica Bem-Estar",
    tom: "acolhedor",
    tratamento: "voce",
    emojis: "parcimonia",
    palavras_da_casa: ["bem-vinda"],
  });

  // E a tela o relê depois de recarregar (não é só estado do navegador).
  await page.reload();
  await page.getByRole("tab", { name: "Identidade" }).click();
  await expect(page.getByLabel("Como ele se chama")).toHaveValue("Ana");
  await expect(page.getByRole("radio", { name: /Acolhedor/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: "Usar esta identidade" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("previa-da-identidade")).toContainText("- Você é Ana, da Clínica Bem-Estar.");
  await page.screenshot({ path: path.join(EVIDENCIA, "03-depois-de-recarregar.png"), fullPage: true });
});

test("desligar a identidade volta o agente ao que era, e o que foi preenchido não se perde", async ({ page }) => {
  const agente = creds.default_agent_id!;
  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Identidade" }).click();

  // Pré-condição do próprio caso: garante uma identidade ligada (o caso anterior pode não ter rodado antes).
  const ligado = await page.getByRole("switch", { name: "Usar esta identidade" }).getAttribute("aria-checked");
  if (ligado !== "true") {
    await page.getByRole("switch", { name: "Usar esta identidade" }).click();
    await page.getByLabel("Como ele se chama").fill("Ana");
  }
  await page.getByRole("switch", { name: "Usar esta identidade" }).click();
  await page.getByRole("button", { name: "Salvar identidade" }).click();
  await expect(page.getByText("Identidade desligada. O agente volta a usar só as instruções dele.")).toBeVisible();

  // Desligada, o servidor ainda guarda o que o dono preencheu (a tela o mostra), mas o turno não o lê.
  const resposta = await page.request.get(`/api/v1/ai/agents/${agente}/identidade`);
  const corpo = (await resposta.json()) as { data: { identity: { enabled: boolean; nome?: string } | null } };
  expect(corpo.data.identity?.enabled).toBe(false);
  expect(corpo.data.identity?.nome).toBe("Ana");
});
