/**
 * RISCO DE VIDA NÃO ESPERA NA CENTRAL (medido em 31/10/2026: passagens por risco de
 * vida sem nenhuma resposta humana, com o aviso parado na tela).
 *
 * O que este arquivo guarda:
 *  - a detecção pega os motivos reais e não confunde expressão comum;
 *  - três alertas no máximo, com espera, um por conversa;
 *  - alerta que não saiu por canal nenhum não gasta tentativa;
 *  - o texto não leva o que a pessoa disse;
 *  - a frase à pessoa dá o CVV e não promete quem vem.
 */
import { describe, expect, it, vi } from "vitest";

import {
  type DepsDoAlerta,
  type PassagemEmAberto,
  TETO_DE_ALERTAS,
  alertaVencido,
  ehRiscoDeVida,
  rodarAlertasDeRisco,
  textoDoAlerta,
} from "@/lib/escalacao/alerta-de-risco";
import { textoDoAviso } from "@/lib/escalacao/aviso-ao-lead";

const AGORA = new Date("2026-10-31T02:00:00Z");

function passagem(extra: Partial<PassagemEmAberto> = {}): PassagemEmAberto {
  return {
    id: "p1",
    organization_id: "org",
    contact_id: "contato",
    conversation_id: "conversa",
    criado_em: "2026-10-30T13:37:00Z",
    title: null,
    notes: null,
    content: "Lead relatou ideação suicida na mensagem anterior",
    alertas_de_risco: 0,
    ultimo_alerta_de_risco_em: null,
    ...extra,
  };
}

function deps(passagens: PassagemEmAberto[], extra: Partial<DepsDoAlerta> = {}): DepsDoAlerta {
  return {
    passagensEmAberto: vi.fn(async () => passagens),
    nomeDoContato: vi.fn(async () => "Maria"),
    idiomaDaOrganizacao: vi.fn(async () => "pt-BR" as const),
    enviarEmail: vi.fn(async () => true),
    enviarWhatsapp: vi.fn(async () => "sem_configuracao" as const),
    registrarAlerta: vi.fn(async () => undefined),
    urlPublica: "https://desk.test/",
    clock: () => AGORA,
    log: { info: vi.fn(), warn: vi.fn() },
    ...extra,
  };
}

describe("detecção", () => {
  it.each([
    'Lead relatou ideação suicida ("vontade de dar um tiro na cabeça")',
    "Lead relatou vontade de desistir da vida",
    'Lead em risco de vida: disse "sinto que estou indo embora"',
    "Lead em sofrimento emocional intenso, sozinha em casa",
    "Relato de pensamento de tirar a própria vida em áudio",
    "Tomou medicamento para TIRAR A VIDA",
  ])("reconhece: %s", (texto) => {
    expect(ehRiscoDeVida(texto)).toBe(true);
  });

  it.each([
    "Quero falar com uma pessoa sobre o pagamento",
    "Estou morrendo de saudade dele",
    "Cheguei no fundo do poço financeiro",
    "Vontade de sair dessa vida de dívidas",
    "",
    null,
  ])("não confunde: %s", (texto) => {
    expect(ehRiscoDeVida(texto)).toBe(false);
  });
});

describe("cadência", () => {
  it("o primeiro é na hora, e os seguintes esperam 15 min e 1 h", () => {
    expect(alertaVencido(passagem(), AGORA)).toBe(true);
    const ha10 = new Date(AGORA.getTime() - 10 * 60 * 1000).toISOString();
    const ha20 = new Date(AGORA.getTime() - 20 * 60 * 1000).toISOString();
    expect(alertaVencido(passagem({ alertas_de_risco: 1, ultimo_alerta_de_risco_em: ha10 }), AGORA)).toBe(false);
    expect(alertaVencido(passagem({ alertas_de_risco: 1, ultimo_alerta_de_risco_em: ha20 }), AGORA)).toBe(true);
    expect(alertaVencido(passagem({ alertas_de_risco: 2, ultimo_alerta_de_risco_em: ha20 }), AGORA)).toBe(false);
  });

  it("para no teto e fora da janela", () => {
    expect(alertaVencido(passagem({ alertas_de_risco: TETO_DE_ALERTAS }), AGORA)).toBe(false);
    expect(alertaVencido(passagem({ criado_em: "2026-10-20T00:00:00Z" }), AGORA)).toBe(false);
  });
});

describe("rodada", () => {
  it("avisa por e-mail e registra a tentativa, ignorando passagem comum", async () => {
    const d = deps([passagem(), passagem({ id: "p2", conversation_id: "outra", content: "Quer falar com atendente" })]);
    const r = await rodarAlertasDeRisco(d);
    expect(r).toEqual({ examinadas: 1, alertadas: 1, sem_canal: 0 });
    expect(d.enviarEmail).toHaveBeenCalledOnce();
    expect(d.registrarAlerta).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }), ["p1"], 1, AGORA);
  });

  it("duas passagens da mesma conversa rendem um alerta só", async () => {
    const d = deps([passagem(), passagem({ id: "p2" })]);
    await rodarAlertasDeRisco(d);
    expect(d.enviarEmail).toHaveBeenCalledOnce();
    expect(d.registrarAlerta).toHaveBeenCalledWith(expect.anything(), ["p1", "p2"], 1, AGORA);
  });

  it("o WhatsApp sozinho basta", async () => {
    const d = deps([passagem()], {
      enviarEmail: vi.fn(async () => false),
      enviarWhatsapp: vi.fn(async () => "enviado" as const),
    });
    expect((await rodarAlertasDeRisco(d)).alertadas).toBe(1);
  });

  it("nenhum canal entregou: não gasta tentativa", async () => {
    const d = deps([passagem()], { enviarEmail: vi.fn(async () => { throw new Error("fora"); }) });
    expect(await rodarAlertasDeRisco(d)).toEqual({ examinadas: 1, alertadas: 0, sem_canal: 1 });
    expect(d.registrarAlerta).not.toHaveBeenCalled();
  });
});

describe("textos", () => {
  it("o alerta leva nome e link, não as palavras da pessoa", () => {
    const { corpo } = textoDoAlerta({ nome: "Maria", link: "https://desk.test/app/inbox/1", tentativa: 2, idioma: "pt-BR" });
    expect(corpo).toContain("Maria");
    expect(corpo).toContain("https://desk.test/app/inbox/1");
    expect(corpo).toContain("(2/3)");
    expect(corpo).toContain("188");
  });

  it("sai em espanhol para organização em espanhol", () => {
    const { assunto } = textoDoAlerta({ nome: null, link: "x", tentativa: 1, idioma: "es" });
    expect(assunto).toContain("persona en riesgo");
  });

  it("a frase à pessoa dá o CVV e não promete equipe, com ou sem gente disponível", () => {
    for (const quem of [null, { disponiveis: 2, total: 3 }]) {
      const texto = textoDoAviso("risco_de_vida", quem, "lead-1");
      expect(texto).toContain("188");
      expect(texto).toContain("192");
      expect(texto).not.toMatch(/equipe|aguarde|já te respondem/i);
    }
  });
});
