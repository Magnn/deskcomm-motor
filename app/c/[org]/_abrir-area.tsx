"use client";

/**
 * "A sua área já está aberta" — depois da leitura paga de um quiz ou da sinastria, a pessoa entra na área sem pedir
 * código (`lib/area-do-cliente/entrada-pela-compra.ts`). O cartão só aparece quando a sessão abriu de verdade; se a
 * entrada falhar, nada aparece e o caminho de sempre continua valendo (Entrar com o e-mail).
 */
import { useEffect, useRef, useState } from "react";

import { CARTAO, SERIF, SOBRETITULO } from "./_tema";

export interface TextosDoAbrirArea {
  areaSobretitulo: string;
  areaTitulo: string;
  areaTexto: string;
  areaBotao: string;
}

export function AbrirMinhaArea({ url, segredo, cor, tx }: { url: string; segredo: string; cor: string; tx: TextosDoAbrirArea }) {
  const [area, setArea] = useState<string | null>(null);
  const pedido = useRef(false);

  useEffect(() => {
    if (pedido.current) return;
    pedido.current = true;
    void (async () => {
      // O aviso de pagamento pode ter acabado de chegar: três tentativas, e só repete em falha passageira.
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        try {
          const r = await fetch(url, { method: "POST", headers: { "x-segredo": segredo }, credentials: "same-origin" });
          if (r.ok) {
            const { data } = (await r.json()) as { data: { area: string } };
            setArea(data.area);
            return;
          }
          if (r.status !== 402 && r.status !== 429 && r.status < 500) return;
        } catch {
          /* rede: tenta de novo */
        }
        await new Promise((ok) => setTimeout(ok, 2500));
      }
    })();
  }, [url, segredo]);

  if (!area) return null;
  return (
    <section className={`${CARTAO} text-center`} data-testid="quiz-abrir-area">
      <p className={SOBRETITULO}>{tx.areaSobretitulo}</p>
      <h3 className={`${SERIF} mt-2 text-[24px] leading-tight text-[#f6e3a8]`}>{tx.areaTitulo}</h3>
      <p className="mt-2 text-[15px] text-[#c3bad3]">{tx.areaTexto}</p>
      <a
        href={area}
        className="mt-5 inline-flex w-full items-center justify-center rounded-full px-6 py-4 text-[17px] font-bold text-white ring-1 ring-white/15 transition hover:brightness-110"
        style={{ background: cor }}
        data-testid="quiz-abrir-area-botao"
      >
        {tx.areaBotao} →
      </a>
    </section>
  );
}
