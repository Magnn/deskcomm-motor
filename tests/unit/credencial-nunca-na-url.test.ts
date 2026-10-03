/**
 * Nenhum formulário de autenticação pode mandar credencial pela URL.
 *
 * ACHADO NO USO REAL, não em teste: percorrendo o produto num navegador com os
 * chunks JavaScript respondendo 500, o clique em "Entrar" fez o submit NATIVO
 * do formulário — e o padrão do HTML é GET. A barra de endereços ficou com
 *
 *     /login?email=qa-wizard%40local.test&password=QaWizard%212026%23Real
 *
 * A senha em texto claro na URL vai para o histórico do navegador, para o log
 * de acesso do servidor e para o cabeçalho `Referer` de qualquer recurso que a
 * página carregue depois. É o mesmo motivo pelo qual a doutrina deste
 * repositório proíbe chave de API em query string.
 *
 * O `onSubmit` do React não protege: ele só existe depois que o bundle carrega,
 * e o caso perigoso é justamente quando ele não carrega. `method="post"` é uma
 * garantia do HTML, que vale antes de qualquer JavaScript.
 *
 * A SEGUNDA forma aceita é a ação do servidor no `action` do formulário, pelo
 * `useActionState`. Ali o `method` não pode ser escrito (o React o recusa e
 * sobrescreve): quem renderiza o `<form>` como POST é o próprio React, no HTML
 * do servidor, antes de qualquer JavaScript — e o Next executa a ação nesse POST
 * nativo. Foi o que consertou o "esqueci a senha", que perdia o clique dado
 * antes de a página carregar (produção, 2026-10-02). A garantia só vale se a
 * função vier de `@/app/actions/` (ação do servidor): uma função do cliente no
 * `action` NÃO vira POST no HTML — por isso a cerca exige a importação.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../components/auth");

/** Os formulários que carregam segredo: senha, código de verificação, e-mail. */
const FORMULARIOS = readdirSync(DIR).filter((f) => f.endsWith("Form.tsx"));

/**
 * `<form action={enviar}>` com `enviar` saído de `useActionState(acao, …)` e
 * `acao` importada de `@/app/actions/` — POST garantido pelo React.
 */
function postPelaAcaoDoServidor(fonte: string): boolean {
  const gancho = /const\s*\[\s*\w+\s*,\s*(\w+)[^\]]*\]\s*=\s*useActionState\s*(?:<[^(]*>)?\(\s*(\w+)/.exec(fonte);
  if (!gancho) return false;
  const [, despachante, acao] = gancho;
  const noForm = new RegExp(`<form\\b[^>]*\\baction=\\{${despachante}\\}`).test(fonte);
  const importada = new RegExp(
    `import\\s*\\{[^}]*\\b${acao}\\b[^}]*\\}\\s*from\\s*"@/app/actions/`,
  ).test(fonte);
  return noForm && importada;
}

describe("formulários de autenticação", () => {
  it("existem formulários para vigiar (guarda de vacuidade)", () => {
    // Sem isto, renomear a pasta deixaria o teste abaixo verde por não ter o
    // que verificar.
    expect(FORMULARIOS.length).toBeGreaterThanOrEqual(5);
  });

  it("nenhum deles faz submit em GET — credencial nunca vai para a URL", () => {
    const semMethod = FORMULARIOS.filter((arquivo) => {
      const fonte = readFileSync(resolve(DIR, arquivo), "utf8");
      if (!/<form\b/.test(fonte)) return false;
      return !/method="post"/.test(fonte) && !postPelaAcaoDoServidor(fonte);
    });

    expect(
      semMethod,
      "sem `method=\"post\"` (nem ação do servidor no `action`), o submit nativo " +
        "(bundle que não carregou) manda senha e código na query string — histórico, log e Referer",
    ).toEqual([]);
  });

  it("a forma pela ação do servidor só vale com a ação vinda do servidor", () => {
    const comAcao = (origem: string) =>
      `import { pedir } from "${origem}";\n` +
      `const [estado, enviar, p] = useActionState<E, FormData>(pedir, null);\n` +
      `return <form action={enviar} className="x">`;

    expect(postPelaAcaoDoServidor(comAcao("@/app/actions/auth/pedir"))).toBe(true);
    // Função do cliente no `action`: o HTML do servidor não sai como POST.
    expect(postPelaAcaoDoServidor(comAcao("@/lib/pedir-no-cliente"))).toBe(false);
    // O despachante existe, mas o formulário não o usa.
    expect(
      postPelaAcaoDoServidor(comAcao("@/app/actions/auth/pedir").replace("action={enviar}", "")),
    ).toBe(false);
  });
});
