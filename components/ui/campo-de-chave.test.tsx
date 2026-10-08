/**
 * O campo de chave não pode ser alvo do preenchimento de senha do navegador.
 *
 * Medido em produção em 07/10/2026: o diálogo "Adicionar credencial" abria com o campo "Chave" já
 * preenchido com a senha de login salva no Chrome — `type="password"` com `autoComplete="off"`, que o
 * navegador ignora em campo de senha.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CampoDeChave } from "./campo-de-chave";

const RAIZ = join(__dirname, "..", "..");

describe("CampoDeChave", () => {
  it("não é um campo de senha: fica fora do preenchimento e da oferta de salvar senha", () => {
    render(<CampoDeChave aria-label="Chave" />);
    const campo = screen.getByLabelText("Chave");
    expect(campo).toHaveAttribute("type", "text");
    expect(campo).toHaveAttribute("autocomplete", "off");
    expect(campo).toHaveAttribute("data-1p-ignore");
    expect(campo).toHaveAttribute("data-lpignore", "true");
  });

  it("esconde o que é digitado pelo CSS, e não pelo tipo do campo", () => {
    render(<CampoDeChave aria-label="Chave" className="extra" />);
    const campo = screen.getByLabelText("Chave");
    expect(campo.className).toContain("[-webkit-text-security:disc]");
    expect(campo.className).toContain("extra");
  });

  it("quem usa não consegue devolver o campo a `type=password`", () => {
    // @ts-expect-error `type` e `autoComplete` não são aceitos — é o que o campo existe para fixar.
    render(<CampoDeChave aria-label="Chave" type="password" />);
    // E mesmo que alguém force pelo `any`, o que o campo fixa vence o que chega por props.
    expect(screen.getByLabelText("Chave")).toHaveAttribute("type", "text");
  });

  it("os campos de chave de IA usam este componente, sem `type=password` sobrando", () => {
    for (const arquivo of [
      "app/app/ai/credentials/_components/AddCredentialDialog.tsx",
      "app/app/ai/credentials/_components/RotateCredentialDialog.tsx",
      "app/app/ai/agents/[id]/_components/VozDoAgente.tsx",
      "components/ai/ChaveDeConhecimento.tsx",
      "app/onboarding/setup-ai/_inteligencia.tsx",
    ]) {
      const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
      expect(fonte, arquivo).toContain("<CampoDeChave");
      expect(fonte, arquivo).not.toContain('type="password"');
    }
  });
});
