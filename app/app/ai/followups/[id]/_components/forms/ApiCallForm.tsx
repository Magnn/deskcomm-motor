"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ehHostBloqueadoPorSsrf, parseCurl } from "@/lib/followup/api-call";
import { apiCallConfigSchema, HTTP_METHODS, type ApiCallHeader, type HttpMethod } from "@/lib/followup/graph-schema";
import { Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * API externa (webhook genérico) — o achado de UX mais forte da pesquisa
 * comparativa (referência: AcassIA `api`): colar um cURL preenche
 * método/URL/headers/corpo sozinho, em vez de a pessoa montar cada campo à
 * mão. `parseCurl` (lib/followup/api-call.ts) é um parser de verdade, não
 * cosmético — cobre o formato que "Copy as cURL" do navegador/Postman produz.
 */
export function ApiCallForm({
  config,
  onChange,
}: {
  config: ConfigOf<"api_call">;
  onChange: (c: ConfigOf<"api_call">) => void;
}) {
  const t = useT();
  const [curlText, setCurlText] = useState("");
  const [method, setMethod] = useState<HttpMethod>(config.method);
  const [url, setUrl] = useState(config.url);
  const [headers, setHeaders] = useState<ApiCallHeader[]>(config.headers);
  const [body, setBody] = useState(config.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [curlError, setCurlError] = useState<string | null>(null);

  const commit = (next: { method: HttpMethod; url: string; headers: ApiCallHeader[]; body: string }) => {
    const candidate = {
      method: next.method,
      url: next.url,
      headers: next.headers,
      ...(next.body.trim() ? { body: next.body } : {}),
    };
    const parsed = apiCallConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const aplicarCurl = () => {
    const resultado = parseCurl(curlText);
    if (!resultado) {
      setCurlError(t("Não consegui ler este cURL — confira se ele tem uma URL http:// ou https://."));
      return;
    }
    setCurlError(null);
    setMethod(resultado.method);
    setUrl(resultado.url);
    setHeaders(resultado.headers);
    setBody(resultado.body ?? "");
    commit({ method: resultado.method, url: resultado.url, headers: resultado.headers, body: resultado.body ?? "" });
  };

  const urlBloqueada = url.trim() !== "" && ehHostBloqueadoPorSsrf(url);

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border border-border p-2">
        <Label htmlFor="api-call-curl">{t("Colar um cURL (preenche os campos abaixo)")}</Label>
        <Textarea
          id="api-call-curl"
          rows={3}
          value={curlText}
          onChange={(e) => setCurlText(e.target.value)}
          placeholder={t('curl -X POST https://example.com/webhook -H "Content-Type: application/json" -d \'{"lead":"ok"}\'')}
        />
        <Button type="button" variant="outline" size="sm" onClick={aplicarCurl} disabled={!curlText.trim()}>
          {t("Preencher com este cURL")}
        </Button>
        {curlError && <p className="text-xs text-error-fg">{curlError}</p>}
      </div>

      <div className="flex gap-2">
        <div className="w-28 space-y-2">
          <Label htmlFor="api-call-method">{t("Método")}</Label>
          <Select
            value={method}
            onValueChange={(v) => {
              const next = v as HttpMethod;
              setMethod(next);
              commit({ method: next, url, headers, body });
            }}
          >
            <SelectTrigger id="api-call-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="api-call-url">{t("URL")}</Label>
          <Input
            id="api-call-url"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              commit({ method, url: e.target.value, headers, body });
            }}
            placeholder="https://"
          />
        </div>
      </div>
      {urlBloqueada && (
        <p className="text-xs text-error-fg">
          {t("Esta URL aponta para um endereço local/privado — a chamada será recusada quando o fluxo rodar.")}
        </p>
      )}

      <div className="space-y-2">
        <Label>{t("Cabeçalhos (headers)")}</Label>
        {headers.map((header, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              aria-label={`Nome do cabeçalho ${index + 1}`}
              value={header.key}
              onChange={(e) => {
                const next = headers.map((h, i) => (i === index ? { ...h, key: e.target.value } : h));
                setHeaders(next);
                commit({ method, url, headers: next, body });
              }}
              placeholder="Authorization"
              className="flex-1"
            />
            <Input
              aria-label={`Valor do cabeçalho ${index + 1}`}
              value={header.value}
              onChange={(e) => {
                const next = headers.map((h, i) => (i === index ? { ...h, value: e.target.value } : h));
                setHeaders(next);
                commit({ method, url, headers: next, body });
              }}
              placeholder="Bearer ..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remover cabeçalho ${index + 1}`}
              onClick={() => {
                const next = headers.filter((_, i) => i !== index);
                setHeaders(next);
                commit({ method, url, headers: next, body });
              }}
            >
              <Trash size={14} aria-hidden />
            </Button>
          </div>
        ))}
        {headers.length < 20 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const next = [...headers, { key: "", value: "" }];
              setHeaders(next);
              commit({ method, url, headers: next, body });
            }}
          >
            <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar cabeçalho")}
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-call-body">{t("Corpo (opcional)")}</Label>
        <Textarea
          id="api-call-body"
          rows={4}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            commit({ method, url, headers, body: e.target.value });
          }}
          placeholder='{"lead_id": "..."}'
        />
      </div>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
