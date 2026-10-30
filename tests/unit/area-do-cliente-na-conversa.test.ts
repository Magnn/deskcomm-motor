import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  MARCA_DA_AREA,
  REF_DA_CONVERSA,
  jaComprou,
  linkDaAreaNoLugarDaMarca,
  paragrafoDoLinkDaArea,
  podeReceberOLinkDaArea,
  respostaAceitaOLinkDaArea,
  temMarcaDaArea,
} from "@/lib/area-do-cliente/link-na-conversa";
import { FORMA_DO_TOKEN } from "@/lib/area-do-cliente/token";

/**
 * O link da área dentro da conversa: a agente escreve a marca, o envio cria o convite e troca a marca
 * pelo link pessoal. Uma vez por pessoa, só para quem pagou, e a marca crua nunca sai.
 */

interface Estado {
  settings: unknown;
  slug: string;
  eventos: Array<Record<string, unknown>>;
  convites: Array<Record<string, unknown>>;
  falhaNoConvite?: boolean;
}

/** O mínimo do cliente do Supabase que a peça usa: select encadeado e insert. */
function bancoFalso(e: Estado): SupabaseClient {
  const consulta = (tabela: string) => {
    const filtros: Record<string, unknown> = {};
    const linhas = () => {
      if (tabela === "organizations") return [{ settings: e.settings, slug: e.slug }];
      if (tabela === "area_eventos") return e.eventos.filter((x) => Object.entries(filtros).every(([k, v]) => x[k] === v));
      return [];
    };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => {
        if (k !== "id") filtros[k] = v;
        return q;
      },
      limit: async () => ({ data: linhas(), error: null }),
      maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
    };
    return q;
  };
  return {
    from: (tabela: string) => ({
      ...consulta(tabela),
      insert: async (linha: Record<string, unknown>) => {
        if (tabela === "area_convites") {
          if (e.falhaNoConvite) return { error: { message: "falhou" } };
          e.convites.push(linha);
        }
        if (tabela === "area_eventos") e.eventos.push(linha);
        return { error: null };
      },
    }),
  } as unknown as SupabaseClient;
}

const LIGADA = { area: { ativo: true } };
const estado = (over: Partial<Estado> = {}): Estado => ({ settings: LIGADA, slug: "magno", eventos: [], convites: [], ...over });
const ORG = "org-1";
const ANA = "ana";
const PAGOU = ["pago", "produto:abertura-do-coracao"];
const ORIGEM = "https://desk.exemplo.com";

describe("quem recebe o bloco", () => {
  it("pagou, área ligada e nunca recebeu pela conversa: sim", async () => {
    expect(await podeReceberOLinkDaArea(bancoFalso(estado()), { organizationId: ORG, contactId: ANA, tags: PAGOU })).toBe(true);
  });

  it("não pagou, área desligada ou já recebeu pela conversa: não", async () => {
    expect(await podeReceberOLinkDaArea(bancoFalso(estado()), { organizationId: ORG, contactId: ANA, tags: [] })).toBe(false);
    expect(
      await podeReceberOLinkDaArea(bancoFalso(estado({ settings: { area: { ativo: false } } })), { organizationId: ORG, contactId: ANA, tags: PAGOU }),
    ).toBe(false);
    const jaRecebeu = estado({
      eventos: [{ organization_id: ORG, contact_id: ANA, tipo: "convite_criado", ref: REF_DA_CONVERSA }],
    });
    expect(await podeReceberOLinkDaArea(bancoFalso(jaRecebeu), { organizationId: ORG, contactId: ANA, tags: PAGOU })).toBe(false);
  });

  it("controle: o convite feito à mão na tela (sem ref) não conta como enviado pela conversa", async () => {
    const naTela = estado({ eventos: [{ organization_id: ORG, contact_id: ANA, tipo: "convite_criado", ref: null }] });
    expect(await podeReceberOLinkDaArea(bancoFalso(naTela), { organizationId: ORG, contactId: ANA, tags: PAGOU })).toBe(true);
  });

  it("⭐ compra avulsa pela Stripe (extra:corte-de-lacos) também dá direito ao link (30/10/2026)", async () => {
    expect(jaComprou(["extra:corte-de-lacos"])).toBe(true);
    expect(jaComprou(["pago"])).toBe(true);
    expect(jaComprou(["produto:x", "lead"])).toBe(false);
    expect(await podeReceberOLinkDaArea(bancoFalso(estado()), { organizationId: ORG, contactId: ANA, tags: ["extra:pergunta-nova"] })).toBe(true);
  });
});

/**
 * O LINK SAI PELO CÓDIGO (30/10/2026): dependendo do juízo do modelo ("quando a conversa estiver tranquila"),
 * 1 de 26 compradoras recebeu o link em 10 dias. O parágrafo é anexado ao fim da primeira resposta que não cobra.
 */
describe("o parágrafo anexado pelo código", () => {
  it("leva a marca, que o envio troca pelo link", () => {
    expect(paragrafoDoLinkDaArea()).toContain(MARCA_DA_AREA);
  });

  it("não vai junto de cobrança nem duplica a marca", () => {
    expect(respostaAceitaOLinkDaArea("Que bom que deu certo! Já começo seu trabalho hoje.")).toBe(true);
    expect(respostaAceitaOLinkDaArea("São R$ 37, no Pix ou cartão.")).toBe(false);
    expect(respostaAceitaOLinkDaArea("Toque no link: https://buy.stripe.com/abc")).toBe(false);
    expect(respostaAceitaOLinkDaArea("00020101021226740014br.gov.bcb.pix2552")).toBe(false);
    expect(respostaAceitaOLinkDaArea(`Olha aqui: ${MARCA_DA_AREA}`)).toBe(false);
  });

  it("o anexo vira link pessoal pelo mesmo caminho da marca", async () => {
    const r = await linkDaAreaNoLugarDaMarca({
      corpo: `Recebi seu pagamento, obrigada!

${paragrafoDoLinkDaArea()}`,
      admin: bancoFalso(estado()),
      organizationId: ORG,
      contactId: ANA,
      tags: ["extra:corte-de-lacos"],
      origem: ORIGEM,
    });
    if (!("corpo" in r)) throw new Error(r.recusa);
    expect(r.corpo).not.toContain(MARCA_DA_AREA);
    expect(r.corpo).toMatch(/cantinho só seu.*https:\/\//);
  });
});

describe("a marca vira o link no envio", () => {
  it("cria o convite agora, registra a origem 'conversa' e troca a marca pelo link pessoal", async () => {
    const e = estado();
    const r = await linkDaAreaNoLugarDaMarca({
      corpo: `Separei um cantinho só seu.\n\n${MARCA_DA_AREA}`,
      admin: bancoFalso(e),
      organizationId: ORG,
      contactId: ANA,
      tags: PAGOU,
      origem: `${ORIGEM}/`,
    });
    if (!("corpo" in r)) throw new Error(r.recusa);
    const link = r.corpo.split("\n\n")[1]!;
    expect(link.startsWith(`${ORIGEM}/c/magno/entrar/`)).toBe(true);
    expect(link.split("/").pop()).toMatch(FORMA_DO_TOKEN);
    expect(r.corpo).not.toContain(MARCA_DA_AREA);
    expect(e.convites).toHaveLength(1);
    expect(e.convites[0]).toMatchObject({ organization_id: ORG, contact_id: ANA, criado_por: null });
    // O banco guarda o hash, nunca o token do link.
    expect(JSON.stringify(e.convites[0])).not.toContain(link.split("/").pop()!);
    expect(e.eventos).toEqual([expect.objectContaining({ tipo: "convite_criado", ref: REF_DA_CONVERSA, contact_id: ANA })]);
  });

  it("sem a marca, nada é criado", async () => {
    const e = estado();
    const r = await linkDaAreaNoLugarDaMarca({ corpo: "Oi!", admin: bancoFalso(e), organizationId: ORG, contactId: ANA, tags: PAGOU, origem: ORIGEM });
    expect(r).toEqual({ corpo: "Oi!" });
    expect(e.convites).toHaveLength(0);
    expect(temMarcaDaArea("Oi!")).toBe(false);
  });

  it.each([
    ["quem não pagou", { tags: [] as string[] }, estado()],
    ["sem endereço público", { origem: "http://localhost:3000" }, estado()],
    ["área desligada", {}, estado({ settings: { area: { ativo: false } } })],
    ["convite que não grava", {}, estado({ falhaNoConvite: true })],
  ])("%s: recusa o envio, sem marca crua e sem evento", async (_nome, over, e) => {
    const r = await linkDaAreaNoLugarDaMarca({
      corpo: MARCA_DA_AREA,
      admin: bancoFalso(e),
      organizationId: ORG,
      contactId: ANA,
      tags: PAGOU,
      origem: ORIGEM,
      ...over,
    });
    expect("recusa" in r).toBe(true);
    if ("recusa" in r) expect(r.recusa).toContain("SEM a marca");
    expect(e.eventos).toHaveLength(0);
  });
});
