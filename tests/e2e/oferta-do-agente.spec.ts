/**
 * A aba "Oferta" do agente, provada pela TELA num banco real: o dono cadastra um produto, vê o bloco que o
 * agente vai receber, salva, e o que salvou sobrevive a recarregar a página.
 *
 * O que só a tela real prova (e que os testes de componente e de rota, separados, não juntam):
 *   - a aba existe na página do agente e abre sem quebrar dentro do app inteiro (layout, tema, sessão);
 *   - o clique em "Salvar" chega ao servidor no formato que o schema aceita, com a sessão logada;
 *   - o dado fica em `ai_agents.config.offer` e a tela o relê depois de recarregar;
 *   - salvar a oferta NÃO apaga a identidade nem as outras chaves da configuração (merge, não troca) — as
 *     duas abas estruturadas convivem no mesmo jsonb.
 *
 * Locale pt-BR fixado: sem isso o navegador de teste roda en-US e a tela mostra outros textos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "oferta-do-agente");

let creds: CredsE2E = lerCreds();

/**
 * Zera a aba pelo MESMO caminho da tela (o PUT): a spec não pode depender do que outra rodada deixou no
 * banco — sem isto ela só passava uma vez por banco, e reexecutar na mesma bancada falhava em "abre vazia".
 */
async function zerarOferta(page: Page, agente: string): Promise<void> {
  const r = await page.request.put(`/api/v1/ai/agents/${agente}/oferta`, {
    data: { enabled: false, produtos: [], nao_oferecemos: [] },
  });
  expect(r.status(), "zerar a oferta pela API").toBe(200);
}

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("cadastrar um produto, ver o bloco, salvar e recarregar: a oferta fica", async ({ page }) => {
  const agente = creds.default_agent_id;
  expect(agente, "o seed de credenciais devia ter criado um agente").toBeTruthy();
  await zerarOferta(page, agente!);

  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Oferta" }).click();
  await expect(page.getByTestId("oferta-do-agente")).toBeVisible();

  // Um agente que nunca usou a aba abre desligado, sem produto, e a prévia pede para preencher.
  await expect(page.getByRole("switch", { name: "Usar esta oferta" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Nenhum produto ainda/)).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCIA, "01-aba-vazia.png"), fullPage: true });

  await page.getByRole("switch", { name: "Usar esta oferta" }).click();
  await page.getByRole("button", { name: "Adicionar produto" }).click();
  await page.getByLabel("Nome do produto").fill("Leitura Completa");
  await page.getByLabel("O que é").fill("Uma leitura de tarot por escrito.");
  const inclui = page.getByLabel("O que inclui");
  await inclui.fill("PDF de 10 páginas");
  await inclui.press("Enter");
  await inclui.fill("uma dúvida respondida");
  await inclui.press("Enter");
  await page.getByLabel("Como é entregue").fill("Por e-mail, em até 24 horas.");
  await page.getByLabel("Garantia e reembolso (opcional)").fill("Se não gostar em 7 dias, devolvemos o valor.");
  const naoOferece = page.getByLabel("O que a empresa não oferece");
  await naoOferece.fill("atendimento por telefone");
  await naoOferece.press("Enter");

  // A prévia é o bloco REAL que o agente vai ler.
  const previa = page.getByTestId("previa-da-oferta");
  await expect(previa).toContainText("- Leitura Completa: Uma leitura de tarot por escrito.");
  await expect(previa).toContainText("Inclui: PDF de 10 páginas; uma dúvida respondida.");
  await expect(previa).toContainText("- Nunca prometa nem ofereça: atendimento por telefone.");
  await page.screenshot({ path: path.join(EVIDENCIA, "02-aba-preenchida.png"), fullPage: true });

  await page.getByRole("button", { name: "Salvar oferta" }).click();
  await expect(page.getByText("Oferta salva. Vale a partir da próxima conversa.")).toBeVisible();

  // O servidor guardou, no formato do schema.
  const resposta = await page.request.get(`/api/v1/ai/agents/${agente}/oferta`);
  expect(resposta.status()).toBe(200);
  const corpo = (await resposta.json()) as { data: { offer: Record<string, unknown> | null } };
  expect(corpo.data.offer).toMatchObject({
    enabled: true,
    produtos: [
      {
        nome: "Leitura Completa",
        resumo: "Uma leitura de tarot por escrito.",
        inclui: ["PDF de 10 páginas", "uma dúvida respondida"],
        entrega: "Por e-mail, em até 24 horas.",
      },
    ],
    garantia: "Se não gostar em 7 dias, devolvemos o valor.",
    nao_oferecemos: ["atendimento por telefone"],
  });

  // E a tela o relê depois de recarregar (não é só estado do navegador).
  await page.reload();
  await page.getByRole("tab", { name: "Oferta" }).click();
  await expect(page.getByLabel("Nome do produto")).toHaveValue("Leitura Completa");
  await expect(page.getByRole("switch", { name: "Usar esta oferta" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("previa-da-oferta")).toContainText("- Leitura Completa:");
  await page.screenshot({ path: path.join(EVIDENCIA, "03-depois-de-recarregar.png"), fullPage: true });
});

test("salvar a oferta não apaga a identidade: as duas abas estruturadas convivem no mesmo agente", async ({ page }) => {
  const agente = creds.default_agent_id!;
  await page.goto(`/app/ai/agents/${agente}`);

  // Grava uma identidade (sem depender de outra spec ter rodado antes).
  await page.getByRole("tab", { name: "Identidade" }).click();
  if ((await page.getByRole("switch", { name: "Usar esta identidade" }).getAttribute("aria-checked")) !== "true") {
    await page.getByRole("switch", { name: "Usar esta identidade" }).click();
  }
  await page.getByLabel("Como ele se chama").fill("Ana");
  await page.getByRole("button", { name: "Salvar identidade" }).click();
  await expect(page.getByText(/Identidade salva/)).toBeVisible();

  // Salva a oferta.
  await page.getByRole("tab", { name: "Oferta" }).click();
  if ((await page.getByRole("switch", { name: "Usar esta oferta" }).getAttribute("aria-checked")) !== "true") {
    await page.getByRole("switch", { name: "Usar esta oferta" }).click();
  }
  if ((await page.getByLabel("Nome do produto").count()) === 0) {
    await page.getByRole("button", { name: "Adicionar produto" }).click();
    await page.getByLabel("Nome do produto").fill("Consulta avulsa");
  }
  await page.getByRole("button", { name: "Salvar oferta" }).click();
  await expect(page.getByText(/Oferta salva/)).toBeVisible();

  // A identidade continua lá, e a oferta também.
  const identidade = await page.request.get(`/api/v1/ai/agents/${agente}/identidade`);
  const oferta = await page.request.get(`/api/v1/ai/agents/${agente}/oferta`);
  const i = (await identidade.json()) as { data: { identity: { enabled: boolean; nome?: string } | null } };
  const o = (await oferta.json()) as { data: { offer: { enabled: boolean } | null } };
  expect(i.data.identity).toMatchObject({ enabled: true, nome: "Ana" });
  expect(o.data.offer?.enabled).toBe(true);
});
