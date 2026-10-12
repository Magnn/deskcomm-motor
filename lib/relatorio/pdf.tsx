/**
 * O PDF DO RELATÓRIO SOB MEDIDA — capa, mapa (quando há cálculo), capítulos, chaves, sete dias, carta e a página
 * "o que esta leitura é". Renderizado para Buffer com `@react-pdf/renderer`, sem navegador: roda no worker.
 *
 * Cores em hex de propósito: `var()` e `oklch()` rendem PDF válido e somem em silêncio nesta biblioteca
 * (ver `lib/lgpd/pdf-renderer.tsx`). As fontes são as embutidas (Helvetica, Times), que cobrem o português; por
 * isso os planetas aparecem por nome abreviado e não por glifo.
 */
import { Circle, Document, G, Line, Page, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import { SIGNOS, type Aspecto, type Mapa, type Planeta, type Sinastria } from "./astrologia";
import type { ConteudoDoRelatorio } from "./tipos";

const NOITE = "#171226";
const OURO = "#b8935a";
const OURO_CLARO = "#f1dba6";
const TEXTO = "#2a2437";
const SUAVE = "#6d6580";
const PAPEL = "#fbf8f2";
const LINHA = "#e7dfcf";
const ROSA = "#b85c73";
const AZUL = "#3d3a8c";

const s = StyleSheet.create({
  capa: { backgroundColor: NOITE, padding: 44, alignItems: "center", justifyContent: "center" },
  sobre: { color: OURO_CLARO, fontSize: 8, letterSpacing: 2.4, textTransform: "uppercase" },
  tituloDaCapa: { color: "#ffffff", fontFamily: "Times-Bold", fontSize: 34, textAlign: "center", marginTop: 26, lineHeight: 1.1 },
  nomes: { color: OURO, fontFamily: "Times-Italic", fontSize: 22, marginTop: 10, textAlign: "center" },
  fio: { width: 60, height: 1, backgroundColor: OURO, marginVertical: 22 },
  fraseDaCapa: { color: "#d8d0ea", fontSize: 10.5, textAlign: "center", lineHeight: 1.5, maxWidth: 280 },
  peDaCapa: { position: "absolute", bottom: 34, left: 0, right: 0, textAlign: "center", color: "#a99fc4", fontSize: 7.5, letterSpacing: 1.8, textTransform: "uppercase" },
  pagina: { backgroundColor: PAPEL, paddingTop: 42, paddingBottom: 44, paddingHorizontal: 40, color: TEXTO, fontFamily: "Helvetica", fontSize: 10.5, lineHeight: 1.5 },
  num: { color: ROSA, fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 2, textTransform: "uppercase" },
  h2: { fontFamily: "Times-Bold", fontSize: 23, color: NOITE, marginTop: 4, lineHeight: 1.1 },
  fioDoTitulo: { width: 40, height: 2, backgroundColor: OURO, marginTop: 10, marginBottom: 14 },
  abre: { fontFamily: "Times-Italic", fontSize: 14, lineHeight: 1.35, color: "#3d3358", marginBottom: 10 },
  p: { marginBottom: 8 },
  descoberta: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: LINHA, borderLeftWidth: 3, borderLeftColor: OURO, borderRadius: 6, padding: 14, marginVertical: 8 },
  rotulo: { color: SUAVE, fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.8, textTransform: "uppercase" },
  h3: { fontFamily: "Times-Bold", fontSize: 15, color: NOITE, marginTop: 3, marginBottom: 6, lineHeight: 1.2 },
  aplique: { backgroundColor: "#f6f0e2", borderRadius: 5, padding: 10, marginTop: 2 },
  apliqueRotulo: { color: ROSA, fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 3 },
  chave: { flexDirection: "row", marginBottom: 14 },
  bola: { width: 26, height: 26, borderRadius: 13, backgroundColor: NOITE, alignItems: "center", justifyContent: "center", marginRight: 12 },
  bolaTexto: { color: OURO_CLARO, fontFamily: "Times-Bold", fontSize: 14 },
  chaveTitulo: { fontFamily: "Times-Bold", fontSize: 14.5, color: NOITE, marginBottom: 3 },
  dia: { flexDirection: "row", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: LINHA },
  diaN: { width: 44, color: ROSA, fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.2, textTransform: "uppercase", paddingTop: 3 },
  negrito: { fontFamily: "Helvetica-Bold" },
  carta: { backgroundColor: NOITE, padding: 44, color: "#ece6f7" },
  cartaP: { fontFamily: "Times-Roman", fontSize: 13.5, lineHeight: 1.45, marginBottom: 10 },
  assina: { fontFamily: "Times-Italic", color: OURO, fontSize: 14, marginTop: 14 },
  caixa: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: LINHA, borderRadius: 6, padding: 13, marginBottom: 9 },
  caixaTitulo: { fontFamily: "Times-Bold", fontSize: 14, color: NOITE, marginBottom: 3 },
  tabelas: { flexDirection: "row", gap: 12, marginTop: 6 },
  tabela: { flex: 1, backgroundColor: "#ffffff", borderWidth: 1, borderColor: LINHA, borderRadius: 5 },
  tabelaTitulo: { fontFamily: "Times-Bold", fontSize: 13, color: NOITE, padding: 7, borderBottomWidth: 1, borderBottomColor: LINHA },
  linhaDaTabela: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 7, borderBottomWidth: 1, borderBottomColor: "#f1ebdd", fontSize: 9 },
  legenda: { flexDirection: "row", justifyContent: "center", gap: 14, marginBottom: 6, fontSize: 8, color: SUAVE },
  nota: { fontSize: 8.3, color: SUAVE, borderTopWidth: 1, borderTopColor: LINHA, paddingTop: 7, marginTop: 10 },
});

/** `**negrito**` vira negrito; o resto do texto segue como está. */
function Rico({ texto, estilo }: { texto: string; estilo?: Record<string, string | number> }): React.ReactElement {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return (
    <Text style={estilo ?? s.p}>
      {partes.map((parte, i) => (i % 2 === 1 ? <Text key={i} style={s.negrito}>{parte}</Text> : parte.replace(/\*(.+?)\*/g, "$1")))}
    </Text>
  );
}

const ABREV: Record<Planeta, string> = { Sol: "Sol", Lua: "Lua", "Mercúrio": "Mer", "Vênus": "Vên", Marte: "Mar", "Júpiter": "Júp", Saturno: "Sat" };
const COR_DO_ASPECTO: Record<Aspecto["aspecto"], string> = { "conjunção": "#d9a441", sextil: "#3aa58a", "trígono": "#3aa58a", quadratura: "#cf5a6f", "oposição": "#cf5a6f" };

/** Os dois mapas sobrepostos: ela no círculo de fora, a outra pessoa no de dentro, e as linhas dos aspectos. */
function Roda({ sinastria }: { sinastria: Sinastria }): React.ReactElement {
  const C = 150, R = 142, R2 = 118, RA = 100, RB = 72, RL = 54;
  const p = (lon: number, r: number): [number, number] => {
    const a = Math.PI - (lon * Math.PI) / 180;
    return [C + r * Math.cos(a), C - r * Math.sin(a)];
  };
  const pontos = (mapa: Mapa, r: number, cor: string): React.ReactElement[] => {
    const itens = (Object.entries(mapa) as [Planeta, Mapa[Planeta]][]).map(([nome, v]) => ({ nome, lon: v.longitude })).sort((x, y) => x.lon - y.lon);
    let anterior = -999;
    let degrau = 0;
    return itens.map((it) => {
      degrau = it.lon - anterior < 11 ? degrau + 1 : 0;
      anterior = it.lon;
      const [x, y] = p(it.lon, r - degrau * 11);
      const [tx, ty] = p(it.lon, RL);
      return (
        <G key={`${cor}-${it.nome}`}>
          <Circle cx={tx} cy={ty} r={1.6} fill={cor} />
          <Text x={x - 8} y={y + 3} style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold" }} fill={cor}>{ABREV[it.nome]}</Text>
        </G>
      );
    });
  };
  return (
    <Svg viewBox="0 0 300 300" style={{ width: 196, height: 196, alignSelf: "center", marginVertical: 4 }}>
      <Circle cx={C} cy={C} r={R} stroke="#c9bfa5" strokeWidth={1} fill="none" />
      <Circle cx={C} cy={C} r={R2} stroke="#c9bfa5" strokeWidth={1} fill="none" />
      <Circle cx={C} cy={C} r={RL} stroke="#ddd3bd" strokeWidth={0.6} fill="none" />
      {SIGNOS.map((nome, i) => {
        const [x1, y1] = p(i * 30, R2);
        const [x2, y2] = p(i * 30, R);
        const [gx, gy] = p(i * 30 + 15, (R + R2) / 2);
        return (
          <G key={nome}>
            <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9bfa5" strokeWidth={0.7} />
            <Text x={gx - 7} y={gy + 2.5} style={{ fontSize: 6.5 }} fill="#8a7a52">{nome.slice(0, 3)}</Text>
          </G>
        );
      })}
      {sinastria.aspectos.slice(0, 12).map((a, i) => {
        const [x1, y1] = p(sinastria.a.mapa[a.de].longitude, RL);
        const [x2, y2] = p(sinastria.b.mapa[a.para].longitude, RL);
        return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={COR_DO_ASPECTO[a.aspecto]} strokeWidth={0.9} strokeDasharray={a.firme ? undefined : "3 3"} opacity={a.firme ? 0.9 : 0.55} />;
      })}
      {pontos(sinastria.a.mapa, RA, ROSA)}
      {pontos(sinastria.b.mapa, RB, AZUL)}
    </Svg>
  );
}

function Tabela({ quem }: { quem: Sinastria["a"] }): React.ReactElement {
  return (
    <View style={s.tabela}>
      <Text style={s.tabelaTitulo}>{quem.nome}</Text>
      {(Object.entries(quem.mapa) as [Planeta, Mapa[Planeta]][]).map(([nome, v]) => (
        <View key={nome} style={s.linhaDaTabela}>
          <Text>{nome}</Text>
          <Text style={{ color: SUAVE }}>{v.signoCerto ? `${v.signo} ${Math.floor(v.grau)}°` : `${v.noComecoDoDia} ou ${v.noFimDoDia}*`}</Text>
        </View>
      ))}
    </View>
  );
}

export interface DadosDoRelatorio {
  /** O nome do produto, como aparece na capa. */
  titulo: string;
  /** "Ana & Lucas" ou só "Ana". */
  nomes: string;
  assinatura: string;
  conteudo: ConteudoDoRelatorio;
  /** Presente = página do mapa, com o desenho e as tabelas. */
  sinastria?: Sinastria;
  /** A página final, fixada pelo código (não pelo modelo): o que a leitura é e o que não é. */
  fim: { titulo: string; texto: string }[];
}

const TAMANHO = "A5" as const;

function Relatorio({ d }: { d: DadosDoRelatorio }): React.ReactElement {
  const incerto = d.sinastria ? [...Object.values(d.sinastria.a.mapa), ...Object.values(d.sinastria.b.mapa)].some((v) => !v.signoCerto) : false;
  return (
    <Document title={`${d.titulo} — ${d.nomes}`} author={d.assinatura}>
      <Page size={TAMANHO} style={s.capa}>
        <Text style={s.sobre}>Sua leitura personalizada</Text>
        <Text style={s.tituloDaCapa}>{d.titulo}</Text>
        <Text style={s.nomes}>{d.nomes}</Text>
        <View style={s.fio} />
        <Text style={s.fraseDaCapa}>{d.conteudo.capa}</Text>
        <Text style={s.peDaCapa}>{d.assinatura}</Text>
      </Page>
      {d.sinastria ? (
        <Page size={TAMANHO} style={s.pagina}>
          <Text style={s.num}>O mapa de vocês</Text>
          <Text style={s.h2}>Dois céus, um desenho só</Text>
          <View style={s.fioDoTitulo} />
          <Text style={s.p}>Este é o céu do dia em que cada um nasceu, um por cima do outro. Cada linha no centro é um ponto em que o mapa de um toca o mapa do outro. É dessas linhas que sai tudo o que você vai ler aqui.</Text>
          <Roda sinastria={d.sinastria} />
          <View style={s.legenda}>
            <Text style={{ color: ROSA }}>{d.sinastria.a.nome} (fora)</Text>
            <Text style={{ color: AZUL }}>{d.sinastria.b.nome} (dentro)</Text>
            <Text style={{ color: "#3aa58a" }}>facilidade</Text>
            <Text style={{ color: "#cf5a6f" }}>tensão</Text>
          </View>
          <View style={s.tabelas} wrap={false}>
            <Tabela quem={d.sinastria.a} />
            <Tabela quem={d.sinastria.b} />
          </View>
          <Text style={s.nota}>
            {incerto ? "* Sem a hora de nascimento, esse planeta pode estar em um signo ou no outro: ele mudou de signo naquele dia. " : ""}
            Linhas tracejadas são encontros que dependem da hora para serem confirmados. Ascendente e casas não entram nesta leitura, porque só existem com a hora e a cidade de nascimento.
          </Text>
        </Page>
      ) : null}
      {d.conteudo.capitulos.map((c, i) => (
        <Page key={i} size={TAMANHO} style={s.pagina}>
          <Text style={s.num}>Capítulo {i + 1}</Text>
          <Text style={s.h2}>{c.titulo}</Text>
          <View style={s.fioDoTitulo} />
          {c.abre ? <Text style={s.abre}>{c.abre}</Text> : null}
          {c.blocos.map((b, k) =>
            b.tipo === "descoberta" ? (
              <View key={k} style={s.descoberta} wrap={false}>
                <Text style={s.rotulo}>Uma descoberta da sua leitura</Text>
                {b.titulo ? <Text style={s.h3}>{b.titulo}</Text> : null}
                {b.texto.map((t, j) => <Rico key={j} texto={t} />)}
                {b.aplique ? (
                  <View style={s.aplique}>
                    <Text style={s.apliqueRotulo}>Aplique à sua história</Text>
                    <Rico texto={b.aplique} estilo={{ fontSize: 10 }} />
                  </View>
                ) : null}
              </View>
            ) : (
              <View key={k}>
                {b.titulo ? <Text style={s.h3}>{b.titulo}</Text> : null}
                {b.texto.map((t, j) => <Rico key={j} texto={t} />)}
              </View>
            ),
          )}
        </Page>
      ))}
      {d.conteudo.chaves.length > 0 ? (
        <Page size={TAMANHO} style={s.pagina}>
          <Text style={s.num}>Para pôr em prática</Text>
          <Text style={s.h2}>As chaves desta leitura</Text>
          <View style={s.fioDoTitulo} />
          {d.conteudo.chaves.map((c, i) => (
            <View key={i} style={s.chave} wrap={false}>
              <View style={s.bola}><Text style={s.bolaTexto}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.chaveTitulo}>{c.titulo}</Text>
                <Rico texto={c.texto} />
              </View>
            </View>
          ))}
        </Page>
      ) : null}
      {d.conteudo.dias.length > 0 ? (
        <Page size={TAMANHO} style={s.pagina}>
          <Text style={s.num}>Um passo por dia</Text>
          <Text style={s.h2}>Guia dos próximos dias</Text>
          <View style={s.fioDoTitulo} />
          {d.conteudo.dias.map((dia, i) => (
            <View key={i} style={s.dia} wrap={false}>
              <Text style={s.diaN}>Dia {i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.negrito}>{dia.titulo}</Text>
                <Rico texto={dia.texto} estilo={{ marginTop: 2 }} />
              </View>
            </View>
          ))}
        </Page>
      ) : null}
      <Page size={TAMANHO} style={s.carta}>
        <Text style={{ ...s.num, color: OURO_CLARO }}>Para guardar</Text>
        <Text style={{ ...s.h2, color: "#ffffff" }}>A carta desta leitura</Text>
        <View style={s.fioDoTitulo} />
        {d.conteudo.carta.map((t, i) => <Text key={i} style={s.cartaP}>{t.replace(/\*+/g, "")}</Text>)}
        <Text style={s.assina}>{d.assinatura}</Text>
      </Page>
      <Page size={TAMANHO} style={s.pagina}>
        <Text style={s.num}>Antes de fechar</Text>
        <Text style={{ ...s.h2, fontSize: 19 }}>O que esta leitura é, e o que ela não é</Text>
        <View style={s.fioDoTitulo} />
        {d.fim.map((c, i) => (
          <View key={i} style={s.caixa} wrap={false}>
            <Text style={s.caixaTitulo}>{c.titulo}</Text>
            <Rico texto={c.texto} estilo={{ marginBottom: 0 }} />
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderizarRelatorio(d: DadosDoRelatorio): Promise<Buffer> {
  return renderToBuffer(<Relatorio d={d} />);
}
