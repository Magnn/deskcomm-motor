/**
 * A família de grupos do cliente do WhatsApp por QR code. O formato das respostas
 * foi conferido numa instalação real (motor NOWEB); a leitura é tolerante porque
 * outro motor devolve o id e a contagem em outro lugar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { idDoGrupo, WahaClient } from "./client";

function comResposta(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
    new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status }),
  );
  vi.stubGlobal("fetch", fetchFalso);
  return fetchFalso;
}

afterEach(() => vi.unstubAllGlobals());

const cliente = () => new WahaClient("http://waha.test", "chave");

describe("o id do grupo na resposta de criação", () => {
  it("vem em `id`, em `JID` ou dentro de `gid._serialized`, conforme o motor", () => {
    expect(idDoGrupo({ id: "120363428728471718@g.us" })).toBe("120363428728471718@g.us");
    expect(idDoGrupo({ JID: "120363428728471718@g.us" })).toBe("120363428728471718@g.us");
    expect(idDoGrupo({ gid: { _serialized: "120363428728471718@g.us" } })).toBe("120363428728471718@g.us");
    expect(idDoGrupo("120363428728471718@g.us")).toBe("120363428728471718@g.us");
  });

  it("resposta sem id de grupo não vira id inventado", () => {
    expect(idDoGrupo({ id: "5511999990000@c.us" })).toBeNull();
    expect(idDoGrupo({})).toBeNull();
    expect(idDoGrupo(null)).toBeNull();
    expect(idDoGrupo("qualquer coisa")).toBeNull();
  });
});

describe("criar grupo", () => {
  it("a sessão vai no CAMINHO, e os participantes viram ids do WhatsApp", async () => {
    const f = comResposta({ id: "120363000000000001@g.us", subject: "Aulão #1" });
    const r = await cliente().createGroup("minha sessao", "Aulão #1", ["5511999990000"]);
    expect(r).toEqual({ id: "120363000000000001@g.us" });
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("http://waha.test/api/minha%20sessao/groups");
    expect(JSON.parse(String(init!.body))).toEqual({ name: "Aulão #1", participants: [{ id: "5511999990000@c.us" }] });
  });

  it("recusa do WhatsApp vira erro com o status; resposta sem id também é erro", async () => {
    comResposta({ message: "bad" }, 400);
    await expect(cliente().createGroup("s", "G", ["5511999990000"])).rejects.toThrow("waha_400");
    comResposta({ ok: true });
    await expect(cliente().createGroup("s", "G", ["5511999990000"])).rejects.toThrow("waha_grupo_sem_id");
  });
});

describe("contagem e convite", () => {
  it("a contagem vem de `size`, ou do tamanho da lista de participantes", async () => {
    comResposta({ id: "1@g.us", subject: "Aulão #1", size: 145 });
    expect(await cliente().getGroupInfo("s", "120363000000000001@g.us")).toEqual({ membros: 145, nome: "Aulão #1" });
    comResposta({ name: "Aulão #2", participants: [{}, {}, {}] });
    expect(await cliente().getGroupInfo("s", "120363000000000001@g.us")).toEqual({ membros: 3, nome: "Aulão #2" });
  });

  it("resposta sem contagem é ERRO — zero inventado faria o link tratar um grupo cheio como vazio", async () => {
    comResposta({ subject: "sem contagem" });
    await expect(cliente().getGroupInfo("s", "1@g.us")).rejects.toThrow("waha_grupo_sem_contagem");
  });

  it("o convite é lido como texto JSON, como objeto ou como texto cru", async () => {
    comResposta('"AbCdEf123456ghIJKL"');
    expect(await cliente().getGroupInviteCode("s", "1@g.us")).toBe("AbCdEf123456ghIJKL");
    comResposta({ code: "AbCdEf123456ghIJKL" });
    expect(await cliente().getGroupInviteCode("s", "1@g.us")).toBe("AbCdEf123456ghIJKL");
    comResposta("https://chat.whatsapp.com/AbCdEf123456ghIJKL");
    expect(await cliente().getGroupInviteCode("s", "1@g.us")).toBe("https://chat.whatsapp.com/AbCdEf123456ghIJKL");
  });

  it("'só admin fala' vai por PUT, com o id do grupo codificado no caminho", async () => {
    const f = comResposta({});
    await cliente().setGroupAdminsOnly("s", "120363000000000001@g.us", true);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("http://waha.test/api/s/groups/120363000000000001%40g.us/settings/security/messages-admin-only");
    expect(init!.method).toBe("PUT");
    expect(JSON.parse(String(init!.body))).toEqual({ adminsOnly: true });
  });
});
