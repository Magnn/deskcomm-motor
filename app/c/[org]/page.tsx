/**
 * /c/[org] — A ÁREA DO CLIENTE.
 *
 * Um endereço só para todos os clientes da empresa; o que aparece é de quem
 * está dentro (cookie da área). Sem sessão, a tela de entrar com o e-mail.
 *
 * Esta página BUSCA e CALCULA; quem desenha é `_vista.tsx` (de cima para baixo:
 * o céu de hoje com o "Olá" e a lua, a compra confirmada, a carta do dia, o
 * canal com a empresa, o que é dela, o diário e, só no fim, as ofertas). Tudo
 * derivado do que o Desk já tem — ver `lib/area-do-cliente/dados.ts`.
 */
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { janelaDoAnoPessoal, numeroDoAnoPessoal } from "@/lib/area-do-cliente/ano-pessoal";
import { semanaDoAniversario } from "@/lib/area-do-cliente/aniversario";
import { caminhoDoPresente } from "@/lib/area-do-cliente/presente";
import { MENSAGEM_DO_DIA, cartaDoDia } from "@/lib/area-do-cliente/carta-do-dia";
import { DIAS_DO_AVISO_DE_RENOVACAO, assinaturaAtiva, diasRestantes, lerAssinatura, mesDoDia } from "@/lib/area-do-cliente/circulo";
import { carregarDadosDaArea, diaNoFuso, fotoDaCarta } from "@/lib/area-do-cliente/dados";
import { CARTAS_NA_MESA } from "@/lib/area-do-cliente/leituras";
import { carregarMesa, configDasLeituras } from "@/lib/area-do-cliente/leituras-servidor";
import { abaValida } from "@/lib/area-do-cliente/abas";
import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { nomeDoCookieDaArea, orgDaArea, sessaoDoCookie } from "@/lib/area-do-cliente/sessao";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { traduzir } from "@/lib/i18n/dicionario";
import { idiomaDoVisitante } from "@/lib/i18n/idiomaAnonimo";
import { createAdminClient } from "@/lib/supabase/admin";

import { serifDaArea } from "./_fonte";
import { textosDaMesa, textosDasEtapas, textosDasOfertas, textosDoNavegador } from "./_textos";
import { VistaDaArea, VistaDeEntrada } from "./_vista";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string }>; searchParams: Promise<{ link?: string; aba?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  const idioma = await idiomaDoVisitante(null);
  // `absolute`: a área é da empresa, não do produto — o nome do sistema não vai na aba do cliente.
  return {
    title: { absolute: org ? org.config.titulo || org.nome : traduzir("Área do cliente", idioma) },
    robots: { index: false, follow: false },
  };
}

function dinheiro(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function dataCurta(iso: string, fuso: string, tag: string): string {
  return new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export default async function AreaDoCliente({ params, searchParams }: Props) {
  const { org: slug } = await params;
  const { link, aba } = await searchParams;
  const idioma = await idiomaDoVisitante(null);
  const t = (texto: string) => traduzir(texto, idioma);
  const tx = textosDoNavegador(t);
  const admin = createAdminClient();
  const org = await orgDaArea(admin, slug);
  if (!org) notFound();

  const cor = org.config.cor || COR_PADRAO_DA_AREA;
  const titulo = org.config.titulo || org.nome;
  const jar = await cookies();
  const sessao = await sessaoDoCookie(admin, org, jar.get(nomeDoCookieDaArea(org.slug))?.value);

  if (!sessao) {
    return (
      <VistaDeEntrada
        classeDaFonte={serifDaArea.variable}
        slug={org.slug}
        cor={cor}
        titulo={titulo}
        t={t}
        tx={tx}
        link={link}
        whatsapp={org.config.whatsapp}
      />
    );
  }

  const dados = await carregarDadosDaArea(admin, { id: org.id, fuso: org.fuso }, sessao.contactId);
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "visitou",
    sessaoId: sessao.sessaoId,
    ref: "inicio",
  });
  // Abrir a área é ler as respostas da equipe que estão no "Fale com a gente".
  await admin
    .from("area_mensagens")
    .update({ lida_pelo_cliente_at: new Date().toISOString() })
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("autor", "equipe")
    .is("lida_pelo_cliente_at", null);

  const agora = new Date();
  const tag = tagDeIdioma(idioma);
  const hoje = diaNoFuso(agora.toISOString(), org.fuso);
  const carta = org.config.carta_do_dia ? cartaDoDia(sessao.contactId, hoje) : null;
  const fotoDaCartaDeHoje = carta ? await fotoDaCarta(admin, org.id, carta.id) : null;

  const circulo = org.config.circulo?.ativo ? org.config.circulo : null;
  const validoAte = circulo ? await lerAssinatura(admin, org.id, sessao.contactId) : null;
  const noCirculo = circulo ? assinaturaAtiva(validoAte, agora) : false;
  const mesAtual = mesDoDia(hoje);
  const [conteudoR, perguntaR] = noCirculo
    ? await Promise.all([
        admin.from("area_conteudos").select("titulo, texto").eq("organization_id", org.id).eq("mes", mesAtual).maybeSingle(),
        admin
          .from("area_perguntas")
          .select("pergunta, resposta")
          .eq("organization_id", org.id)
          .eq("contact_id", sessao.contactId)
          .eq("mes", mesAtual)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const ofertaPresente = org.config.presente?.ativo ? org.config.presente : null;
  const { data: presentesData } = ofertaPresente
    ? await admin
        .from("area_presentes")
        .select("id, codigo, para_nome, pergunta")
        .eq("organization_id", org.id)
        .eq("de_contact_id", sessao.contactId)
        .not("pago_at", "is", null)
        .order("created_at", { ascending: false })
        .limit(10)
    : { data: null };
  const origem = (await headers()).get("host") ? `https://${(await headers()).get("host")}` : "";
  const presentes = ((presentesData ?? []) as Array<{ id: string; codigo: string; para_nome: string | null; pergunta: string | null }>).map(
    (p) => ({ id: p.id, para: p.para_nome, link: `${origem}${caminhoDoPresente(org.slug, p.codigo)}`, usado: p.pergunta !== null }),
  );

  const ofertaAno = org.config.ano_pessoal?.ativo && dados.contato.nascimento ? org.config.ano_pessoal : null;
  const janelaAno = ofertaAno && dados.contato.nascimento ? janelaDoAnoPessoal(dados.contato.nascimento, hoje) : null;
  const { data: anoData } = janelaAno?.aberta
    ? await admin
        .from("area_ano_pessoal")
        .select("texto")
        .eq("organization_id", org.id)
        .eq("contact_id", sessao.contactId)
        .eq("ano", janelaAno.ano)
        .maybeSingle()
    : { data: null };

  const cfgDasLeituras = configDasLeituras(org.config.leituras);
  const mesa = cfgDasLeituras.ativo ? await carregarMesa(admin, { id: org.id, fuso: org.fuso }, sessao.contactId, cfgDasLeituras) : null;

  return (
    <VistaDaArea
      classeDaFonte={serifDaArea.variable}
      slug={org.slug}
      fuso={org.fuso}
      tag={tag}
      cor={cor}
      titulo={titulo}
      boasVindas={org.config.boas_vindas}
      whatsapp={org.config.whatsapp}
      // A razão social só aparece com o CNPJ ao lado: sozinha ela não prova nada
      // e costuma não ser o nome que o cliente conhece.
      assinatura={org.cnpj ? `${org.razaoSocial || titulo} · CNPJ ${org.cnpj}` : titulo}
      agora={agora}
      t={t}
      tx={tx}
      to={textosDasOfertas(t)}
      te={textosDasEtapas(t)}
      dados={dados}
      aniversarioNestaSemana={dados.contato.nascimento ? semanaDoAniversario(dados.contato.nascimento, hoje) : false}
      carta={
        carta
          ? { id: carta.id, nome: t(carta.nome), mensagem: t(MENSAGEM_DO_DIA[carta.id] ?? ""), foto: fotoDaCartaDeHoje }
          : null
      }
      anoPessoal={
        ofertaAno && janelaAno?.aberta && dados.contato.nascimento
          ? {
              ano: janelaAno.ano,
              numero: numeroDoAnoPessoal(dados.contato.nascimento, janelaAno.ano),
              preco: dinheiro(ofertaAno.preco_cents, "BRL"),
              pago: anoData !== null,
              texto: (anoData as { texto: string | null } | null)?.texto ?? null,
            }
          : null
      }
      circulo={
        circulo
          ? {
              nome: circulo.nome,
              preco: dinheiro(circulo.preco_cents, "BRL"),
              ativo: noCirculo,
              ate: noCirculo && validoAte ? dataCurta(validoAte, org.fuso, tag) : null,
              renovarJa: noCirculo && validoAte ? diasRestantes(validoAte, agora) <= DIAS_DO_AVISO_DE_RENOVACAO : false,
              conteudo: (conteudoR.data as { titulo: string; texto: string } | null) ?? null,
              pergunta: (perguntaR.data as { pergunta: string; resposta: string | null } | null) ?? null,
            }
          : null
      }
      presente={ofertaPresente ? { preco: dinheiro(ofertaPresente.preco_cents, "BRL"), presentes } : null}
      mesa={
        mesa
          ? {
              modalidades: mesa.modalidades.map((m) => ({
                id: m.id,
                nome: t(m.nome),
                preco: dinheiro(m.precoCents, "BRL"),
                primeira: m.primeira,
                cartasNaMesa: CARTAS_NA_MESA[m.id],
              })),
              restamHoje: mesa.restamHoje,
              leituras: mesa.leituras,
            }
          : null
      }
      tm={textosDaMesa(t, titulo)}
      abaInicial={abaValida(aba)}
    />
  );
}
