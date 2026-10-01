/**
 * Interpola variáveis de template com dados do contato da conversa (Onda 5 + Etapa 2).
 * Suporta:
 *  - {{nome}} e {{primeiro_nome}}
 *  - {{email}}
 *  - {{telefone}} ou {{phone}}
 *  - {{empresa}} ou {{company}}
 *  - {{saudacao}} (Bom dia / Boa tarde / Boa noite)
 * Variável sem valor ou desconhecida mantém o literal `{{x}}` — nunca gera texto quebrado.
 */
export interface TemplateContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  custom_fields?: Record<string, unknown> | null;
}

export function interpolateTemplate(body: string, contact: TemplateContact): string {
  const full = (contact.name ?? "").trim();
  const first = full.split(/\s+/)[0] ?? "";
  const email = (contact.email ?? "").trim();
  const phone = (contact.phone ?? "").trim();
  const company = (contact.company ?? "").trim();

  const horaAtual = new Date().getHours();
  const saudacao = horaAtual >= 5 && horaAtual < 12 ? "Bom dia" : horaAtual >= 12 && horaAtual < 18 ? "Boa tarde" : "Boa noite";

  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (literal, rawKey: string) => {
    const key = rawKey.toLowerCase();
    if (key === "nome") return full !== "" ? full : literal;
    if (key === "primeiro_nome") return first !== "" ? first : literal;
    if (key === "email") return email !== "" ? email : literal;
    if (key === "telefone" || key === "phone") return phone !== "" ? phone : literal;
    if (key === "empresa" || key === "company") return company !== "" ? company : literal;
    if (key === "saudacao") return saudacao;

    // Campos personalizados (ex: {{custom.cargo}} ou {{cargo}})
    if (contact.custom_fields) {
      const cfKey = key.startsWith("custom.") ? key.slice(7) : key;
      const val = contact.custom_fields[cfKey];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        return String(val);
      }
    }

    return literal; // desconhecida: mantém
  });
}
