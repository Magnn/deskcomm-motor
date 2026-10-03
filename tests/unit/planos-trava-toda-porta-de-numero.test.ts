/**
 * TODA PORTA QUE CRIA NÚMERO PASSA PELA TRAVA DO PLANO.
 *
 * O produto vendido como serviço cobra para conectar número. A trava
 * (`travaDeNovoNumero`) só vale se estiver em TODAS as portas: uma rota nova que
 * crie número sem chamá-la é um plano grátis com número ilimitado, e ninguém
 * percebe até olhar a fatura.
 *
 * Esta cerca varre o código atrás dos dois jeitos de um número nascer — o INSERT
 * em `channel_sessions` e a reserva do WhatsApp por QR (`connectWahaChannel`) — e
 * cobra de cada arquivo uma de duas coisas: chamar a trava, ou estar declarado
 * abaixo com o motivo.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Quem cria número SEM chamar a trava no próprio arquivo, e por quê. */
const DECLARADAS: Record<string, string> = {
  "lib/channels/connect.ts":
    "Grava o que a rota app/api/v1/channels/partner/route.ts manda — e é ela que chama a trava antes.",
  "lib/channels/graph-parceiro/session.ts":
    "Grava o que a rota app/api/v1/channels/graph-partner/route.ts manda — e é ela que chama a trava antes.",
  "lib/channels/connect-waha.ts":
    "É a função; quem a chama são as duas rotas de QR code (Conexões e onboarding), e as duas chamam a trava.",
  "lib/channels/social/store.ts":
    "Conta de rede social (Instagram e afins), não número de WhatsApp: o plano cobra número.",
  "lib/channels/messenger/paginas.ts":
    "Página do Facebook (Messenger), não número de WhatsApp: o plano cobra número.",
  "lib/channels/telegram/bots.ts":
    "Bot do Telegram, não número de WhatsApp: o plano cobra número.",
  "app/api/v1/voice/sessions/pair/route.ts":
    "Linha de VOZ pareada a um número que já existe — não é um número de mensagens a mais.",
};

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...arquivos(caminho));
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(caminho.replace(/\\/g, "/"));
  }
  return out;
}

const INSERE_NUMERO = /\.from\("channel_sessions"\)\s*\.insert\(/;
const RESERVA_QR = /\bconnectWahaChannel\(/;

const PORTAS = [...arquivos("app"), ...arquivos("lib"), ...arquivos("workers")].filter((f) => {
  const fonte = readFileSync(f, "utf8");
  return INSERE_NUMERO.test(fonte) || RESERVA_QR.test(fonte);
});

describe("toda porta que cria número passa pela trava do plano", () => {
  it("a varredura enxerga as portas conhecidas (senão ela mede o vazio)", () => {
    expect(PORTAS).toContain("app/api/v1/channel-sessions/route.ts");
    expect(PORTAS).toContain("app/api/v1/channels/official/route.ts");
    expect(PORTAS).toContain("app/api/v1/onboarding/whatsapp/session/route.ts");
    expect(PORTAS.length).toBeGreaterThanOrEqual(6);
  });

  it("cada porta chama a trava ou está declarada com o motivo", () => {
    const semTrava = PORTAS.filter((f) => !(f in DECLARADAS) && !/\btravaDeNovoNumero\(/.test(readFileSync(f, "utf8")));
    expect(
      semTrava,
      "Este arquivo cria um número (INSERT em channel_sessions ou connectWahaChannel) sem chamar " +
        "`travaDeNovoNumero` de `@/lib/planos/trava-de-numero`. Chame-a antes de gravar; se a porta " +
        "REALMENTE não cria número de WhatsApp, declare em DECLARADAS com o motivo.",
    ).toEqual([]);
  });

  it("nenhuma declaração sobra: arquivo declarado ainda existe e ainda cria número", () => {
    expect(Object.keys(DECLARADAS).filter((f) => !PORTAS.includes(f))).toEqual([]);
  });

  it("as rotas que respondem pelas declaradas chamam mesmo a trava", () => {
    for (const rota of ["app/api/v1/channels/partner/route.ts", "app/api/v1/channels/graph-partner/route.ts"]) {
      expect(readFileSync(rota, "utf8"), rota).toMatch(/\btravaDeNovoNumero\(/);
    }
  });
});
