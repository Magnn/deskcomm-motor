/**
 * O RETRATO DO PAR — o quarto quiz da página (22/10/2026). Mecanismo, calculado de verdade:
 *
 *   • VÊNUS (o que te ATRAI): o signo em que Vênus estava no nascimento, pela posição real (astronomy-engine).
 *   • DESCENDENTE (o que te FAZ BEM): a cúspide da casa 7, oposta ao Ascendente — exige a HORA e o LUGAR. O
 *     Ascendente sai do tempo sideral local, da latitude e da obliquidade da eclíptica.
 *
 * O "problema" que a prévia nomeia é o encontro (ou desencontro) dos dois: quando Vênus e o Descendente moram em
 * elementos que não conversam, a pessoa se apaixona pelo que não a faz bem — e o padrão se repete. A "solução" é o
 * perfil em que os dois se encontram. Nada aqui descreve uma pessoa real, um nome ou um destino: é tendência.
 *
 * Sem hora, só Vênus (o Descendente fica marcado como "precisa da hora"). O lugar é a CAPITAL do estado (ou a
 * cidade de Portugal): a diferença para a cidade exata é de poucos graus no Ascendente, e a tela diz isso.
 *
 * Pura (sem rede); roda no servidor e no navegador.
 */
import * as Astronomy from "astronomy-engine";

export const SIGNOS_DO_ZODIACO = ["Áries", "Touro", "Gêmeos", "Câncer", "Leão", "Virgem", "Libra", "Escorpião", "Sagitário", "Capricórnio", "Aquário", "Peixes"] as const;
export type SignoDoZodiaco = (typeof SIGNOS_DO_ZODIACO)[number];
export type ElementoDoSigno = "fogo" | "terra" | "ar" | "água";

const ELEMENTO_POR_INDICE: ElementoDoSigno[] = ["fogo", "terra", "ar", "água"];
export const elementoDoSigno = (s: SignoDoZodiaco): ElementoDoSigno => ELEMENTO_POR_INDICE[SIGNOS_DO_ZODIACO.indexOf(s) % 4]!;
export const signosDoElemento = (e: ElementoDoSigno): SignoDoZodiaco[] => SIGNOS_DO_ZODIACO.filter((s) => elementoDoSigno(s) === e);

/** Fogo conversa com ar; terra com água; cada elemento consigo mesmo. */
export const elementosConversam = (a: ElementoDoSigno, b: ElementoDoSigno): boolean =>
  a === b || [a, b].sort().join("+") === "ar+fogo" || [a, b].sort().join("+") === "terra+água";

/** Onde se nasceu: a capital de cada estado e duas cidades de Portugal, com o fuso histórico (IANA). */
export const LUGARES_DE_NASCIMENTO = [
  { id: "AC", nome: "Acre (Rio Branco)", lat: -9.97, lon: -67.81, fuso: "America/Rio_Branco" },
  { id: "AL", nome: "Alagoas (Maceió)", lat: -9.67, lon: -35.74, fuso: "America/Maceio" },
  { id: "AP", nome: "Amapá (Macapá)", lat: 0.03, lon: -51.07, fuso: "America/Belem" },
  { id: "AM", nome: "Amazonas (Manaus)", lat: -3.12, lon: -60.02, fuso: "America/Manaus" },
  { id: "BA", nome: "Bahia (Salvador)", lat: -12.97, lon: -38.5, fuso: "America/Bahia" },
  { id: "CE", nome: "Ceará (Fortaleza)", lat: -3.73, lon: -38.52, fuso: "America/Fortaleza" },
  { id: "DF", nome: "Distrito Federal (Brasília)", lat: -15.79, lon: -47.88, fuso: "America/Sao_Paulo" },
  { id: "ES", nome: "Espírito Santo (Vitória)", lat: -20.32, lon: -40.34, fuso: "America/Sao_Paulo" },
  { id: "GO", nome: "Goiás (Goiânia)", lat: -16.68, lon: -49.25, fuso: "America/Sao_Paulo" },
  { id: "MA", nome: "Maranhão (São Luís)", lat: -2.53, lon: -44.3, fuso: "America/Fortaleza" },
  { id: "MT", nome: "Mato Grosso (Cuiabá)", lat: -15.6, lon: -56.1, fuso: "America/Cuiaba" },
  { id: "MS", nome: "Mato Grosso do Sul (Campo Grande)", lat: -20.44, lon: -54.65, fuso: "America/Campo_Grande" },
  { id: "MG", nome: "Minas Gerais (Belo Horizonte)", lat: -19.92, lon: -43.94, fuso: "America/Sao_Paulo" },
  { id: "PA", nome: "Pará (Belém)", lat: -1.46, lon: -48.49, fuso: "America/Belem" },
  { id: "PB", nome: "Paraíba (João Pessoa)", lat: -7.12, lon: -34.86, fuso: "America/Fortaleza" },
  { id: "PR", nome: "Paraná (Curitiba)", lat: -25.43, lon: -49.27, fuso: "America/Sao_Paulo" },
  { id: "PE", nome: "Pernambuco (Recife)", lat: -8.05, lon: -34.88, fuso: "America/Recife" },
  { id: "PI", nome: "Piauí (Teresina)", lat: -5.09, lon: -42.8, fuso: "America/Fortaleza" },
  { id: "RJ", nome: "Rio de Janeiro", lat: -22.91, lon: -43.17, fuso: "America/Sao_Paulo" },
  { id: "RN", nome: "Rio Grande do Norte (Natal)", lat: -5.79, lon: -35.21, fuso: "America/Fortaleza" },
  { id: "RS", nome: "Rio Grande do Sul (Porto Alegre)", lat: -30.03, lon: -51.23, fuso: "America/Sao_Paulo" },
  { id: "RO", nome: "Rondônia (Porto Velho)", lat: -8.76, lon: -63.9, fuso: "America/Porto_Velho" },
  { id: "RR", nome: "Roraima (Boa Vista)", lat: 2.82, lon: -60.67, fuso: "America/Boa_Vista" },
  { id: "SC", nome: "Santa Catarina (Florianópolis)", lat: -27.6, lon: -48.55, fuso: "America/Sao_Paulo" },
  { id: "SP", nome: "São Paulo", lat: -23.55, lon: -46.63, fuso: "America/Sao_Paulo" },
  { id: "SE", nome: "Sergipe (Aracaju)", lat: -10.91, lon: -37.07, fuso: "America/Maceio" },
  { id: "TO", nome: "Tocantins (Palmas)", lat: -10.18, lon: -48.33, fuso: "America/Araguaina" },
  { id: "PT-LIS", nome: "Portugal (Lisboa e Sul)", lat: 38.72, lon: -9.14, fuso: "Europe/Lisbon" },
  { id: "PT-POR", nome: "Portugal (Porto e Norte)", lat: 41.15, lon: -8.61, fuso: "Europe/Lisbon" },
] as const;
export type LugarDeNascimento = (typeof LUGARES_DE_NASCIMENTO)[number];
export const lugarPorId = (id: string | null | undefined): LugarDeNascimento | null => LUGARES_DE_NASCIMENTO.find((l) => l.id === id) ?? null;

const norm = (g: number) => ((g % 360) + 360) % 360;
const RAD = Math.PI / 180;

/** Diferença (minutos) entre a hora de parede no fuso e o UTC, no instante `quando`. */
function deslocamentoMin(fuso: string, quando: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(quando);
  const v = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const parede = Date.UTC(v("year"), v("month") - 1, v("day"), v("hour"), v("minute"), v("second"));
  return Math.round((parede - quando.getTime()) / 60000);
}

/** O instante UTC de "AAAA-MM-DD HH:MM" na hora local do fuso (inclui o horário de verão da época). */
export function instanteDoNascimento(iso: string, hora: string, fuso: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const h = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!d || !h) return null;
  const local = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2]));
  let utc = local;
  for (let i = 0; i < 3; i++) utc = local - deslocamentoMin(fuso, new Date(utc)) * 60000;
  return new Date(utc);
}

const signoDaLongitude = (lon: number): SignoDoZodiaco => SIGNOS_DO_ZODIACO[Math.floor(norm(lon) / 30)]!;

/** Longitude eclíptica de Vênus (geocêntrica, tropical). */
export function longitudeDeVenus(quando: Date): number {
  return norm(Astronomy.Ecliptic(Astronomy.GeoVector(Astronomy.Body.Venus, quando, true)).elon);
}

/**
 * O Ascendente (longitude eclíptica) pelo tempo sideral local (RAMC), a latitude e a obliquidade média:
 * λ = atan2(cos θ, −(sen θ·cos ε + tan φ·sen ε)). No equador, com o Meio do Céu em 0° de Áries, dá 90° (Câncer).
 */
export function longitudeDoAscendente(quando: Date, lat: number, lon: number): number {
  const ramc = norm(Astronomy.SiderealTime(quando) * 15 + lon) * RAD;
  const t = (quando.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const eps = (23.439291 - 0.0130042 * t) * RAD;
  const fi = lat * RAD;
  return norm(Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(fi) * Math.sin(eps))) / RAD);
}

/** O que cada Vênus ATRAI — uma frase, em tendência. */
const O_QUE_ATRAI: Record<SignoDoZodiaco, string> = {
  Áries: "gente decidida, que toma a iniciativa e traz desafio",
  Touro: "presença, toque e quem oferece segurança e conforto",
  Gêmeos: "conversa boa, humor e quem estimula a sua mente",
  Câncer: "cuidado, acolhimento e quem faz você se sentir em casa",
  Leão: "admiração, brilho e quem faz você se sentir especial",
  Virgem: "atenção aos detalhes e quem demonstra amor no cuidado prático",
  Libra: "elegância, gentileza e parceria equilibrada",
  Escorpião: "intensidade, mistério e entrega profunda",
  Sagitário: "liberdade, aventura e quem amplia o seu mundo",
  Capricórnio: "maturidade, compromisso e quem constrói junto",
  Aquário: "originalidade, amizade e quem respeita o seu espaço",
  Peixes: "romance, sensibilidade e conexão quase sem palavras",
};

/** O que cada Descendente pede de um parceiro — o que FAZ BEM. */
const O_QUE_FAZ_BEM: Record<SignoDoZodiaco, string> = {
  Áries: "alguém com coragem e iniciativa, que tire você da espera",
  Touro: "alguém estável e paciente, que traga calma e constância",
  Gêmeos: "alguém leve e curioso, com quem a conversa nunca acaba",
  Câncer: "alguém afetuoso e protetor, que faça a relação virar lar",
  Leão: "alguém generoso e caloroso, que celebre você em voz alta",
  Virgem: "alguém dedicado e atento, que mostre o amor no dia a dia",
  Libra: "alguém parceiro e justo, que divida as decisões",
  Escorpião: "alguém leal e profundo, que não fuja das conversas difíceis",
  Sagitário: "alguém otimista e livre, que cresça junto com você",
  Capricórnio: "alguém responsável e firme, com planos de longo prazo",
  Aquário: "alguém amigo e independente, que respeite a sua liberdade",
  Peixes: "alguém sensível e compassivo, que entenda sem você explicar",
};

export interface RetratoDoPar {
  venus: { signo: SignoDoZodiaco; grau: number; elemento: ElementoDoSigno; atrai: string };
  /** `null` quando falta a hora ou o lugar. */
  descendente: { signo: SignoDoZodiaco; grau: number; elemento: ElementoDoSigno; fazBem: string; ascendente: SignoDoZodiaco } | null;
  /** Os signos do perfil em que atração e bem-estar se encontram. */
  combinam: SignoDoZodiaco[];
  /** O mecanismo do problema, em uma frase: os dois conversam ou desencontram? */
  encontro: "conversam" | "desencontram" | "sem_hora";
}

/**
 * O retrato inteiro. Com hora e lugar: Vênus + Descendente; os signos que combinam são os do elemento do
 * Descendente (o que faz bem). Sem hora: só Vênus; os que combinam são os do elemento de Vênus.
 */
export function retratoDoPar(d: { nascimento: string; hora?: string | null; lugar?: string | null }): RetratoDoPar | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento)) return null;
  const lugar = lugarPorId(d.lugar);
  const comHora = d.hora && /^\d{2}:\d{2}$/.test(d.hora) && lugar;
  // Sem hora, o meio-dia de Brasília: Vênus anda ~1° por dia, e o signo quase nunca muda no mesmo dia.
  const quando = comHora ? instanteDoNascimento(d.nascimento, d.hora!, lugar!.fuso) : instanteDoNascimento(d.nascimento, "12:00", "America/Sao_Paulo");
  if (!quando) return null;
  const lv = longitudeDeVenus(quando);
  const sv = signoDaLongitude(lv);
  const venus = { signo: sv, grau: Math.floor(lv % 30), elemento: elementoDoSigno(sv), atrai: O_QUE_ATRAI[sv] };
  if (!comHora) return { venus, descendente: null, combinam: signosDoElemento(venus.elemento), encontro: "sem_hora" };
  const la = longitudeDoAscendente(quando, lugar!.lat, lugar!.lon);
  const ld = norm(la + 180);
  const sd = signoDaLongitude(ld);
  const descendente = { signo: sd, grau: Math.floor(ld % 30), elemento: elementoDoSigno(sd), fazBem: O_QUE_FAZ_BEM[sd], ascendente: signoDaLongitude(la) };
  return {
    venus,
    descendente,
    combinam: signosDoElemento(descendente.elemento),
    encontro: elementosConversam(venus.elemento, descendente.elemento) ? "conversam" : "desencontram",
  };
}
