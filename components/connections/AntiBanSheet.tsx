"use client";
/**
 * Proteção de envio (anti-ban) por conexão — Operação Visível F2ii. Edita os
 * knobs que o engine JÁ respeita (channel_knobs + teto diário). Modelo mental
 * honesto com o motor: campo vazio = padrão conservador do engine (placeholder
 * mostra o valor); preenchido = override desta conexão.
 */
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FUSOS_OFERECIDOS } from "@/lib/tempo/fusos";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useUpdatePacingKnobs, type PacingKnobsItem } from "@/hooks/channels/usePacingKnobs";
import { diaDeHojeLocal, valorDeOverride } from "@/lib/ai/pacing-knobs";
import { ApiError } from "@/lib/api/types";
import { nomeDoCanal } from "@/lib/channels/estado";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  item: PacingKnobsItem | null;
  canWrite: boolean;
  onClose: () => void;
}

/** estado do form: strings cruas dos inputs ('' = usar padrão do motor). */
interface FormState {
  window_start_hour: string;
  window_end_hour: string;
  throttle_s: string;
  jitter_s: string;
  daily_message_limit: string;
  allow_sunday: boolean;
  timezone: string;
  /** `yyyy-mm-dd` do input date; '' = não declarado (o motor trata como idade 0). */
  numero_em_uso_desde: string;
  pular_aquecimento: boolean;
  /** '' = sem teto por hora. */
  max_per_hour: string;
  /** Orçamento fixo de leads por dia; '' = sem orçamento (o rodízio divide por igual). */
  leads_por_dia: string;
  /** "Subir sozinho com a idade" — grava a rampa em vez do número fixo. */
  leads_em_rampa: boolean;
  /** O orçamento só é regravado se o operador mexeu: um desenho "personalizado" não é reescrito por um save de outro campo. */
  leads_tocado: boolean;
}

function fromItem(item: PacingKnobsItem): FormState {
  const o = item.overrides;
  return {
    window_start_hour: o?.window_start_hour != null ? String(o.window_start_hour) : "",
    window_end_hour: o?.window_end_hour != null ? String(o.window_end_hour) : "",
    throttle_s: o?.throttle_ms != null ? String(o.throttle_ms / 1000) : "",
    jitter_s: o?.jitter_max_ms != null ? String(o.jitter_max_ms / 1000) : "",
    daily_message_limit:
      item.channel_session.daily_message_limit != null
        ? String(item.channel_session.daily_message_limit)
        : "",
    allow_sunday: o?.allow_sunday ?? item.defaults.allowSunday,
    timezone: o?.timezone ?? "",
    numero_em_uso_desde: item.warmup.number_activated_at
      ? item.warmup.number_activated_at.slice(0, 10)
      : "",
    pular_aquecimento: item.warmup.skipped,
    max_per_hour: o?.max_per_hour != null ? String(o.max_per_hour) : "",
    leads_por_dia:
      item.leads.mode === "fixo" && item.leads.cap_today != null ? String(item.leads.cap_today) : "",
    leads_em_rampa: item.leads.mode === "rampa",
    leads_tocado: false,
  };
}

/** O que a tela manda para o orçamento de leads: número, "rampa" ou null (sem orçamento). */
function orcamentoDoForm(form: FormState): number | "rampa" | null {
  if (form.leads_em_rampa) return "rampa";
  return form.leads_por_dia.trim() === "" ? null : Math.round(Number(form.leads_por_dia));
}

const intOrNull = (s: string): number | null => (s.trim() === "" ? null : Math.round(Number(s)));
const msOrNull = (s: string): number | null =>
  s.trim() === "" ? null : Math.round(Number(s) * 1000);

export function AntiBanSheet({ item, canWrite, onClose }: Props) {
  const t = useT();
  const update = useUpdatePacingKnobs();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    setForm(item ? fromItem(item) : null);
  }, [item]);

  const label = useMemo(() => {
    if (!item) return "";
    // Mesma cadeia que vazava `org_xxxx` no seletor do editor de agente: o
    // identificador do transporte era o penúltimo degrau, então uma conexão sem
    // apelido e sem número aparecia com ele no título do painel.
    return nomeDoCanal(item.channel_session, t);
  }, [item, t]);

  // Duas saídas mudas moravam aqui, e as duas mentiam. `item` nulo NÃO é "painel
  // fechado": o painel só é montado quando alguém o abre (ConnectionsClient), então
  // item nulo significa que a conexão pedida sumiu da lista — excluída em outra aba
  // ou máquina, cache velho — e o botão morria sem dizer nada, exatamente o
  // `return` mudo que o Sistema Vivo proíbe. Virou estado visível, com caminho de
  // volta: "Tentar de novo" invalida `pacing-knobs`; quando o item reaparecer, o
  // efeito acima re-hidrata o formulário e o painel normal assume. Já `form` nulo é
  // só o frame transitório entre o item chegar e a hidratação rodar (um render) —
  // pintar o formulário nesse instante é que seria mentira. Por isso `!form`
  // continua mudo, e só ele.
  if (!item) {
    return (
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t("Proteção de envio")}</SheetTitle>
            <SheetDescription data-testid="anti-ban-indisponivel">
              {t(
                "Não foi possível carregar a proteção de envio desta conexão. Ela pode ter sido removida, ou esta lista está desatualizada.",
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="ghost" onClick={onClose} data-testid="anti-ban-fechar">
              {t("Fechar")}
            </Button>
            <Button
              onClick={() => void qc.invalidateQueries({ queryKey: ["pacing-knobs"] })}
              data-testid="anti-ban-tentar-de-novo"
            >
              {t("Tentar de novo")}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  if (!form) return null;
  const eff = item.effective;
  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const handleSave = async () => {
    try {
      await update.mutateAsync({
        channel_session_id: item.channel_session.id,
        window_start_hour: intOrNull(form.window_start_hour),
        window_end_hour: intOrNull(form.window_end_hour),
        throttle_ms: msOrNull(form.throttle_s),
        jitter_max_ms: msOrNull(form.jitter_s),
        // `null` quando o Switch está no default: salvar esta ficha por outro
        // motivo (aquecimento, throttle) não pode congelar o padrão do dia como
        // escolha permanente — foi assim que uma instalação ficou muda todo
        // domingo. Ver `valorDeOverride`.
        allow_sunday: valorDeOverride(form.allow_sunday, item.defaults.allowSunday),
        timezone: form.timezone.trim() === "" ? null : form.timezone.trim(),
        ...(form.daily_message_limit.trim() !== ""
          ? { daily_message_limit: Math.round(Number(form.daily_message_limit)) }
          : {}),
        // Meio-dia UTC, não meia-noite: a data é um DIA declarado pelo operador, e
        // meia-noite vira o dia anterior em qualquer fuso a oeste — o número
        // envelheceria um dia a menos do que ele informou.
        number_activated_at:
          form.numero_em_uso_desde.trim() === ""
            ? null
            : new Date(`${form.numero_em_uso_desde}T12:00:00.000Z`).toISOString(),
        skip_warmup: form.pular_aquecimento,
        max_per_hour: intOrNull(form.max_per_hour),
        ...(form.leads_tocado ? { lead_daily_cap: orcamentoDoForm(form) } : {}),
      });
      toast.success(t("Proteção de envio atualizada."));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? t(err.message) : t("Não foi possível salvar."));
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {t("Proteção de envio —")} {label}
          </SheetTitle>
          <SheetDescription>
            {t(
              "Estes limites protegem o número contra bloqueio do WhatsApp. Campo vazio usa o padrão seguro do sistema (mostrado no campo).",
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 py-2" data-testid="anti-ban-form">
          {item.today ? (
            <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="uso-de-hoje">
              <p className="text-xs font-medium">{t("Hoje neste número")}</p>
              <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <li data-testid="uso-leads">
                  {t("Leads novos:")} <strong className="text-foreground">{item.today.leads_today}</strong>
                  {item.leads.cap_today != null ? ` / ${item.leads.cap_today}` : ""}
                  {item.today.leads_on_the_way > 0 ? ` (+${item.today.leads_on_the_way} ${t("a caminho")})` : ""}
                </li>
                <li data-testid="uso-hora">
                  {t("Última hora:")} <strong className="text-foreground">{item.today.sent_last_hour}</strong>
                  {eff.maxPerHour != null ? ` / ${eff.maxPerHour}` : ""} {t("msgs")}
                </li>
                <li>
                  {t("Iniciadas por nós:")} <strong className="text-foreground">{item.today.initiated_today}</strong>
                  {item.warmup.cap_today != null ? ` / ${item.warmup.cap_today}` : ""}
                </li>
                <li>
                  {t("Total enviado:")} <strong className="text-foreground">{item.today.sent_today}</strong>
                </li>
              </ul>
            </div>
          ) : null}

          <fieldset className="flex flex-col gap-2" data-testid="orcamento-de-leads">
            <Label htmlFor="leads-por-dia">{t("Leads novos por dia (rodízio)")}</Label>
            <Input
              id="leads-por-dia"
              type="number"
              min={1}
              max={item.bounds.leadsPerDayMax}
              inputMode="numeric"
              placeholder={t("sem limite")}
              value={form.leads_por_dia}
              onChange={(e) => set({ leads_por_dia: e.target.value, leads_tocado: true })}
              disabled={!canWrite || form.leads_em_rampa}
              className="w-32"
            />
            <div className="mt-1 flex items-center gap-2">
              <Switch
                id="leads-em-rampa"
                checked={form.leads_em_rampa}
                onCheckedChange={(v) => set({ leads_em_rampa: v, leads_tocado: true })}
                disabled={!canWrite}
              />
              <Label htmlFor="leads-em-rampa" className="font-normal">
                {t("Subir sozinho com a idade do número")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.leads_em_rampa
                ? t("0–3 dias: 15 por dia · 4–7 dias: 25 · 8–14 dias: 50 · 15 dias ou mais: sem limite.")
                : item.leads.mode === "personalizado" && !form.leads_tocado
                  ? `${t("Orçamento personalizado em vigor — hoje:")} ${item.leads.cap_today ?? t("sem limite")}. ${t("Preencha o campo para trocar.")}`
                  : t(
                      "Quantas conversas novas os anúncios com rodízio mandam a este número por dia. O clique vai para o número mais longe do seu limite; se todos encherem, vai para o menos carregado e o excesso fica registrado — nenhum clique pago se perde. Em branco: divide por igual.",
                    )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2" data-testid="teto-por-hora">
            <Label htmlFor="max-por-hora">{t("Teto de mensagens por hora")}</Label>
            <Input
              id="max-por-hora"
              type="number"
              min={1}
              max={item.bounds.perHourMax}
              inputMode="numeric"
              placeholder={t("sem teto por hora")}
              value={form.max_per_hour}
              onChange={(e) => set({ max_per_hour: e.target.value })}
              disabled={!canWrite}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Conta tudo o que sai do número. Rajada é o que mais derruba número novo: acima do teto, a mensagem espera alguns minutos até abrir vaga. Quem relata urgência é respondido mesmo assim.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2" data-testid="aquecimento">
            <Label htmlFor="numero-em-uso-desde">{t("Este número é usado desde")}</Label>
            <Input
              id="numero-em-uso-desde"
              type="date"
              // O dia LOCAL, que é o que este campo fala. Com o dia UTC, às 21h
              // em São Paulo o limite já oferecia amanhã.
              max={diaDeHojeLocal()}
              value={form.numero_em_uso_desde}
              onChange={(e) => set({ numero_em_uso_desde: e.target.value })}
              disabled={!canWrite || form.pular_aquecimento}
              className="w-48"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "A conexão pode ser nova sem que o número seja. O aquecimento conta a idade do NÚMERO — em branco, ele é tratado como recém-criado e começa liberando pouco por dia. Uma data já salva não some se você limpar o campo: para mudá-la, informe outra.",
              )}
            </p>

            <div className="mt-1 flex items-center gap-2">
              <Switch
                id="pular-aquecimento"
                checked={form.pular_aquecimento}
                onCheckedChange={(v) => set({ pular_aquecimento: v })}
                disabled={!canWrite}
              />
              <Label htmlFor="pular-aquecimento" className="font-normal">
                {t("Este número já está aquecido — pular o aquecimento")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.pular_aquecimento
                ? t(
                    "Vale só o teto diário abaixo. Use apenas se o número já envia há semanas: pular o aquecimento num número novo é o caminho mais rápido para o bloqueio.",
                  )
                : item.warmup.cap_today === null
                  ? `${t("Número com")} ${item.warmup.age_days} ${t("dia(s) de uso — já formado. Vale só o teto diário abaixo.")}`
                  : `${t("Hoje o aquecimento libera")} ${item.warmup.cap_today} ${t("envio(s) — o número tem")} ${item.warmup.age_days} ${t("dia(s) de uso. Enquanto esse número for menor que o teto diário, é ELE que limita, e mexer no teto diário não muda nada.")}`}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Janela de envio (horário local)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={23}
                inputMode="numeric"
                placeholder={String(eff.windowStartHour)}
                value={form.window_start_hour}
                onChange={(e) => set({ window_start_hour: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Hora de início da janela")}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">{t("h até")}</span>
              <Input
                type="number"
                min={1}
                max={24}
                inputMode="numeric"
                placeholder={String(eff.windowEndHour)}
                value={form.window_end_hour}
                onChange={(e) => set({ window_end_hour: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Hora de fim da janela")}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">h</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "O assistente só envia mensagens dentro desta janela. Fora dela, a resposta fica agendada para a próxima abertura — você vê o motivo na conversa.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="allow-sunday">{t("Enviar aos domingos")}</Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Ligado por padrão: quem escreve no domingo espera resposta no domingo. Desligue se você faz prospecção ativa e prefere não incomodar no fim de semana.",
                )}
              </p>
            </div>
            <Switch
              id="allow-sunday"
              checked={form.allow_sunday}
              onCheckedChange={(v) => set({ allow_sunday: v })}
              disabled={!canWrite}
            />
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Ritmo entre envios (segundos)")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={String(eff.throttleMs / 1000)}
                value={form.throttle_s}
                onChange={(e) => set({ throttle_s: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Intervalo mínimo entre envios em segundos")}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">{t("+ variação de até")}</span>
              <Input
                type="number"
                min={0}
                step="0.1"
                inputMode="decimal"
                placeholder={String(eff.jitterMaxMs / 1000)}
                value={form.jitter_s}
                onChange={(e) => set({ jitter_s: e.target.value })}
                disabled={!canWrite}
                aria-label={t("Variação aleatória máxima em segundos")}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">s</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "Intervalo mínimo entre mensagens do mesmo número, mais uma variação aleatória — ritmo cravado parece robô para o WhatsApp.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Teto diário de envios")}</Label>
            <Input
              type="number"
              min={item.bounds.daily_limit.min}
              max={item.bounds.daily_limit.max}
              inputMode="numeric"
              placeholder={t("sem teto definido")}
              value={form.daily_message_limit}
              onChange={(e) => set({ daily_message_limit: e.target.value })}
              disabled={!canWrite}
              aria-label={t("Teto diário de mensagens")}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Máximo de mensagens que este número envia por dia. Números novos também respeitam o aquecimento automático abaixo, o que for menor.",
              )}
            </p>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <Label>{t("Fuso horário da janela")}</Label>
            {/* LISTA, e não texto livre. A API já REJEITA fuso inválido — mas
                rejeitar é devolver um erro a quem digitou certo na cabeça e
                errado no teclado (`America/Asunción`, com o acento que um
                hispanofalante escreve natural). Escolher não erra. */}
            <select
              value={form.timezone}
              onChange={(e) => set({ timezone: e.target.value })}
              disabled={!canWrite}
              aria-label={t("Fuso horário IANA")}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
            >
              <option value="">
                {t("Usar o padrão")} ({eff.timezone})
              </option>
              {FUSOS_OFERECIDOS.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {t(f.rotulo)} — {f.codigo}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t("A janela de envio é avaliada neste fuso (ex.: America/Sao_Paulo).")}
            </p>
          </fieldset>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium">{t("Aquecimento automático de número novo")}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {eff.warmupDailyCaps
                .map((s) =>
                  s.cap === null
                    ? `${t("a partir de")} ${s.minAgeDays} ${t("dias: sem limite de aquecimento")}`
                    : `${s.minAgeDays}+ ${t("dias: até")} ${s.cap}/${t("dia")}`,
                )
                .join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Número recém-conectado envia pouco e sobe aos poucos — enviar demais no início é a causa nº 1 de bloqueio. Conta só o que nós iniciamos (retorno, recuperação, oferta): responder quem acabou de escrever não gasta o aquecimento.",
              )}
            </p>
          </div>
        </div>

        <div className="mt-auto flex justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            {canWrite ? t("Cancelar") : t("Fechar")}
          </Button>
          {canWrite ? (
            <Button onClick={handleSave} disabled={update.isPending} data-testid="anti-ban-save">
              {update.isPending ? t("Salvando…") : t("Salvar proteção")}
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
