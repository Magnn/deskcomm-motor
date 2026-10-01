import { describe, expect, it, vi } from "vitest";

import { baixarMidiaDoLink } from "./midia-por-link";

/** Um JPEG de mentira: o módulo julga pelo content-type e pelo tamanho, não pelos bytes. */
const bytes = (n: number) => new Uint8Array(n);

function resposta(corpo: Uint8Array, cabecalhos: Record<string, string>, status = 200): Response {
  return new Response(status >= 300 && status < 400 ? null : (corpo as unknown as BodyInit), { status, headers: cabecalhos });
}

/** DNS de mentira: tudo é público, exceto o host que o teste declarar interno. */
const destinoPublico = async (hostname: string) => {
  if (hostname === "interno.teste") throw new Error("unsafe_url:private_ip");
};

describe("baixarMidiaDoLink — o caminho feliz", () => {
  it("baixa a imagem e devolve bytes, tipo e nome", async () => {
    const fetchFalso = vi.fn(async () => resposta(bytes(2048), { "content-type": "image/jpeg" }));
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/fotos/produto.jpg", "image", {
      fetch: fetchFalso as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.buffer.length).toBe(2048);
      expect(r.mime).toBe("image/jpeg");
      expect(r.nome).toBe("produto.jpg");
    }
    // Redirecionamento nunca é seguido às cegas.
    expect((fetchFalso.mock.calls[0] as unknown as [URL, RequestInit])[1].redirect).toBe("manual");
  });

  it("servidor que responde octet-stream: o tipo vem da extensão do link", async () => {
    const r = await baixarMidiaDoLink("https://arquivos.publico.teste/Proposta%20Comercial.pdf", "document", {
      fetch: (async () => resposta(bytes(1000), { "content-type": "application/octet-stream" })) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toMatchObject({ ok: true, mime: "application/pdf", nome: "Proposta Comercial.pdf" });
  });
});

describe("baixarMidiaDoLink — o que um link não pode fazer", () => {
  const nuncaChamado = vi.fn(async () => resposta(bytes(1), { "content-type": "image/jpeg" }));

  it.each([
    ["endereço interno literal", "http://127.0.0.1/a.jpg"],
    ["metadata da nuvem", "http://169.254.169.254/latest/meta-data"],
    ["rede privada", "https://10.0.0.5/a.jpg"],
    ["esquema que não é http(s)", "file:///etc/passwd"],
    ["IPv6 literal", "https://[::1]/a.jpg"],
    ["texto que não é URL", "não é um link"],
  ])("%s é recusado sem nenhuma requisição", async (_caso, link) => {
    nuncaChamado.mockClear();
    const r = await baixarMidiaDoLink(link, "image", {
      fetch: nuncaChamado as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r.ok).toBe(false);
    expect(nuncaChamado).not.toHaveBeenCalled();
  });

  it("nome público que RESOLVE para endereço interno é recusado (rebinding)", async () => {
    nuncaChamado.mockClear();
    const r = await baixarMidiaDoLink("https://interno.teste/a.jpg", "image", {
      fetch: nuncaChamado as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "unsafe_url:private_ip" });
    expect(nuncaChamado).not.toHaveBeenCalled();
  });

  it("⭐ link público que REDIRECIONA para endereço interno é recusado no salto", async () => {
    const fetchFalso = vi.fn(async () => resposta(bytes(0), { location: "http://169.254.169.254/latest/meta-data" }, 302));
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a.jpg", "image", {
      fetch: fetchFalso as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r.ok).toBe(false);
    // Só a primeira requisição saiu: o destino do redirecionamento nunca foi tocado.
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it("redirecionamento para outro endereço PÚBLICO é seguido, revalidado", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(resposta(bytes(0), { location: "https://outro.publico.teste/final.png" }, 301))
      .mockResolvedValueOnce(resposta(bytes(500), { "content-type": "image/png" }));
    const conferir = vi.fn(destinoPublico);
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a", "image", {
      fetch: fetchFalso as unknown as typeof fetch,
      conferirDestino: conferir,
    });
    expect(r).toMatchObject({ ok: true, mime: "image/png", nome: "final.png" });
    expect(conferir.mock.calls.map((c) => c[0])).toEqual(["cdn.publico.teste", "outro.publico.teste"]);
  });

  it("laço de redirecionamento para depois de 3 saltos", async () => {
    const fetchFalso = vi.fn(async () => resposta(bytes(0), { location: "https://cdn.publico.teste/de-novo" }, 302));
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a", "image", {
      fetch: fetchFalso as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "redirecionamentos_demais" });
    expect(fetchFalso).toHaveBeenCalledTimes(4);
  });

  it("arquivo acima do teto do tipo é recusado pelo cabeçalho, sem ler o corpo", async () => {
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a.jpg", "image", {
      fetch: (async () => resposta(bytes(10), { "content-type": "image/jpeg", "content-length": String(6 * 1024 * 1024) })) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "arquivo_grande_demais" });
  });

  it("servidor que MENTE no cabeçalho é cortado durante a leitura", async () => {
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a.jpg", "image", {
      // sem content-length, e o corpo tem 6 MB (teto da imagem: 5 MB)
      fetch: (async () => resposta(bytes(6 * 1024 * 1024), { "content-type": "image/jpeg" })) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "arquivo_grande_demais" });
  });

  it("tipo diferente do item é recusado — link de PDF num item de imagem", async () => {
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a.pdf", "image", {
      fetch: (async () => resposta(bytes(100), { "content-type": "application/pdf" })) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "tipo_inesperado:document" });
  });

  it("formato que o upload da tela também recusaria (webp como imagem) não passa pelo link", async () => {
    const r = await baixarMidiaDoLink("https://cdn.publico.teste/a.webp", "image", {
      fetch: (async () => resposta(bytes(100), { "content-type": "image/webp" })) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(r).toEqual({ ok: false, motivo: "unsupported_media_type" });
  });

  it("link fora do ar e resposta de erro não lançam: devolvem o motivo", async () => {
    const fora = await baixarMidiaDoLink("https://cdn.publico.teste/a.jpg", "image", {
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(fora).toEqual({ ok: false, motivo: "link_inacessivel" });
    const naoAchou = await baixarMidiaDoLink("https://cdn.publico.teste/a.jpg", "image", {
      fetch: (async () => resposta(bytes(0), {}, 404)) as unknown as typeof fetch,
      conferirDestino: destinoPublico,
    });
    expect(naoAchou).toEqual({ ok: false, motivo: "http_404" });
  });
});
