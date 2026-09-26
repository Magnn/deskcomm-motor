/**
 * A aba "Limites" do agente, provada pela TELA num banco real: o dono lista o que o agente nunca diz e os
 * assuntos que não discute (à mão e por atalho), vê o bloco que o agente vai receber, salva, e o que salvou
 * sobrevive a recarregar a página.
 *
 * O que só a tela real prova (e que os testes de componente e de rota, separados, não juntam):
 *   - a aba existe na página do agente e abre sem quebrar dentro do app inteiro (layout, tema, sessão);
 *   - o clique em "Salvar" chega ao servidor no formato que o schema aceita, com a sessão logada;
 *   - o dado fica em `ai_agents.config.limits` e a tela o relê depois de recarregar;
 *   - o servidor recusa o que a tela não deixa entrar (ponto e vírgula num item) mesmo quando quem chama é a
 *     API com a mesma sessão de admin;
 *   - salvar os limites NÃO apaga as objeções nem as outras chaves da configuração (merge, não troca).
 *
 * Locale pt-BR fixado: sem isso o navegador de teste roda en-US e a tela mostra outros textos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "limites-do-agente");

let creds: CredsE2E = lerCreds();

/**
 * Zera a aba pelo MESMO caminho da tela (o PUT): a spec não pode depender do que outra rodada deixou no
 * banco — uma spec que só passa uma vez por banco não é uma boa spec.
 */
async function zerarLimites(page: Page, agente: string): Promise<void> {
  const r = await page.request.put(`/api/v1/ai/agents/${agente}/limites`, {
    data: { enabled: false, nunca_diz: [], evita_assuntos: [] },
  });
  expect(r.status(), "zerar os limites pela API").toBe(200);
}

test.use({ locale: "pt-BR" });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("listar o que nunca diz e os assuntos, ver o bloco, salvar e recarregar: os limites ficam", async ({ page }) => {
  const agente = creds.default_agent_id;
  expect(agente, "o seed de credenciais devia ter criado um agente").toBeTruthy();
  await zerarLimites(page, agente!);

  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Limites" }).click();
  await expect(page.getByTestId("limites-do-agente")).toBeVisible();

  // Um agente que nunca usou a aba abre desligado, vazio, com os atalhos à vista.
  await expect(page.getByRole("switch", { name: "Usar estes limites" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("sugestoes-nunca-diz").getByRole("button", { name: "garantia de resultado" })).toBeVisible();
  await expect(page.getByTestId("previa-dos-limites")).toContainText("Preencha os campos");
  await page.screenshot({ path: path.join(EVIDENCIA, "01-aba-vazia.png"), fullPage: true });

  await page.getByRole("switch", { name: "Usar estes limites" }).click();

  // Um item à mão, um por atalho, e um assunto por atalho.
  const nunca = page.getByLabel("Nunca diz nem promete");
  await nunca.fill("prazo de entrega fora da oferta");
  await nunca.press("Enter");
  await page.getByTestId("sugestoes-nunca-diz").getByRole("button", { name: "garantia de resultado" }).click();
  await page.getByTestId("sugestoes-assuntos").getByRole("button", { name: "política" }).click();
  // O atalho usado some da lista.
  await expect(page.getByTestId("sugestoes-nunca-diz").getByRole("button", { name: "garantia de resultado" })).toHaveCount(0);

  // A prévia é o bloco REAL que o agente vai ler.
  const previa = page.getByTestId("previa-dos-limites");
  await expect(previa).toContainText("- Nunca diga nem prometa: prazo de entrega fora da oferta; garantia de resultado.");
  await expect(previa).toContainText("- Não discuta estes assuntos: política.");
  await expect(previa).toContainText("ofereça chamar uma pessoa da equipe");
  await page.screenshot({ path: path.join(EVIDENCIA, "02-aba-preenchida.png"), fullPage: true });

  await page.getByRole("button", { name: "Salvar limites" }).click();
  await expect(page.getByText("Limites salvos. Valem a partir da próxima conversa.")).toBeVisible();

  // O servidor guardou, no formato do schema.
  const resposta = await page.request.get(`/api/v1/ai/agents/${agente}/limites`);
  expect(resposta.status()).toBe(200);
  const corpo = (await resposta.json()) as { data: { limits: Record<string, unknown> | null } };
  expect(corpo.data.limits).toEqual({
    enabled: true,
    nunca_diz: ["prazo de entrega fora da oferta", "garantia de resultado"],
    evita_assuntos: ["política"],
  });

  // E a tela o relê depois de recarregar (não é só estado do navegador).
  await page.reload();
  await page.getByRole("tab", { name: "Limites" }).click();
  await expect(page.getByRole("switch", { name: "Usar estes limites" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("limites-nunca-diz-chips")).toContainText("prazo de entrega fora da oferta");
  await expect(page.getByTestId("limites-assuntos-chips")).toContainText("política");
  await expect(page.getByTestId("previa-dos-limites")).toContainText("- Não discuta estes assuntos: política.");
  await page.screenshot({ path: path.join(EVIDENCIA, "03-depois-de-recarregar.png"), fullPage: true });
});

test("o servidor recusa o que a tela não deixa entrar: ponto e vírgula num item é 422 pela API, com a mesma sessão", async ({ page }) => {
  const agente = creds.default_agent_id!;
  await zerarLimites(page, agente);

  // Pela tela: o campo barra o item e nada é gravado.
  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Limites" }).click();
  const nunca = page.getByLabel("Nunca diz nem promete");
  await nunca.fill("entrega; frete");
  await nunca.press("Enter");
  await expect(page.getByTestId("limites-nunca-diz-chips")).toBeEmpty();

  // Pela API, com a mesma sessão de admin: a regra não depende da tela.
  const direto = await page.request.put(`/api/v1/ai/agents/${agente}/limites`, {
    data: { enabled: true, nunca_diz: ["entrega; frete"], evita_assuntos: [] },
  });
  expect(direto.status()).toBe(422);
  const aposApi = (await (await page.request.get(`/api/v1/ai/agents/${agente}/limites`)).json()) as {
    data: { limits: { nunca_diz: string[] } | null };
  };
  expect(aposApi.data.limits?.nunca_diz ?? []).toHaveLength(0);
});

test("salvar os limites não apaga as objeções: as abas estruturadas convivem no mesmo agente", async ({ page }) => {
  const agente = creds.default_agent_id!;

  // Grava uma objeção pela mesma rota da tela (sem depender de outra spec ter rodado antes).
  const objecao = await page.request.put(`/api/v1/ai/agents/${agente}/objecoes`, {
    data: { enabled: true, objecoes: [{ quando: "Vou pensar", resposta: "Sem pressa. Posso te mandar um resumo?" }] },
  });
  expect(objecao.status()).toBe(200);

  // Salva os limites pela tela.
  await zerarLimites(page, agente);
  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Limites" }).click();
  await page.getByRole("switch", { name: "Usar estes limites" }).click();
  await page.getByTestId("sugestoes-nunca-diz").getByRole("button", { name: "garantia de resultado" }).click();
  await page.getByRole("button", { name: "Salvar limites" }).click();
  await expect(page.getByText(/Limites salvos/)).toBeVisible();

  // As objeções continuam lá, e os limites também.
  const objecoes = (await (await page.request.get(`/api/v1/ai/agents/${agente}/objecoes`)).json()) as {
    data: { objections: { enabled: boolean; objecoes: Array<{ quando: string }> } | null };
  };
  const limites = (await (await page.request.get(`/api/v1/ai/agents/${agente}/limites`)).json()) as {
    data: { limits: { enabled: boolean; nunca_diz: string[] } | null };
  };
  expect(objecoes.data.objections).toMatchObject({ enabled: true, objecoes: [{ quando: "Vou pensar" }] });
  expect(limites.data.limits).toMatchObject({ enabled: true, nunca_diz: ["garantia de resultado"] });
});
