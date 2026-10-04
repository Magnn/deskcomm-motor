/**
 * A aba "Jornada" provada pela TELA num banco real, num agente NOVO: o dono começa de um modelo, vê as
 * etapas, simula uma conversa e vê em que etapa ela estaria e o bloco que o agente leria, salva, e o que
 * salvou sobrevive a recarregar a página.
 *
 * O que só a tela real prova (os testes de núcleo, de rota e de componente não juntam):
 *   - a aba abre dentro do app inteiro (layout, tema, sessão) num agente recém-criado;
 *   - o simulador usa a mesma contagem do turno: três números mandados picados contam juntos;
 *   - o clique em "Salvar" chega ao servidor no formato que o schema aceita e o dado fica em
 *     `ai_agents.config.journey`;
 *   - a tela relê o que salvou depois de recarregar.
 *
 * Locale pt-BR fixado: sem isso o navegador de teste roda en-US e a tela mostra outros textos.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect } from "@playwright/test";

import { loginComoAdmin, lerCreds, type CredsE2E } from "./helpers/login-admin";

const EVIDENCIA = path.join(process.cwd(), "evidence", "jornada-do-agente");

let creds: CredsE2E = lerCreds();

test.use({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
test.describe.configure({ timeout: 240_000 });

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(EVIDENCIA, { recursive: true });
  creds = await loginComoAdmin(page, creds);
});

test("agente novo: começar do modelo, simular a conversa, salvar e recarregar", async ({ page }) => {
  const fixtures = (creds as CredsE2E & { followup_agent_fixtures?: { credential_id: string; channel_session_id: string } })
    .followup_agent_fixtures;
  expect(fixtures, "rode scripts/seed-e2e-followup-agent.ts antes (credencial de IA e canal)").toBeTruthy();

  const criado = await page.request.post("/api/v1/ai/agents", {
    data: {
      name: `Leitura com jornada ${Date.now()}`,
      version: {
        system_prompt: "Você atende pelo WhatsApp de um serviço de leitura de cartas. Fale com calma e acolhimento, em pt-BR.",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        credential_id: fixtures!.credential_id,
        channel_session_id: fixtures!.channel_session_id,
      },
    },
  });
  expect(criado.status(), "criar o agente novo").toBe(201);
  const agente = ((await criado.json()) as { data: { agent: { id: string } } }).data.agent.id;

  await page.goto(`/app/ai/agents/${agente}`);
  await page.getByRole("tab", { name: "Jornada" }).click();
  await expect(page.getByTestId("jornada-do-agente")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Usar esta jornada" })).toHaveAttribute("aria-checked", "false");
  await page.screenshot({ path: path.join(EVIDENCIA, "01-aba-vazia.png"), fullPage: true });

  // Começa do modelo: cinco etapas, e a primeira não libera nada.
  await page.getByTestId("modelos-de-jornada").getByRole("button", { name: "Leitura de cartas" }).click();
  await expect(page.getByTestId("etapa-5")).toBeVisible();
  await page.getByRole("switch", { name: "Usar esta jornada" }).click();
  await page.screenshot({ path: path.join(EVIDENCIA, "02-modelo-carregado.png"), fullPage: true });

  // O simulador: os três números chegam picados e contam juntos — a conversa já está na leitura.
  const simulador = page.getByRole("textbox", { name: "Conversa para simular" });
  await simulador.fill(
    [
      "Lead: oi",
      "Agente: Seja bem-vinda. Quer começar a sua leitura?",
      "Lead: quero sim",
      "Agente: Me diga seu primeiro nome e sua data de nascimento.",
      "Lead: Ana, 12/03/1990",
      "Agente: Tenho 22 cartas fechadas. Escolha 3 números de 1 a 22.",
      "Lead: 3",
      "Lead: 6",
    ].join("\n"),
  );
  await expect(page.getByTestId("etapa-simulada")).toContainText("Etapa 3 de 5");
  await expect(page.getByTestId("previa-da-jornada")).toContainText("já disse: 3, 6");
  await expect(page.getByTestId("previa-da-jornada")).toContainText("Ainda NÃO fale de");
  await page.screenshot({ path: path.join(EVIDENCIA, "03-simulador-no-meio-da-escolha.png"), fullPage: true });

  await simulador.press("End");
  await simulador.pressSequentially("\nLead: 9");
  await expect(page.getByTestId("etapa-simulada")).toContainText("Etapa 4 de 5");
  await page.screenshot({ path: path.join(EVIDENCIA, "04-simulador-na-leitura.png"), fullPage: true });

  // Salvar e recarregar: a jornada fica.
  await page.getByRole("button", { name: "Salvar jornada" }).click();
  await expect(page.getByText("Jornada salva. Vale a partir da próxima conversa.")).toBeVisible();
  const lida = await page.request.get(`/api/v1/ai/agents/${agente}/jornada`);
  const corpo = (await lida.json()) as { data: { journey: { enabled: boolean; etapas: Array<{ id: string }> } } };
  expect(corpo.data.journey.enabled).toBe(true);
  expect(corpo.data.journey.etapas.map((e) => e.id)).toEqual(["acolhida", "dados", "escolha", "leitura", "oferta"]);

  await page.reload();
  await page.getByRole("tab", { name: "Jornada" }).click();
  await expect(page.getByRole("switch", { name: "Usar esta jornada" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("etapa-5")).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCIA, "05-depois-de-recarregar.png"), fullPage: true });
});
