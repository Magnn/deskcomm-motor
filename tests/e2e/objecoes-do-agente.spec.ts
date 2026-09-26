/**
 * A aba "Objeções" do agente, provada pela TELA num banco real: o dono cadastra objeções (por atalho e do
 * zero), vê o bloco que o agente vai receber, salva, e o que salvou sobrevive a recarregar a página.
 *
 * O que só a tela real prova (e que os testes de componente e de rota, separados, não juntam):
 *   - a aba existe na página do agente e abre sem quebrar dentro do app inteiro (layout, tema, sessão);
 *   - o clique em "Salvar" chega ao servidor no formato que o schema aceita, com a sessão logada;
 *   - o dado fica em `ai_agents.config.objections` e a tela o relê depois de recarregar;
 *   - valor em dinheiro numa resposta é barrado na tela E pelo servidor (a regra "o preço mora só na aba
 *     Preço" não depende de quem chama);
 *   - salvar as objeções NÃO apaga a oferta nem as outras chaves da configuração (merge, não troca) — as
 *     abas estruturadas convivem no mesmo jsonb.
 *
 * Locale pt-BR fixado: sem isso o navegador de teste roda en-US e a tela mostra outros textos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "objecoes-do-agente");

let creds: CredsE2E = lerCreds();

/**
 * Zera a aba pelo MESMO caminho da tela (o PUT): a spec não pode depender do que outra rodada deixou no
 * banco — uma spec que só passa uma vez por banco não é uma boa spec.
 */
async function zerarObjecoes(page: Page, agente: string): Promise<void> {
  const r = await page.request.put(`/api/v1/ai/agents/${agente}/objecoes`, {
    data: { enabled: false, objecoes: [] },
  });
  expect(r.status(), "zerar as objeções pela API").toBe(200);
}

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("um atalho e uma objeção do zero: ver o bloco, salvar e recarregar — as objeções ficam", async ({ page }) => {
  const agente = creds.default_agent_id;
  expect(agente, "o seed de credenciais devia ter criado um agente").toBeTruthy();
  await zerarObjecoes(page, agente!);

  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Objeções" }).click();
  await expect(page.getByTestId("objecoes-do-agente")).toBeVisible();

  // Um agente que nunca usou a aba abre desligado, sem objeção, com os atalhos à vista.
  await expect(page.getByRole("switch", { name: "Usar estas objeções" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText(/Nenhuma objeção ainda/)).toBeVisible();
  await expect(page.getByTestId("sugestoes-de-objecao").getByRole("button", { name: "Vou pensar" })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCIA, "01-aba-vazia.png"), fullPage: true });

  await page.getByRole("switch", { name: "Usar estas objeções" }).click();

  // 1) pelo atalho: a frase vem pronta, falta a resposta.
  await page.getByTestId("sugestoes-de-objecao").getByRole("button", { name: "Vou pensar" }).click();
  await expect(page.getByTestId("objecao-0").getByLabel("Quando a pessoa diz")).toHaveValue("Vou pensar");
  await page
    .getByTestId("objecao-0")
    .getByLabel("O que o agente responde")
    .fill("Sem pressa. Posso te mandar um resumo do que combinamos para você decidir com calma?");
  // O atalho usado some da lista.
  await expect(page.getByTestId("sugestoes-de-objecao").getByRole("button", { name: "Vou pensar" })).toHaveCount(0);

  // 2) do zero.
  await page.getByRole("button", { name: "Adicionar objeção" }).click();
  await page.getByTestId("objecao-1").getByLabel("Quando a pessoa diz").fill("Preciso falar com meu marido");
  await page
    .getByTestId("objecao-1")
    .getByLabel("O que o agente responde")
    .fill("Claro, faz sentido decidir junto. Quer que eu deixe tudo resumido para vocês verem juntos?");

  // A prévia é o bloco REAL que o agente vai ler.
  const previa = page.getByTestId("previa-das-objecoes");
  await expect(previa).toContainText('- Se a pessoa disser algo como "Vou pensar": responda no sentido de "Sem pressa.');
  await expect(previa).toContainText('- Se a pessoa disser algo como "Preciso falar com meu marido"');
  await expect(previa).toContainText("reconheça e siga sem pressionar");
  await page.screenshot({ path: path.join(EVIDENCIA, "02-aba-preenchida.png"), fullPage: true });

  await page.getByRole("button", { name: "Salvar objeções" }).click();
  await expect(page.getByText("Objeções salvas. Valem a partir da próxima conversa.")).toBeVisible();

  // O servidor guardou, no formato do schema.
  const resposta = await page.request.get(`/api/v1/ai/agents/${agente}/objecoes`);
  expect(resposta.status()).toBe(200);
  const corpo = (await resposta.json()) as { data: { objections: Record<string, unknown> | null } };
  expect(corpo.data.objections).toMatchObject({
    enabled: true,
    objecoes: [
      { quando: "Vou pensar", resposta: "Sem pressa. Posso te mandar um resumo do que combinamos para você decidir com calma?" },
      { quando: "Preciso falar com meu marido" },
    ],
  });

  // E a tela o relê depois de recarregar (não é só estado do navegador).
  await page.reload();
  await page.getByRole("tab", { name: "Objeções" }).click();
  await expect(page.getByTestId("objecao-0").getByLabel("Quando a pessoa diz")).toHaveValue("Vou pensar");
  await expect(page.getByTestId("objecao-1").getByLabel("Quando a pessoa diz")).toHaveValue("Preciso falar com meu marido");
  await expect(page.getByRole("switch", { name: "Usar estas objeções" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("previa-das-objecoes")).toContainText('"Vou pensar"');
  await page.screenshot({ path: path.join(EVIDENCIA, "03-depois-de-recarregar.png"), fullPage: true });
});

test("valor em dinheiro numa resposta é barrado pela tela e pelo servidor: o preço mora só na aba Preço", async ({ page }) => {
  const agente = creds.default_agent_id!;
  await zerarObjecoes(page, agente);

  // Pela tela: o aviso diz onde o valor mora, e nada é gravado.
  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Objeções" }).click();
  await page.getByRole("switch", { name: "Usar estas objeções" }).click();
  await page.getByTestId("sugestoes-de-objecao").getByRole("button", { name: "Está caro" }).click();
  await page.getByTestId("objecao-0").getByLabel("O que o agente responde").fill("Fecho por R$ 80 hoje.");
  await page.getByRole("button", { name: "Salvar objeções" }).click();
  await expect(page.getByText("Sem valores em dinheiro na resposta — o preço e o desconto vêm da aba Preço.")).toBeVisible();
  const aposTela = (await (await page.request.get(`/api/v1/ai/agents/${agente}/objecoes`)).json()) as {
    data: { objections: { objecoes: unknown[] } | null };
  };
  expect(aposTela.data.objections?.objecoes ?? []).toHaveLength(0);

  // Pela API, com a mesma sessão de admin: a regra não depende da tela.
  const direto = await page.request.put(`/api/v1/ai/agents/${agente}/objecoes`, {
    data: { enabled: true, objecoes: [{ quando: "Está caro", resposta: "Faço por 80 reais." }] },
  });
  expect(direto.status()).toBe(422);
});

test("salvar as objeções não apaga a oferta: as abas estruturadas convivem no mesmo agente", async ({ page }) => {
  const agente = creds.default_agent_id!;
  await page.goto(`/app/ai/agents/${agente}`);

  // Grava uma oferta (sem depender de outra spec ter rodado antes).
  await page.getByRole("tab", { name: "Oferta" }).click();
  if ((await page.getByRole("switch", { name: "Usar esta oferta" }).getAttribute("aria-checked")) !== "true") {
    await page.getByRole("switch", { name: "Usar esta oferta" }).click();
  }
  if ((await page.getByLabel("Nome do produto").count()) === 0) {
    await page.getByRole("button", { name: "Adicionar produto" }).click();
  }
  await page.getByLabel("Nome do produto").first().fill("Consulta avulsa");
  await page.getByRole("button", { name: "Salvar oferta" }).click();
  await expect(page.getByText(/Oferta salva/)).toBeVisible();

  // Salva as objeções.
  await page.getByRole("tab", { name: "Objeções" }).click();
  await zerarObjecoes(page, agente);
  await page.reload();
  await page.getByRole("tab", { name: "Objeções" }).click();
  await page.getByRole("switch", { name: "Usar estas objeções" }).click();
  await page.getByTestId("sugestoes-de-objecao").getByRole("button", { name: "Não confio" }).click();
  await page.getByTestId("objecao-0").getByLabel("O que o agente responde").fill("Entendo a cautela. Posso te contar exatamente o que você recebe e como funciona a entrega.");
  await page.getByRole("button", { name: "Salvar objeções" }).click();
  await expect(page.getByText(/Objeções salvas/)).toBeVisible();

  // A oferta continua lá, e as objeções também.
  const oferta = (await (await page.request.get(`/api/v1/ai/agents/${agente}/oferta`)).json()) as {
    data: { offer: { enabled: boolean; produtos: Array<{ nome: string }> } | null };
  };
  const objecoes = (await (await page.request.get(`/api/v1/ai/agents/${agente}/objecoes`)).json()) as {
    data: { objections: { enabled: boolean; objecoes: Array<{ quando: string }> } | null };
  };
  expect(oferta.data.offer).toMatchObject({ enabled: true, produtos: [{ nome: "Consulta avulsa" }] });
  expect(objecoes.data.objections).toMatchObject({ enabled: true, objecoes: [{ quando: "Não confio" }] });
});
