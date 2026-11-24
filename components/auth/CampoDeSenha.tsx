"use client";

import { forwardRef, useState, type ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Eye, EyeSlash } from "@/lib/ui/icons";

/**
 * Campo de senha com o olho que mostra/oculta o que foi digitado.
 *
 * `forwardRef` porque os formulários entregam o campo ao `register` do
 * react-hook-form, que precisa do `ref` do `<input>` de verdade.
 * Os rótulos chegam já traduzidos: quem chama sabe de qual senha se trata.
 */
type Props = Omit<ComponentProps<typeof Input>, "type"> & {
  rotuloMostrar: string;
  rotuloOcultar: string;
};

export const CampoDeSenha = forwardRef<HTMLInputElement, Props>(function CampoDeSenha(
  { rotuloMostrar, rotuloOcultar, className, ...props },
  ref,
) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visivel ? "text" : "password"} className={`pr-12 ${className ?? ""}`} {...props} />
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500"
        aria-label={visivel ? rotuloOcultar : rotuloMostrar}
        aria-pressed={visivel}
        onClick={() => setVisivel((v) => !v)}
      >
        {visivel ? <EyeSlash size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
      </button>
    </div>
  );
});
