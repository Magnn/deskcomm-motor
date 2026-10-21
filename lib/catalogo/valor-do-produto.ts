/**
 * O VALOR DO PRODUTO DO CATÁLOGO É O DO CATÁLOGO — a trava no envio, irmã de `valorErradoDeExtra`
 * (`lib/preco/valor-do-extra.ts`), que só olha as cobranças avulsas.
 *
 * Medido em 21/10/2026: a agente ofereceu a Oração dos Sonhos (R$ 35 no catálogo) dizendo "Fica R$ 130,
 * pagamento único" — o valor do trabalho. A pessoa tinha comprado só uma pergunta, então o bloco do catálogo
 * não estava no turno, e o único preço que o modelo via era o do trabalho.
 *
 * A regra, de propósito estreita: a mensagem fala de UM produto do catálogo pelo nome, diz valor, e nenhum
 * valor dito é o desse produto → recusa, com o valor certo. Mensagem que cita dois produtos ou o trabalho
 * principal fica de fora (não dá para saber de qual valor se fala). Pura.
 */
import { valoresDitos } from "@/lib/preco/valor-do-extra";
import { reais } from "@/lib/preco/tipos";

import type { CatalogoConfig } from "./tipos";

const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function valorErradoDeProduto(corpo: string, catalogo: CatalogoConfig | null | undefined): string | null {
  if (!catalogo || !catalogo.enabled) return null;
  const texto = semAcento(corpo);
  const citados = catalogo.produtos.filter((p) => p.ativo && semAcento(p.nome).length >= 4 && texto.includes(semAcento(p.nome)));
  if (citados.length !== 1) return null;
  const p = citados[0]!;
  // O trabalho principal citado junto: a mensagem pode estar comparando os dois.
  if (/\btrabalh/i.test(texto) && !semAcento(p.nome).includes("trabalh")) return null;
  const valores = valoresDitos(corpo);
  if (valores.length === 0 || valores.includes(p.preco_cents)) return null;
  return (
    `O valor de *${p.nome}* é ${reais(p.preco_cents)}, pagamento único — é o que está no catálogo. A sua mensagem diz ` +
    `${reais(valores[0]!)}. Reescreva com ${reais(p.preco_cents)} e não cite outro valor para ${p.nome}.`
  );
}
