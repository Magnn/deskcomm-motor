/**
 * Economia de mensagem cobrada: quando o provedor carimbou a última mensagem do contato como
 * cobrada, o turno responde em uma mensagem só. Ver o cabeçalho do módulo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  cobradoPorMensagem,
  CONSULTA_DA_ULTIMA_COBRANCA,
  INSTRUCAO_DE_MENSAGEM_UNICA,
  ultimoTipoDeCobrancaDoContato,
} from "@/lib/agent-engine/agent/economia-de-mensagem-cobrada";

describe("cobradoPorMensagem", () => {
  it("só a mensagem carimbada como cobrada liga a economia", () => {
    expect(cobradoPorMensagem("regular")).toBe(true);
  });

  it("gratuita por anúncio, gratuita por atendimento e 'o provedor não disse' não ligam", () => {
    expect(cobradoPorMensagem("free_entry_point")).toBe(false);
    expect(cobradoPorMensagem("free_customer_service")).toBe(false);
    expect(cobradoPorMensagem(null)).toBe(false);
    expect(cobradoPorMensagem(undefined)).toBe(false);
  });

  it("tipo que o produto não conhece não liga: economia só com cobrança afirmada", () => {
    expect(cobradoPorMensagem("tipo_novo_do_provedor")).toBe(false);
  });
});

describe("ultimoTipoDeCobrancaDoContato", () => {
  it("lê a última mensagem ENVIADA ao contato sobre a qual o provedor se pronunciou, na organização", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ billing_type: "regular" }] });
    const tipo = await ultimoTipoDeCobrancaDoContato({ query } as never, "org-1", "contato-1");
    expect(tipo).toBe("regular");
    expect(query).toHaveBeenCalledWith(CONSULTA_DA_ULTIMA_COBRANCA, ["org-1", "contato-1"]);
    for (const trecho of [
      "organization_id = $1",
      "contact_id = $2",
      "direction = 'outbound'",
      "billing_type is not null",
      "order by created_at desc",
    ]) {
      expect(CONSULTA_DA_ULTIMA_COBRANCA, trecho).toContain(trecho);
    }
  });

  it("contato sem nenhuma mensagem carimbada devolve null", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    expect(await ultimoTipoDeCobrancaDoContato({ query } as never, "org-1", "contato-1")).toBeNull();
  });
});

describe("o turno usa a economia", () => {
  const turno = readFileSync(
    join(__dirname, "..", "..", "lib", "agent-engine", "agent", "inbound-turn.ts"),
    "utf8",
  );

  it("o fatiamento em bolhas e a pausa da 1ª bolha leem a decisão do turno, não a configuração crua", () => {
    expect(turno).toContain(
      "const dividirEmBolhas = (agentConfig?.splitMessages ?? false) && !contatoCobradoPorMensagem;",
    );
    expect(turno).toContain("enabled: dividirEmBolhas,");
    expect(turno).not.toContain("enabled: agentConfig?.splitMessages");
  });

  it("contato cobrado recebe a instrução de mensagem única no lugar da instrução de bolhas", () => {
    expect(turno).toContain("? INSTRUCAO_DE_MENSAGEM_UNICA");
    expect(INSTRUCAO_DE_MENSAGEM_UNICA).toContain("UMA única mensagem");
  });

  it("falha ao ler a cobrança não derruba o turno: segue como estava configurado", () => {
    const i = turno.indexOf("let contatoCobradoPorMensagem = false;");
    const bloco = turno.slice(i, turno.indexOf("const dividirEmBolhas", i));
    expect(bloco).toContain("} catch {");
    expect(bloco).toContain("contatoCobradoPorMensagem = false;");
  });
});
