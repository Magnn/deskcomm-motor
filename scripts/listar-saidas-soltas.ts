/**
 * Lista as saídas SOLTAS dos fluxos ATIVOS — para conferir, antes do deploy, o que a regra
 * «saída solta deixa o lead parado» muda em fluxos que já estão no ar. SOMENTE LEITURA.
 *
 *   SUPABASE_DB_URL=postgres://... pnpm tsx scripts/listar-saidas-soltas.ts
 *
 * Para cada decisão cuja saída não tem aresta, diz:
 *   • `escape` — o motor antigo mandava o lead para o «Outros casos» (agora ele PARA);
 *   • `erro`   — o motor antigo falhava (backoff, depois `dead`); agora o lead PARA sem alarme.
 */
import pg from "pg";

import { flowGraphSchema } from "../lib/followup/graph-schema";
import { saidasSoltasDoGrafo } from "../lib/followup/saidas-soltas";

async function main(): Promise<void> {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error("Defina SUPABASE_DB_URL.");
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const { rows } = await pool.query<{ organization_id: string; pointer: string; graph: unknown }>(
      `select p.organization_id, p.name as pointer, v.graph
         from followup_flow_pointers p
         join followup_flow_versions v on v.id = p.active_version_id and v.organization_id = p.organization_id
        where p.status = 'active'
        order by p.organization_id, p.name`,
    );
    let total = 0;
    for (const r of rows) {
      const parsed = flowGraphSchema.safeParse(r.graph);
      if (!parsed.success) {
        console.log(`! ${r.pointer} (${r.organization_id}): grafo ilegível — não conferido`);
        continue;
      }
      const soltas = saidasSoltasDoGrafo(parsed.data);
      if (soltas.length === 0) continue;
      console.log(`\n${r.pointer}  [org ${r.organization_id}]`);
      for (const s of soltas) {
        total++;
        const antes = s.antes === "escape" ? `ia para «${s.iaPara}» (MUDA: agora para)` : "falhava (agora para, sem alarme)";
        console.log(`  - ${s.nodeLabel} (${s.nodeType}) · saída «${s.saida}» · antes: ${antes}`);
      }
    }
    console.log(`\n${rows.length} fluxo(s) ativo(s) conferido(s); ${total} saída(s) solta(s).`);
  } finally {
    await pool.end();
  }
}

void main();
