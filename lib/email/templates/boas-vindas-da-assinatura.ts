/**
 * Boas-vindas de quem ASSINOU: o primeiro e-mail do cliente novo, com o link para
 * ele definir a senha. PT-BR, estilo inline, zero asset externo — o mesmo molde do
 * convite de time (`invite.ts`), inclusive a marca resolvida de quem instalou.
 *
 * O link é de uso único e vale pouco tempo (o prazo do servidor de autenticação).
 * Por isso o e-mail diz, sem rodeio, o caminho de quem abrir tarde: a tela de
 * entrada e o "Esqueci minha senha", com o mesmo e-mail.
 */
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";

export interface BoasVindasDaAssinaturaOptions {
  nome: string;
  email: string;
  linkDeAcesso: string;
  urlDeEntrada: string;
  marca: MarcaDeSaida;
}

export function buildBoasVindasDaAssinaturaEmail(opts: BoasVindasDaAssinaturaOptions): {
  subject: string;
  html: string;
  text: string;
} {
  const marca = opts.marca.nome;
  const subject = `Seu acesso ao ${marca} está liberado`;

  const logo = opts.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(opts.marca.logoUrl)}" alt="${escapeHtml(marca)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">
      ${escapeHtml(opts.nome)}, seu acesso está liberado
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5">
      Recebemos o pagamento da sua assinatura do ${escapeHtml(marca)}. Falta só um passo:
      definir a sua senha.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(opts.linkDeAcesso)}" style="display:inline-block;padding:12px 24px;background:${opts.marca.accent};color:${opts.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">
        Definir minha senha
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">
      Ou copie e cole este link no navegador:<br>
      <span style="word-break:break-all;color:${opts.marca.accent}">${escapeHtml(opts.linkDeAcesso)}</span>
    </p>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${NEUTROS_DE_SAIDA.suave}">
      O link funciona uma única vez e vale por pouco tempo. Se ele já tiver vencido, abra
      <a href="${escapeHtml(opts.urlDeEntrada)}" style="color:${opts.marca.accent}">${escapeHtml(opts.urlDeEntrada)}</a>,
      clique em <strong>Esqueci minha senha</strong> e informe <strong>${escapeHtml(opts.email)}</strong>.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `${opts.nome}, seu acesso ao ${marca} está liberado.`,
    "",
    "Recebemos o pagamento da sua assinatura. Falta só definir a sua senha:",
    opts.linkDeAcesso,
    "",
    "O link funciona uma única vez e vale por pouco tempo. Se ele já tiver vencido, abra",
    `${opts.urlDeEntrada}, clique em "Esqueci minha senha" e informe ${opts.email}.`,
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
