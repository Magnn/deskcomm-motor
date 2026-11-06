/**
 * O e-mail que a área do cliente manda (hoje, o código de entrada) — com a MARCA DA ÁREA.
 *
 * A área pode ter marca própria (`config.titulo`, ex.: "Meu Mistério") diferente da marca da
 * organização no painel: a cliente conhece a casa pelo nome da área, e um código que chega com o
 * nome de outra empresa parece golpe. Por isso o remetente e o corpo usam o título da área, e a
 * marca da organização (`marcaDaSaida`) só entra quando a área não tem título.
 *
 * Tema claro, como toda saída sem DOM desta casa (cliente de e-mail não respeita fundo escuro de
 * forma confiável); a identidade vai no nome em versalete, na lua e no acento dourado.
 */

/** O acento dourado da área (o mesmo das telas), escurecido para ler bem sobre o branco. */
const DOURADO = "#9a7420";

export type EmailDoCodigo = { fromName: string; subject: string; text: string; html: string };

const semHtml = (t: string) => t.replace(/[<>&"]/g, "");

/**
 * Monta o e-mail do código. `titulo` = o título da área; `marcaDaOrganizacao` = o nome que vale
 * quando a área não tem título; `guia` = o nome da guia da casa, quando há.
 */
export function emailDoCodigoDaArea(args: {
  codigo: string;
  validadeMin: number;
  titulo: string | null | undefined;
  marcaDaOrganizacao: string;
  guia?: string | null;
}): EmailDoCodigo {
  const marca = (args.titulo ?? "").trim() || args.marcaDaOrganizacao;
  const guia = (args.guia ?? "").trim();
  const assinatura = guia ? `${marca} · com ${guia}` : marca;
  const text = [
    `${marca}`,
    ``,
    `Seu código para entrar é ${args.codigo}.`,
    `Ele vale ${args.validadeMin} minutos.`,
    ``,
    `Se não foi você que pediu, pode ignorar este e-mail: ninguém entra sem o código.`,
    ``,
    assinatura,
  ].join("\n");
  const html = `<div style="background:#f7f4ee;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece4d3;text-align:center">
<p style="margin:0;font-size:22px;color:${DOURADO}">&#9790;</p>
<p style="margin:6px 0 24px;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${DOURADO};font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(marca)}</p>
<p style="margin:0 0 14px;font-size:17px;color:#2a2233">Seu código para entrar:</p>
<p style="margin:0 0 18px;font-size:36px;letter-spacing:8px;font-weight:700;color:#2a2233;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(args.codigo)}</p>
<p style="margin:0 0 24px;font-size:13px;color:#6b6475;font-family:system-ui,-apple-system,Segoe UI,sans-serif">Ele vale ${args.validadeMin} minutos. Se não foi você que pediu, pode ignorar: ninguém entra sem o código.</p>
<p style="margin:0;font-size:13px;font-style:italic;color:${DOURADO}">${semHtml(assinatura)}</p>
</div>
</div>`;
  return { fromName: marca, subject: `${args.codigo} é o seu código · ${marca}`, text, html };
}

export type EmailDoAvisoDeRenovacao = { fromName: string; subject: string; text: string; html: string };

/**
 * O aviso 48 h antes de o Plano da Semana renovar no cartão (migration 0958): o valor, o dia e o caminho de um
 * toque para cancelar. Sem este e-mail a rodada não cobra (`plano-semanal-renovacao.ts`).
 *
 * shortcut: idioma pela moeda (BRL → português, outras → inglês); a área não guarda o idioma da pessoa no servidor
 * (é cookie do aparelho). Quando guardar, trocar pela escolha dela.
 */
export function emailDoAvisoDeRenovacao(args: {
  titulo: string | null | undefined;
  marcaDaOrganizacao: string;
  nomeDoPlano: string;
  nomeDaPessoa: string | null;
  valor: string;
  dia: string;
  link: string;
  emPortugues: boolean;
}): EmailDoAvisoDeRenovacao {
  const marca = (args.titulo ?? "").trim() || args.marcaDaOrganizacao;
  const primeiro = (args.nomeDaPessoa ?? "").trim().split(/\s+/)[0] ?? "";
  const pt = args.emPortugues;
  const ola = pt ? (primeiro ? `Oi, ${primeiro}.` : "Oi.") : primeiro ? `Hi ${primeiro},` : "Hi,";
  const linhas = pt
    ? [
        `O seu ${args.nomeDoPlano} renova sozinho no dia ${args.dia}: ${args.valor} no cartão que você usou, por mais 7 dias.`,
        `Para continuar, não precisa fazer nada.`,
        `Para não renovar, entre na sua área e toque em "Cancelar renovação". Depois de cancelar, nada mais é cobrado.`,
      ]
    : [
        `Your ${args.nomeDoPlano} renews on ${args.dia}: ${args.valor} on the card you used, for 7 more days.`,
        `To keep it, you don't need to do anything.`,
        `To stop it, open your area and tap "Cancel renewal". After you cancel, nothing else is charged.`,
      ];
  const botao = pt ? "Abrir a minha área" : "Open my area";
  const text = [marca, "", ola, "", ...linhas, "", `${botao}: ${args.link}`, "", marca].join("\n");
  const html = `<div style="background:#f7f4ee;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece4d3">
<p style="margin:0;font-size:22px;color:${DOURADO};text-align:center">&#9790;</p>
<p style="margin:6px 0 24px;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${DOURADO};text-align:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(marca)}</p>
<p style="margin:0 0 14px;font-size:17px;color:#2a2233">${semHtml(ola)}</p>
${linhas.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#2a2233;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(l)}</p>`).join("\n")}
<p style="margin:22px 0 0;text-align:center"><a href="${semHtml(args.link)}" style="display:inline-block;background:${DOURADO};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${botao}</a></p>
</div>
</div>`;
  const subject = pt ? `O seu ${args.nomeDoPlano} renova em ${args.dia} · ${marca}` : `Your ${args.nomeDoPlano} renews on ${args.dia} · ${marca}`;
  return { fromName: marca, subject, text, html };
}
