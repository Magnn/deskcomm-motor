/**
 * EXPORTAR UMA CONVERSA — a conversa inteira, do começo ao fim, num arquivo.
 *
 * Pedido do dono em 29/10/2026: guardar ou mandar a outra pessoa o atendimento completo de um cliente.
 * A tela do chat pagina de 50 em 50 e não tem como copiar tudo de uma vez.
 *
 * Dois formatos, os dois montados aqui sem rede nem banco (a rota busca e assina; isto só escreve):
 *   - TEXTO: uma linha por mensagem, `[dd/mm/aaaa hh:mm] Quem: texto`, o formato que o próprio
 *     WhatsApp usa ao exportar. Abre em qualquer lugar e cabe numa colagem.
 *   - PÁGINA: balões como no chat, com as fotos, pronta para "Salvar como PDF" na impressão do
 *     navegador. PDF gerado no servidor exigiria um navegador inteiro dentro da imagem.
 *
 * Mídia não vira arquivo: a foto entra na página por URL assinada (vale por pouco tempo, então o PDF
 * deve ser salvo na hora), e áudio, vídeo e documento entram como rótulo, com a transcrição quando há.
 */
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO, type Idioma } from "@/lib/i18n/idiomas";

export interface MensagemDaExportacao {
  direction: "inbound" | "outbound" | string;
  type: string;
  body: string | null;
  media_derived_text: string | null;
  sent_via: string | null;
  sent_at: string;
  revoked_at: string | null;
  /** URL assinada da foto, quando a mensagem é imagem e o arquivo está no armazenamento. */
  imagemUrl?: string | null;
}

export interface DadosDaExportacao {
  cliente: string;
  telefone: string | null;
  fuso: string;
  mensagens: MensagemDaExportacao[];
  geradoEm: Date;
  /** Idioma de quem exporta. A data sai sempre dd/mm/aaaa hh:mm; o idioma só escolhe o calendário do Intl. */
  idioma?: Idioma;
}

const ROTULO_DA_MIDIA: Record<string, string> = {
  image: "foto",
  audio: "áudio",
  voice: "áudio",
  ptt: "áudio",
  video: "vídeo",
  document: "documento",
  sticker: "figurinha",
  location: "localização",
  contact: "contato",
};

/** Quem falou. A IA aparece como IA: quem lê o arquivo precisa saber o que foi automático. */
export function quemFalou(m: Pick<MensagemDaExportacao, "direction" | "sent_via">, cliente: string): string {
  if (m.direction === "inbound") return cliente;
  switch (m.sent_via) {
    case "ai":
      return "Atendente (IA)";
    case "automation":
      return "Automação";
    case "system":
      return "Sistema";
    case "external_device":
      return "Equipe (celular)";
    default:
      return "Equipe";
  }
}

/** O conteúdo de uma mensagem em texto corrido: o texto, o rótulo da mídia e a transcrição. */
export function conteudoDaMensagem(m: MensagemDaExportacao): string {
  if (m.revoked_at) return "(mensagem apagada)";
  const partes: string[] = [];
  const midia = ROTULO_DA_MIDIA[m.type];
  if (midia) partes.push(`[${midia}]`);
  const corpo = (m.body ?? "").trim();
  if (corpo) partes.push(corpo);
  const derivado = (m.media_derived_text ?? "").trim();
  if (derivado && derivado !== corpo) partes.push(midia === "áudio" ? `(transcrição: ${derivado})` : `(${derivado})`);
  return partes.join(" ") || "(sem texto)";
}

/** `dd/mm/aaaa hh:mm` no fuso da organização. */
export function dataHora(iso: string, fuso: string, idioma: Idioma = IDIOMA_PADRAO): string {
  const d = new Date(iso);
  const p = Object.fromEntries(
    new Intl.DateTimeFormat(tagDeIdioma(idioma), {
      timeZone: fuso,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function cabecalho(d: DadosDaExportacao): string[] {
  return [
    `Conversa com ${d.cliente}${d.telefone ? ` (${d.telefone})` : ""}`,
    `${d.mensagens.length} mensagens · exportada em ${dataHora(d.geradoEm.toISOString(), d.fuso, d.idioma)} (${d.fuso})`,
  ];
}

export function textoDaConversa(d: DadosDaExportacao): string {
  const linhas = [...cabecalho(d), ""];
  for (const m of d.mensagens) {
    linhas.push(`[${dataHora(m.sent_at, d.fuso, d.idioma)}] ${quemFalou(m, d.cliente)}: ${conteudoDaMensagem(m)}`);
  }
  return linhas.join("\n") + "\n";
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Só URL https vai para dentro de `src`: o resto vira rótulo. */
function imagemSegura(url: string | null | undefined): string | null {
  return url && /^https:\/\//.test(url) ? url : null;
}

export function paginaDaConversa(d: DadosDaExportacao): string {
  const [titulo, sub] = cabecalho(d);
  let diaAnterior = "";
  const baloes: string[] = [];
  for (const m of d.mensagens) {
    const quando = dataHora(m.sent_at, d.fuso, d.idioma);
    const dia = quando.slice(0, 10);
    if (dia !== diaAnterior) {
      baloes.push(`<div class="dia">${dia}</div>`);
      diaAnterior = dia;
    }
    const lado = m.direction === "inbound" ? "cliente" : "nos";
    const img = !m.revoked_at && m.type === "image" ? imagemSegura(m.imagemUrl) : null;
    const texto = img ? conteudoDaMensagem({ ...m, type: "text" }) : conteudoDaMensagem(m);
    baloes.push(
      `<div class="msg ${lado}"><div class="quem">${escaparHtml(quemFalou(m, d.cliente))}</div>` +
        (img ? `<img src="${escaparHtml(img)}" alt="foto">` : "") +
        (texto !== "(sem texto)" || !img ? `<div class="texto">${escaparHtml(texto)}</div>` : "") +
        `<div class="hora">${quando.slice(11)}</div></div>`,
    );
  }
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${escaparHtml(titulo!)}</title>
<style>
:root{color-scheme:light}
body{margin:0;background:#efeae2;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111b21}
header{background:#fff;padding:16px;border-bottom:1px solid #d1d7db;position:sticky;top:0}
header h1{margin:0;font-size:17px}header p{margin:4px 0 0;color:#54656f;font-size:13px}
header button{margin-top:10px;padding:8px 14px;border:0;border-radius:6px;background:#00a884;color:#fff;font-weight:600;cursor:pointer}
main{max-width:820px;margin:0 auto;padding:12px 16px 40px;display:flex;flex-direction:column;gap:6px}
.dia{align-self:center;background:#fff;color:#54656f;font-size:12px;padding:4px 10px;border-radius:8px;margin:10px 0 4px}
.msg{max-width:75%;padding:6px 9px 4px;border-radius:8px;box-shadow:0 1px .5px rgba(0,0,0,.13);break-inside:avoid}
.cliente{align-self:flex-start;background:#fff}.nos{align-self:flex-end;background:#d9fdd3}
.quem{font-size:12px;font-weight:600;color:#027eb5}.nos .quem{color:#1f7a4d}
.texto{white-space:pre-wrap;overflow-wrap:anywhere}
.msg img{display:block;max-width:100%;max-height:360px;border-radius:6px;margin:4px 0}
.hora{text-align:right;font-size:11px;color:#667781}
@media print{header{position:static}header button{display:none}body{background:#fff}.msg{box-shadow:none;border:1px solid #d1d7db}}
</style></head><body>
<header><h1>${escaparHtml(titulo!)}</h1><p>${escaparHtml(sub!)}</p>
<button type="button" onclick="window.print()">Salvar como PDF</button></header>
<main>${baloes.join("\n")}</main>
</body></html>`;
}

/** Nome de arquivo sem acento nem caractere que o sistema recuse. */
export function nomeDoArquivo(cliente: string, geradoEm: Date, extensao: string): string {
  const base = cliente
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `conversa-${base || "cliente"}-${geradoEm.toISOString().slice(0, 10)}.${extensao}`;
}
