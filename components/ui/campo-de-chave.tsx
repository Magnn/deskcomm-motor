import * as React from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

/**
 * Campo para SEGREDO QUE NÃO É SENHA DE LOGIN — chave de API, token de provedor.
 *
 * `type="password"` com `autoComplete="off"` não serve: o navegador ignora o `off` em campo de senha.
 * Medido na tela de Credenciais de produção em 07/10/2026 — o diálogo "Adicionar credencial" abria
 * com o campo "Chave" já preenchido com a senha de login salva no Chrome. Quem clicasse em salvar sem
 * reparar gravaria a própria senha como chave de API; e, ao colar a chave de verdade, o navegador
 * oferecia guardá-la como a senha do site.
 *
 * Por isso o campo é `type="text"` — fora do alcance do preenchimento de senha e da oferta de salvar —
 * e os caracteres são escondidos pelo CSS (`-webkit-text-security`). Onde o navegador não entende a
 * propriedade, a chave aparece enquanto é digitada: pior para quem tem alguém olhando a tela, e ainda
 * melhor do que gravar a senha errada.
 *
 * Senha de LOGIN continua em `<Input type="password">` com o `autoComplete` certo: ali o
 * preenchimento do navegador é o comportamento desejado.
 */
const CampoDeChave = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type" | "autoComplete">
>(({ className, ...props }, ref) => (
  <Input
    // As props de quem usa vêm ANTES: o que este campo fixa (tipo e preenchimento) vence sempre.
    {...props}
    ref={ref}
    type="text"
    autoComplete="off"
    autoCapitalize="off"
    autoCorrect="off"
    spellCheck={false}
    // Gerenciadores de senha que não respeitam `autoComplete` leem estes atributos.
    data-1p-ignore
    data-lpignore="true"
    data-bwignore
    data-form-type="other"
    className={cn("[-webkit-text-security:disc]", className)}
  />
));
CampoDeChave.displayName = "CampoDeChave";

export { CampoDeChave };
