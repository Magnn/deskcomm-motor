/**
 * O FUNIL DOS QUIZZES no navegador (migration 0944): manda cada passo para o nosso banco, sem depender do pixel.
 *
 * A visita é um UUID guardado por quiz no navegador — quem volta à página continua a mesma visita, e o banco
 * ignora o passo repetido. A campanha vem do `utm_campaign` da primeira chegada (guardado junto), para que quem
 * volta sem a UTM ainda conte para o anúncio que a trouxe. Nada aqui lança nem atrasa a página: a medição
 * falhar não pode travar a venda.
 */
import type { PassoDoQuiz, QuizDaPagina } from "@/lib/area-do-cliente/passos-do-quiz";

interface Visita {
  id: string;
  campanha?: string;
  origem?: string;
}

const enviados = new Set<string>();

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Navegador antigo: um v4 montado à mão basta para separar visitas.
    return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }
}

function visitaDo(quiz: QuizDaPagina, slug: string): Visita {
  const chave = `quiz-visita:${slug}:${quiz}`;
  try {
    const salva = JSON.parse(localStorage.getItem(chave) ?? "null") as Visita | null;
    if (salva?.id) return salva;
  } catch {
    /* sem armazenamento: uma visita por carregamento */
  }
  const url = new URL(window.location.href);
  const visita: Visita = {
    id: novoId(),
    campanha: url.searchParams.get("utm_campaign")?.slice(0, 80) || undefined,
    origem: url.searchParams.get("utm_source")?.slice(0, 40) || undefined,
  };
  try {
    localStorage.setItem(chave, JSON.stringify(visita));
  } catch {
    /* nada */
  }
  return visita;
}

function enviar(slug: string, quiz: QuizDaPagina, passo: PassoDoQuiz | undefined, moeda?: "BRL" | "EUR" | "USD"): void {
  const visita = visitaDo(quiz, slug);
  let fuso: string | undefined;
  try {
    fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    /* sem fuso */
  }
  void fetch(`/api/v1/area/publica/${slug}/passo`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      visita: visita.id,
      quiz,
      ...(passo ? { passo } : {}),
      ...(visita.campanha ? { campanha: visita.campanha } : {}),
      ...(visita.origem ? { origem: visita.origem } : {}),
      ...(moeda ? { moeda } : {}),
      ...(fuso ? { fuso: fuso.slice(0, 60) } : {}),
      idioma: (navigator.language || "").slice(0, 20) || undefined,
      celular: window.matchMedia?.("(max-width: 768px)").matches ?? undefined,
    }),
  }).catch(() => {
    /* medição nunca derruba a página */
  });
}

export function marcarPasso(slug: string, quiz: QuizDaPagina, passo: PassoDoQuiz, moeda?: "BRL" | "EUR" | "USD"): void {
  try {
    const chave = `${visitaDo(quiz, slug).id}:${passo}`;
    if (enviados.has(chave)) return;
    enviados.add(chave);
    enviar(slug, quiz, passo, moeda);
  } catch {
    /* idem */
  }
}

/** O id desta visita, para o pedido de pagamento ligar a visita ao contato (o "quem é" do painel ao vivo). */
export function idDaVisita(slug: string, quiz: QuizDaPagina): string | undefined {
  try {
    return visitaDo(quiz, slug).id;
  } catch {
    return undefined;
  }
}

/**
 * O "ainda estou aqui": um sinal a cada 20 s enquanto a aba está VISÍVEL (aba escondida não conta como ao vivo).
 * Devolve a limpeza do efeito.
 */
export function manterVivo(slug: string, quiz: QuizDaPagina): () => void {
  const pulso = () => {
    try {
      if (document.visibilityState === "visible") enviar(slug, quiz, undefined);
    } catch {
      /* nada */
    }
  };
  const t = setInterval(pulso, 20_000);
  const aoVoltar = () => {
    if (document.visibilityState === "visible") pulso();
  };
  document.addEventListener("visibilitychange", aoVoltar);
  return () => {
    clearInterval(t);
    document.removeEventListener("visibilitychange", aoVoltar);
  };
}
