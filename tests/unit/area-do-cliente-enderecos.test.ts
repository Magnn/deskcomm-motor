/**
 * ÁREA DO CLIENTE — endereços atrás do proxy. Em produção o Next vê a própria
 * requisição como `https://0.0.0.0:3000/...`; o link de acesso redirecionava
 * para lá e a pessoa caía numa página de erro do navegador.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ambiente = vi.hoisted(() => ({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" as string | undefined }));
vi.mock("@/lib/env", () => ({ env: ambiente }));

import { irPara, origemPublica } from "@/lib/area-do-cliente/http";

const INTERNA = "https://0.0.0.0:3000/c/magno/entrar/abc";

describe("redirecionamento da área", () => {
  it("é relativo: nunca carrega o endereço interno do contêiner", () => {
    const r = irPara("/c/magno");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/c/magno");
  });

  it("leva o motivo na busca", () => {
    expect(irPara("/c/magno", { link: "vencido" }).headers.get("location")).toBe("/c/magno?link=vencido");
  });
});

describe("origem dos links que saem da tela", () => {
  beforeEach(() => {
    ambiente.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  it("usa o endereço público da instalação quando ele existe", () => {
    ambiente.NEXT_PUBLIC_APP_URL = "https://desk.exemplo.com.br/";
    expect(origemPublica(new NextRequest(INTERNA))).toBe("https://desk.exemplo.com.br");
  });

  it("sem endereço público configurado, usa o host que o proxy repassou", () => {
    const req = new NextRequest(INTERNA, { headers: { "x-forwarded-host": "desk.exemplo.com.br", "x-forwarded-proto": "https" } });
    expect(origemPublica(req)).toBe("https://desk.exemplo.com.br");
  });

  it("host interno repassado não vale como público", () => {
    const req = new NextRequest(INTERNA, { headers: { host: "0.0.0.0:3000" } });
    expect(origemPublica(req)).toBe("https://0.0.0.0:3000");
  });
});
