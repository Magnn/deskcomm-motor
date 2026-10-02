/**
 * O rótulo do formulário do nó Pixel ("Compra") e o nome do evento na plataforma ("Purchase").
 * Puro e sem dependência de servidor: o editor (navegador) e o publish usam a mesma régua do envio.
 */
import { EVENTOS_DE_CONVERSAO, type NomeDoEvento } from "./types";

export function eventoDoNo(tipo: string): NomeDoEvento | null {
  const t = tipo.trim();
  if (t.toLowerCase() === "compra") return "Purchase";
  return (EVENTOS_DE_CONVERSAO as readonly string[]).includes(t) ? (t as NomeDoEvento) : null;
}
