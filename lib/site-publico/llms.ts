import { guias } from "./guias";
import { fatosDoServico, siteIndexavel } from "./site";

/**
 * `/llms.txt` e `/llms-full.txt` (padrão llmstxt.org): o resumo do serviço em Markdown, para assistentes
 * de IA lerem sem precisar renderizar a página. O curto aponta para as páginas; o completo traz os
 * guias inteiros. Mesma fonte de fatos do JSON-LD (`fatosDoServico`), então os dois não divergem.
 */
export function textoDoLlms(completo: boolean): string | null {
  if (!siteIndexavel()) return null;
  const f = fatosDoServico();
  const lista = guias(f);
  const linhas: string[] = [
    `# ${f.nome}`,
    "",
    `> ${f.resumo}`,
    "",
    "## Fatos",
    "",
    `- Categoria: ${f.categoria}`,
    `- Site: ${f.url}`,
    `- País e idioma: ${f.pais}, ${f.idioma}`,
    `- Canais: ${f.canais.join(", ")}`,
    `- Preço: ${f.aPartirDe ? `a partir de ${f.aPartirDe}/mês` : "plano mensal"}. ${f.gratisParaTestar}`,
    `- Para quem: ${f.paraQuem.join("; ")}`,
    "",
    "## Recursos",
    "",
    ...f.recursos.map((r) => `- ${r}`),
    "",
    "## Planos",
    "",
    ...f.planos.map(
      (p) =>
        `- ${p.nome}: ${p.precoMensal}/mês, ${p.numeros === 1 ? "1 número" : `${p.numeros} números`} de WhatsApp${p.conversasMensais > 0 ? `, ${p.conversasMensais.toLocaleString("pt-BR")} conversas atendidas pela IA por mês` : ""}, equipe sem limite de usuários`,
    ),
    "",
    "## Páginas",
    "",
    `- [Página inicial](${f.url}/): o que é, recursos, planos e perguntas frequentes`,
    `- [Criar conta](${f.url}/signup): grátis para montar o agente`,
    `- [Guias](${f.url}/guias): respostas sobre IA no WhatsApp`,
    ...lista.map((g) => `- [${g.titulo}](${f.url}/guias/${g.slug}): ${g.descricao}`),
  ];
  if (completo) {
    for (const g of lista) {
      linhas.push("", "---", "", `# ${g.titulo}`, "", g.resposta);
      for (const s of g.secoes) linhas.push("", `## ${s.titulo}`, "", ...s.paragrafos.flatMap((p) => [p, ""]));
      linhas.push("## Perguntas frequentes", "");
      for (const q of g.perguntas) linhas.push(`**${q.pergunta}**`, "", q.resposta, "");
    }
  }
  return `${linhas.join("\n").trimEnd()}\n`;
}

export function respostaDoLlms(completo: boolean): Response {
  const texto = textoDoLlms(completo);
  if (texto === null) return new Response("Not found\n", { status: 404 });
  return new Response(texto, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
