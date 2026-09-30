const fs = require("fs");
const rd = (f) => fs.readFileSync(f, "utf8");
const wr = (f, s) => fs.writeFileSync(f, s);
const rep = (f, a, b) => {
  const s = rd(f);
  if (!s.includes(a)) { console.log("MISS", f, "::", a.slice(0, 70)); return; }
  wr(f, s.replace(a, b));
};
const B = "app/app/ai/followups/";

// ---- helper da escolha/descrição
const H = "lib/followup/gatilho-da-criacao.ts";
rep(H, 'import type { ParamsDaMensagem } from "./mensagem-casa";', 'import { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO, type EventoDaCakto } from "@/lib/pagamentos/eventos-da-cakto";\nimport type { ParamsDaMensagem } from "./mensagem-casa";');
rep(H, "  | { kind: \"inbound_message\"; params: ParamsDaMensagem }\n  | { kind: \"webhook\" };", "  | { kind: \"inbound_message\"; params: ParamsDaMensagem }\n  | { kind: \"payment_event\"; params: { provider: \"cakto\"; event: EventoDaCakto } }\n  | { kind: \"webhook\" };");
rep(H, '  if (escolha.provider !== "whatsapp") return { kind: "webhook" };', `  if (escolha.provider === "cakto") {
    const evento = EVENTOS_DA_CAKTO.find((e) => e === escolha.event);
    // Evento fora da lista é escolha incompleta: a tela recusa antes de criar, em vez de gravar um gatilho que nunca dispara.
    return evento === undefined ? null : { kind: "payment_event", params: { provider: "cakto", event: evento } };
  }
  if (escolha.provider !== "whatsapp") return { kind: "webhook" };`);
rep(H, 'providerId: "whatsapp" | "webhook" | "manual" | "outro";', 'providerId: "whatsapp" | "cakto" | "webhook" | "manual" | "outro";');
rep(H, '  if (kind === "inbound_after_silence") {', `  if (kind === "payment_event") {
    const evento = (cfg?.params as { event?: EventoDaCakto } | undefined)?.event;
    return { providerId: "cakto", evento: evento ? ROTULOS_DOS_EVENTOS_DA_CAKTO[evento] ?? null : null, palavras: [] };
  }
  if (kind === "inbound_after_silence") {`);

// ---- NewFlowDialog: provedor Cakto com os eventos REAIS
const N = B + "_components/NewFlowDialog.tsx";
rep(N, 'import { gatilhoDaEscolha } from "@/lib/followup/gatilho-da-criacao";', 'import { gatilhoDaEscolha } from "@/lib/followup/gatilho-da-criacao";\nimport { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO } from "@/lib/pagamentos/eventos-da-cakto";');
rep(N, `  {
    id: "webhook",
    name: "Webhook / Raio",`, `  {
    // Único provedor de pagamento com produtor de evento: o aviso da Cakto inicia o fluxo que escolheu
    // aquele evento (\`lib/pagamentos/compra-cakto.ts\`). Os valores são os nomes que a Cakto manda.
    id: "cakto",
    name: "Cakto",
    defaultEvent: "purchase_approved",
    events: EVENTOS_DA_CAKTO.map((e) => ({ value: e, label: ROTULOS_DOS_EVENTOS_DA_CAKTO[e] })),
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0b6b3a] shadow-xs">
        <span className="font-sans text-sm font-black text-white">C</span>
      </div>
    ),
  },
  {
    id: "webhook",
    name: "Webhook / Raio",`);

// ---- TriggerNode: ícone e nome da Cakto
const T = B + "[id]/_components/nodes/TriggerNode.tsx";
rep(T, '  if (providerId === "kiwify") {', `  if (providerId === "cakto") {
    providerName = "Cakto";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#0b6b3a] shadow-xs text-white font-black text-xs">
        C
      </div>
    );
  } else if (providerId === "kiwify") {`);

// ---- TriggerConfigControl: tipo «Evento de pagamento (Cakto)»
const C = B + "[id]/_components/TriggerConfigControl.tsx";
rep(C, '  | "inbound_message"\n  | "lead_created";', '  | "inbound_message"\n  | "payment_event"\n  | "lead_created";');
rep(C, "  msgMatch: ModoDaMensagem;", "  pagamentoEvento: EventoDaCakto;\n  msgMatch: ModoDaMensagem;");
rep(C, 'import { MODOS_DA_MENSAGEM, MODOS_DA_PALAVRA } from "@/lib/followup/vocabulario";', 'import { MODOS_DA_MENSAGEM, MODOS_DA_PALAVRA } from "@/lib/followup/vocabulario";\nimport { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO, type EventoDaCakto } from "@/lib/pagamentos/eventos-da-cakto";');
rep(C, '  inbound_message: "Mensagem recebida",\n  lead_created', '  inbound_message: "Mensagem recebida",\n  payment_event: "Evento de pagamento (Cakto)",\n  lead_created');
rep(C, '          : raw.kind === "inbound_message"\n            ? "inbound_message"', '          : raw.kind === "inbound_message"\n            ? "inbound_message"\n            : raw.kind === "payment_event"\n              ? "payment_event"');
rep(C, "keywords?: string[]; keyword_mode?: ModoDaPalavra } | undefined) ?? {};", "keywords?: string[]; keyword_mode?: ModoDaPalavra; event?: EventoDaCakto } | undefined) ?? {};");
rep(C, '    msgMatch: kind === "inbound_message" && params.match ? params.match : "any",', '    pagamentoEvento:\n      kind === "payment_event" && params.event && EVENTOS_DA_CAKTO.includes(params.event) ? params.event : "purchase_approved",\n    msgMatch: kind === "inbound_message" && params.match ? params.match : "any",');
rep(C, '  if (form.kind === "inbound_message") {', '  if (form.kind === "payment_event") {\n    return { kind: "payment_event", params: { provider: "cakto", event: form.pagamentoEvento }, ...cancelOnReply };\n  }\n  if (form.kind === "inbound_message") {');
rep(C, '  if (cfg.kind === "inbound_message") {', `  if (cfg.kind === "payment_event") {
    const e = (cfg.params as { event?: EventoDaCakto } | undefined)?.event;
    return \`\${t("Gatilho")}: Cakto — \${e ? t(ROTULOS_DOS_EVENTOS_DA_CAKTO[e] ?? e) : t("evento")}\`;
  }
  if (cfg.kind === "inbound_message") {`);
rep(C, "    (form.kind === \"inbound_message\" &&\n      (form.msgMatch !== saved.msgMatch", "    (form.kind === \"payment_event\" && form.pagamentoEvento !== saved.pagamentoEvento) ||\n    (form.kind === \"inbound_message\" &&\n      (form.msgMatch !== saved.msgMatch");
rep(C, '                <SelectItem value="inbound_message">{t(KIND_LABEL.inbound_message)}</SelectItem>', '                <SelectItem value="inbound_message">{t(KIND_LABEL.inbound_message)}</SelectItem>\n                <SelectItem value="payment_event">{t(KIND_LABEL.payment_event)}</SelectItem>');
rep(C, '          {form.kind === "inbound_message" && (', `          {form.kind === "payment_event" && (
            <div className="space-y-2" data-testid="trigger-pagamento">
              <Label htmlFor="trigger-pagamento-evento">{t("Evento da Cakto que inicia o fluxo")}</Label>
              <Select
                value={form.pagamentoEvento}
                onValueChange={(v) => setForm((f) => ({ ...f, pagamentoEvento: v as EventoDaCakto }))}
              >
                <SelectTrigger id="trigger-pagamento-evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENTOS_DA_CAKTO.map((e) => (
                    <SelectItem key={e} value={e}>
                      {t(ROTULOS_DOS_EVENTOS_DA_CAKTO[e])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t("O fluxo começa quando a Cakto avisa este evento de uma pessoa que já está no CRM (pelo telefone ou e-mail do checkout). Quem nunca falou com você fica para uma pessoa olhar. O mesmo aviso reenviado não recomeça o fluxo.")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("Em «Compra aprovada», este fluxo passa a ser quem entrega — sem ele, vale o fluxo ativo cujo nome começa com «Entrega».")}
              </p>
            </div>
          )}

          {form.kind === "inbound_message" && (`);

// ---- dicionário
const D = "lib/i18n/dicionario.ts";
let d = rd(D);
const novas = {
  "Compra aprovada": "Compra aprobada",
  "Compra recusada": "Compra rechazada",
  "Pix gerado (aguardando pagamento)": "Pix generado (esperando pago)",
  "Boleto gerado (aguardando pagamento)": "Boleto generado (esperando pago)",
  "PicPay gerado (aguardando pagamento)": "PicPay generado (esperando pago)",
  "Reembolso": "Reembolso",
  "Chargeback": "Contracargo",
  "Assinatura cancelada": "Suscripción cancelada",
  "Assinatura renovada": "Suscripción renovada",
  "Carrinho abandonado": "Carrito abandonado",
  "Evento de pagamento (Cakto)": "Evento de pago (Cakto)",
  "evento": "evento",
  "Evento da Cakto que inicia o fluxo": "Evento de Cakto que inicia el flujo",
  "O fluxo começa quando a Cakto avisa este evento de uma pessoa que já está no CRM (pelo telefone ou e-mail do checkout). Quem nunca falou com você fica para uma pessoa olhar. O mesmo aviso reenviado não recomeça o fluxo.":
    "El flujo empieza cuando Cakto avisa este evento de una persona que ya está en el CRM (por teléfono o correo del checkout). Quien nunca habló contigo queda para que una persona lo revise. El mismo aviso reenviado no reinicia el flujo.",
  "Em «Compra aprovada», este fluxo passa a ser quem entrega — sem ele, vale o fluxo ativo cujo nome começa com «Entrega».":
    "En «Compra aprobada», este flujo pasa a ser quien entrega — sin él, vale el flujo activo cuyo nombre empieza con «Entrega».",
};
const existe = (k) => d.includes(JSON.stringify(k) + ":") || d.includes("\n  " + k + ":");
const fim = d.lastIndexOf("\n};\n", d.indexOf("export function traduzir"));
const linhas = Object.entries(novas).filter(([k]) => !existe(k)).map(([k, v]) => "  " + JSON.stringify(k) + ": { es: " + JSON.stringify(v) + " },");
console.log("dic novas:", linhas.length);
wr(D, d.slice(0, fim) + "\n" + linhas.join("\n") + d.slice(fim));
console.log("ok");
