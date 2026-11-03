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
import { chatDaAreaAberto, lerChat } from "@/lib/area-do-cliente/chat";
import { passosDoRitual } from "@/lib/area-do-cliente/ritual";
import { carregarDadosDaArea, diaNoFuso, fotoDaCarta } from "@/lib/area-do-cliente/dados";
import { CARTAS_NA_MESA, NOME_DA_MODALIDADE } from "@/lib/area-do-cliente/leituras";
import { configDosAvisos, convidarParaOAviso } from "@/lib/area-do-cliente/avisos";
import { ceuDoNascimento } from "@/lib/area-do-cliente/ceu";
import { bonusDoPacote, creditosDoPreco, pacoteEmDestaque } from "@/lib/area-do-cliente/creditos";
import { carregarCarteira, configDosCreditos } from "@/lib/area-do-cliente/creditos-servidor";
import { destaqueDeHoje, fraseDoDia, lembrancaDaMesa } from "@/lib/area-do-cliente/hoje";
import { numeroDoDia } from "@/lib/area-do-cliente/numero-do-dia";
import { ehSigno, horoscopoDoDia } from "@/lib/area-do-cliente/horoscopo";
import { gracasRecebidas, velaAberta } from "@/lib/area-do-cliente/intencao-servidor";
import { temAManha } from "@/lib/area-do-cliente/manha";
import { resumoDaLuaDoMes, temLuaDoMes } from "@/lib/area-do-cliente/lua-do-mes";
import { ehFoco, type Foco } from "@/lib/area-do-cliente/perfil";
import { vePassoAPasso } from "@/lib/area-do-cliente/simpatias";
import { carregarGrimorio, carregarMesa, configDasLeituras } from "@/lib/area-do-cliente/leituras-servidor";
import { FOTOS_POR_DIA, configDaMao } from "@/lib/area-do-cliente/mao";
import { fotosHoje, maosDoContato } from "@/lib/area-do-cliente/mao-servidor";
import { SONHOS_POR_DIA, configDoSonho } from "@/lib/area-do-cliente/sonho";
import { configDoPlanoSemanal, lerPlanoSemanal, planoAtivo } from "@/lib/area-do-cliente/plano-semanal";
import { sonhosDoContato, sonhosHoje } from "@/lib/area-do-cliente/sonho-servidor";
import { abaValida } from "@/lib/area-do-cliente/abas";
import { caminhoPublicoDaArea, origemDaArea } from "@/lib/area-do-cliente/vocabulario";
import { COR_PADRAO_DA_AREA } from "@/lib/area-do-cliente/config";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { urlDaMidiaDaArea } from "@/lib/area-do-cliente/midia";
import { nomeDoCookieDaArea, orgDaArea, sessaoDoCookie } from "@/lib/area-do-cliente/sessao";
import { baseDoStorage } from "@/lib/branding/logo";
import { tagDaArea, traduzirNaArea } from "@/lib/i18n/area";
import { idiomaDaArea } from "@/lib/i18n/area-servidor";
import { createAdminClient } from "@/lib/supabase/admin";
import { vapidPronto } from "@/lib/notifications/vapid";
import { vozPropriaConfigurada } from "@/lib/voz/servidor-proprio";
import { duracaoEstimada, meditacaoDaSemana } from "@/lib/area-do-cliente/meditacao";
import { haVozParaMeditar } from "@/lib/area-do-cliente/meditacao-voz";

import { serifDaArea } from "./_fonte";
import { textosDaCarteira, textosDaEntrada, textosDaMesa, textosDoAviso, textosDasEtapas, textosDasOfertas, textosDasSimpatias, textosDoGrimorio, textosDaLuaDoMes, textosDoChat, textosDoNavegador, textosDoRitual, textosDaMao, textosDaManha, textosDaMeditacao, textosDaVela, textosDoSonho, textosDoPlano } from "./_textos";
import { VistaDaArea, VistaDeEntrada } from "./_vista";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ org: string }>; searchParams: Promise<{ link?: string; aba?: string; de?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await orgDaArea(createAdminClient(), slug);
  const idioma = await idiomaDaArea();
  // `absolute`: a área é da empresa, não do produto — o nome do sistema não vai na aba do cliente.
  return {
    title: { absolute: org ? org.config.titulo || org.nome : traduzirNaArea("Área do cliente", idioma) },
    robots: { index: false, follow: false },
    // O app da área: instalar no celular abre aqui, com o nome e o ícone da empresa (`manifest/route.ts`).
    ...(org
      ? {
          manifest: `/c/${org.slug}/manifest`,
          appleWebApp: { capable: true, title: org.config.titulo || org.nome, statusBarStyle: "black-translucent" as const },
          icons: { apple: `/c/${org.slug}/icone?t=192` },
        }
      : {}),
  };
}

/** Já é hora de convidar para o aviso? Dias distintos de visita e se já revelou carta ou leitura. */
async function jaMereceConvite(admin: ReturnType<typeof createAdminClient>, org: { id: string; fuso: string }, contactId: string): Promise<boolean> {
  const { data } = await admin
    .from("area_eventos")
    .select("tipo, created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", contactId)
    .in("tipo", ["visitou", "carta_do_dia", "leitura_revelada"])
    .order("created_at", { ascending: false })
    .limit(200);
  const eventos = (data ?? []) as Array<{ tipo: string; created_at: string }>;
  const dias = new Set(eventos.filter((e) => e.tipo === "visitou").map((e) => diaNoFuso(e.created_at, org.fuso)));
  return convidarParaOAviso({ diasDeVisita: dias.size, jaViuValor: eventos.some((e) => e.tipo !== "visitou") });
}

/** O primeiro quiz ligado, na ordem da vitrine (o Par é a porta de entrada da página de vendas); nenhum = sem link. */
function primeiraDescoberta(org: { slug: string; config: { apelido?: string | null; quiz_par?: { ativo?: boolean }; sinastria_quiz?: { ativo?: boolean }; quiz_prosperidade?: { ativo?: boolean }; quiz_caminhos?: { ativo?: boolean } } }): string | null {
  const base = caminhoPublicoDaArea(org.slug, org.config.apelido);
  if (org.config.quiz_par?.ativo) return `${base}/quiz/par`;
  if (org.config.sinastria_quiz?.ativo) return `${base}/sinastria`;
  if (org.config.quiz_prosperidade?.ativo) return `${base}/quiz/prosperidade`;
  if (org.config.quiz_caminhos?.ativo) return `${base}/quiz/caminhos`;
  return null;
}

function dinheiro(cents: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

function dataCurta(iso: string, fuso: string, tag: string): string {
  return new Intl.DateTimeFormat(tag, { timeZone: fuso, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export default async function AreaDoCliente({ params, searchParams }: Props) {
  const { org: slug } = await params;
  const { link, aba, de } = await searchParams;
  const idioma = await idiomaDaArea();
  const t = (texto: string) => traduzirNaArea(texto, idioma);
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
        comecar={primeiraDescoberta(org)}
      />
    );
  }

  // O chat da área (`_chat.tsx`): a conversa inteira, de todas as origens. É aberto: quem nunca conversou
  // escreve mesmo assim, e a primeira mensagem cria a conversa (`garantirConversaDaArea`).
  const [dados, chat, chatAberto] = await Promise.all([
    carregarDadosDaArea(admin, { id: org.id, fuso: org.fuso }, sessao.contactId),
    lerChat(admin, org.id, sessao.contactId),
    chatDaAreaAberto(admin, org.id, sessao.contactId),
  ]);
  await registrarEvento(admin, {
    organizationId: org.id,
    contactId: sessao.contactId,
    tipo: "visitou",
    sessaoId: sessao.sessaoId,
    // De onde veio: do aviso no celular, do ícone do app, ou do jeito de sempre.
    ref: de === "aviso" ? "aviso" : de === "app" ? "app" : "inicio",
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
  const tag = tagDaArea(idioma);
  const hoje = diaNoFuso(agora.toISOString(), org.fuso);
  const carta = org.config.carta_do_dia ? cartaDoDia(sessao.contactId, hoje) : null;
  const fotoDaCartaDeHoje = carta ? await fotoDaCarta(admin, org.id, carta.id) : null;
  // O ritual de hoje (`lib/area-do-cliente/ritual.ts`): o que ela já fez hoje, no fuso da empresa.
  const { data: cartasVistas } = await admin
    .from("area_eventos")
    .select("created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("tipo", "carta_do_dia")
    .order("created_at", { ascending: false })
    .limit(1);
  const cartaJaRevelada = ((cartasVistas ?? []) as Array<{ created_at: string }>).some((e) => diaNoFuso(e.created_at, org.fuso) === hoje);
  const ritual = {
    cartaJaRevelada,
    passos: passosDoRitual({
      temCarta: carta !== null,
      cartaHoje: cartaJaRevelada,
      diarioHoje: dados.diario.some((d) => diaNoFuso(d.quando, org.fuso) === hoje),
      conversouHoje: chat.some((m) => m.de === "voce" && diaNoFuso(m.quando, org.fuso) === hoje),
    }),
  };

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
  const host = (await headers()).get("host");
  // O link do presente sai da área: vai com o domínio próprio dela quando há (a marca da casa).
  const origem = origemDaArea(org.config.dominio, host ? `https://${host}` : "");
  const presentes = ((presentesData ?? []) as Array<{ id: string; codigo: string; para_nome: string | null; pergunta: string | null }>).map(
    (p) => ({ id: p.id, para: p.para_nome, link: `${origem}${caminhoDoPresente(org.config.apelido || org.slug, p.codigo)}`, usado: p.pergunta !== null }),
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

  // O Plano da Semana (0953): a pergunta da semana na Mesa e um sonho inteiro por semana, para quem está em dia.
  const cfgDoPlano = configDoPlanoSemanal(org.config.plano_semanal);
  const planoDela = cfgDoPlano.ativo ? await lerPlanoSemanal(admin, org.id, sessao.contactId) : null;
  const noPlano = planoDela !== null && planoAtivo(planoDela.validoAte, agora);
  // A vela de 7 dias (0957): a aberta dela e as graças marcadas. Acender pede o plano ou o Círculo.
  const [velaDela, gracasDela] = await Promise.all([
    velaAberta(admin, org.id, sessao.contactId, hoje),
    gracasRecebidas(admin, org.id, sessao.contactId),
  ]);
  const cfgDasLeituras = configDasLeituras(org.config.leituras);
  const mesa = cfgDasLeituras.ativo ? await carregarMesa(admin, { id: org.id, fuso: org.fuso }, sessao.contactId, cfgDasLeituras, noPlano) : null;
  // O Grimório só existe com a Mesa ligada: são as cartas das leituras dela.
  const grimorio = mesa ? await carregarGrimorio(admin, org.id, sessao.contactId) : [];
  // "Sua lua do mês": aparece quando o mês já tem uma leitura ou uma página de diário. A conta exata (todas as
  // leituras do mês) é a da imagem; aqui basta saber se há alguma coisa, com o que a página já carregou.
  const luaDoMes = temLuaDoMes(
    resumoDaLuaDoMes({
      mes: hoje.slice(0, 7),
      leituras: (mesa?.leituras ?? []).filter((l) => l.revelada).map((l) => ({ quando: l.quando, cartas: l.cartas })),
      diario: dados.diario.map((d) => ({ quando: d.quando })),
      diaDe: (iso) => diaNoFuso(iso, org.fuso),
    }),
  );
  const cfgDosCreditos = configDosCreditos(org.config.creditos);
  const cfgDosAvisos = configDosAvisos(org.config.avisos);
  // A entrada com 3 perguntas (migration 0940): a linha existir = feita ou pulada.
  const { data: perfilR } = await admin
    .from("area_perfis")
    .select("foco")
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .maybeSingle();
  const foco = ehFoco((perfilR as { foco: string | null } | null)?.foco) ? ((perfilR as { foco: Foco }).foco) : null;
  // As simpatias (migration 0941): o passo a passo só para quem o vê (`vePassoAPasso`), e os pedidos PAGOS dela.
  const cfgDasSimpatias = org.config.simpatias?.ativo ? org.config.simpatias : null;
  const [simpatiasR, pedidosR] = cfgDasSimpatias
    ? await Promise.all([
        admin
          .from("area_simpatias")
          .select("id, titulo, intencao, materiais, passos, cuidado")
          .eq("organization_id", org.id)
          .eq("publicada", true)
          .order("posicao", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(50),
        admin
          .from("area_simpatias_pedidos")
          .select("id, titulo, feita_at, nota")
          .eq("organization_id", org.id)
          .eq("contact_id", sessao.contactId)
          .not("pago_at", "is", null)
          .order("pago_at", { ascending: false })
          .limit(10),
      ])
    : [{ data: null }, { data: null }];
  const vePassos = cfgDasSimpatias ? vePassoAPasso(cfgDasSimpatias, circulo !== null, noCirculo) : false;
  const cfgDaContribuicao = org.config.contribuicao?.ativo ? org.config.contribuicao : null;
  // A aba Hoje com hierarquia (`lib/area-do-cliente/hoje.ts`): a frase dela, a lembrança da última pergunta e um
  // destaque só.
  const lembranca = mesa ? lembrancaDaMesa(mesa.leituras, hoje, (iso) => diaNoFuso(iso, org.fuso)) : null;
  const aniversarioNestaSemana = dados.contato.nascimento ? semanaDoAniversario(dados.contato.nascimento, hoje) : false;
  const convidarJa = cfgDosAvisos.ativo ? await jaMereceConvite(admin, { id: org.id, fuso: org.fuso }, sessao.contactId) : false;
  const carteira = cfgDosCreditos.ativo ? await carregarCarteira(admin, org.id, sessao.contactId) : null;
  const destaque = pacoteEmDestaque(cfgDosCreditos.pacotes);
  // A leitura da mão (0951): a linha do coração de graça, o resto pago. Segue a Mesa quando não tem bloco próprio.
  const cfgDaMao = configDaMao(org.config.mao, org.config.leituras);
  const [maos, fotosDeHoje] = cfgDaMao.ativo
    ? await Promise.all([maosDoContato(admin, org.id, sessao.contactId), fotosHoje(admin, { id: org.id, fuso: org.fuso }, sessao.contactId)])
    : [[], 0];
  // A interpretação de sonhos (0952): o primeiro símbolo de graça, o resto pago. Ligada pela empresa no painel.
  const cfgDoSonho = configDoSonho(org.config.sonho);
  const [sonhos, sonhosDeHoje] = cfgDoSonho.ativo
    ? await Promise.all([sonhosDoContato(admin, org.id, sessao.contactId), sonhosHoje(admin, { id: org.id, fuso: org.fuso }, sessao.contactId)])
    : [[], 0];

  return (
    <VistaDaArea
      idioma={idioma}
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
      aniversarioNestaSemana={aniversarioNestaSemana}
      hojeTela={{
        frase: t(fraseDoDia(sessao.contactId, hoje, foco)),
        lembranca: lembranca
          ? { pergunta: lembranca.pergunta, quando: lembranca.diasAtras === 1 ? t("Ontem") : `${t("Há")} ${lembranca.diasAtras} ${t("dias")}` }
          : null,
        destaque: destaqueDeHoje({ aniversario: aniversarioNestaSemana, lembranca, mesa: mesa !== null }),
        doDia: (() => {
          // O número e a cor do dia (`numero-do-dia.ts`): dia pessoal com o nascimento, dia universal sem ele.
          const n = numeroDoDia(hoje, dados.contato.nascimento);
          return {
            numero: n.numero,
            rotulo: n.pessoal ? t("Seu número de hoje") : t("Número do dia"),
            cor: `${t("cor")} ${t(n.cor).toLowerCase()}`,
            hex: n.hex,
            sentido: t(n.sentido),
          };
        })(),
      }}
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
                creditos: creditosDoPreco(m.precoCents),
              })),
              restamHoje: mesa.restamHoje,
              gratisDaSemana: mesa.gratisDaSemana,
              saldo: carteira ? carteira.saldo : null,
              narrar: Boolean(org.config.leituras?.narrar) && vozPropriaConfigurada(),
              leituras: mesa.leituras,
            }
          : null
      }
      tm={textosDaMesa(t, titulo)}
      mao={
        cfgDaMao.ativo
          ? {
              preco: dinheiro(cfgDaMao.preco_cents, "BRL"),
              creditos: creditosDoPreco(cfgDaMao.preco_cents),
              saldo: carteira ? carteira.saldo : null,
              restamHoje: Math.max(0, FOTOS_POR_DIA - fotosDeHoje),
              maos,
            }
          : null
      }
      tmao={textosDaMao(t)}
      sonho={
        cfgDoSonho.ativo
          ? {
              preco: dinheiro(cfgDoSonho.preco_cents, "BRL"),
              creditos: creditosDoPreco(cfgDoSonho.preco_cents),
              saldo: carteira ? carteira.saldo : null,
              restamHoje: Math.max(0, SONHOS_POR_DIA - sonhosDeHoje),
              sonhos,
            }
          : null
      }
      tsonho={textosDoSonho(t)}
      planoSemanal={
        cfgDoPlano.ativo && (cfgDasLeituras.ativo || cfgDoSonho.ativo)
          ? {
              nome: t(cfgDoPlano.nome),
              preco_cents: cfgDoPlano.preco_cents,
              precos_internacionais: cfgDoPlano.precos_internacionais,
              ativo: noPlano,
              ate: noPlano && planoDela ? dataCurta(planoDela.validoAte, org.fuso, tag) : null,
              renova: noPlano && planoDela !== null && planoDela.renova,
              temMesa: cfgDasLeituras.ativo,
              temSonho: cfgDoSonho.ativo,
            }
          : null
      }
      tplano={textosDoPlano(t)}
      carteira={
        carteira
          ? {
              saldo: carteira.saldo,
              pacotes: cfgDosCreditos.pacotes.map((p, indice) => ({
                indice,
                creditos: p.creditos,
                preco: dinheiro(p.preco_cents, "BRL"),
                bonus: bonusDoPacote(p),
                destaque: indice === destaque,
              })),
              extrato: carteira.extrato,
            }
          : null
      }
      creditosDoCirculo={carteira && cfgDosCreditos.circulo_mensal > 0 ? cfgDosCreditos.circulo_mensal : null}
      tc={textosDaCarteira(t)}
      avisos={cfgDosAvisos.ativo && vapidPronto() ? { hora: cfgDosAvisos.hora, convidarJa } : null}
      ta={textosDoAviso(t)}
      simpatias={
        cfgDasSimpatias
          ? {
              preco: dinheiro(cfgDasSimpatias.preco_feita_cents, "BRL"),
              simpatias: (
                (simpatiasR.data ?? []) as Array<{
                  id: string;
                  titulo: string;
                  intencao: string;
                  materiais: string | null;
                  passos: string;
                  cuidado: string | null;
                }>
              ).map((s) => ({
                id: s.id,
                titulo: s.titulo,
                intencao: s.intencao,
                materiais: vePassos ? s.materiais : null,
                passos: vePassos ? s.passos : null,
                cuidado: vePassos ? s.cuidado : null,
              })),
              pedidos: ((pedidosR.data ?? []) as Array<{ id: string; titulo: string; feita_at: string | null; nota: string | null }>).map(
                (p) => ({ id: p.id, titulo: p.titulo, feitaEm: p.feita_at ? dataCurta(p.feita_at, org.fuso, tag) : null, nota: p.nota }),
              ),
            }
          : null
      }
      contribuicao={
        cfgDaContribuicao ? { minimoCents: cfgDaContribuicao.minimo_cents, minimo: dinheiro(cfgDaContribuicao.minimo_cents, "BRL") } : null
      }
      ts={textosDasSimpatias(t)}
      grimorio={grimorio.map((c) => ({
        chave: `${c.modalidade}:${c.id}`,
        nome: t(c.nome),
        modalidade: t(NOME_DA_MODALIDADE[c.modalidade]),
        sentido: t(c.sentido),
        vezes: c.vezes,
        ultimaPergunta: c.ultimaPergunta,
        ultimaVez: dataCurta(c.ultimaVez, org.fuso, tag),
        foto: c.foto,
      }))}
      tg={textosDoGrimorio(t)}
      horoscopo={(() => {
        // O horóscopo do signo solar (`horoscopo.ts`): só para quem contou a data de nascimento.
        const sol = ceuDoNascimento(dados.contato.nascimento)?.sol;
        return ehSigno(sol) ? { signo: t(sol), texto: t(horoscopoDoDia(sol, hoje)) } : null;
      })()}
      meditacao={(() => {
        // A meditação da semana (`meditacao.ts`): o roteiro é em português e precisa de voz no servidor.
        if (idioma !== "pt-BR" || !haVozParaMeditar()) return null;
        const c = ceuDoNascimento(dados.contato.nascimento);
        const m = meditacaoDaSemana({
          semente: sessao.contactId,
          dia: hoje,
          nome: dados.contato.primeiroNome,
          ceu: c ? { sol: c.sol, lua: c.luaCerta ? c.lua : null } : null,
          foco,
        });
        return {
          titulo: m.titulo,
          feitaCom: m.feitaCom,
          minutos: duracaoEstimada(m),
          trechos: m.trechos.map((x) => x.texto),
          url: `/api/v1/area/publica/${org.slug}/meditacao`,
        };
      })()}
      tmd={textosDaMeditacao(t)}
      manha={!org.config.carta_do_dia ? null : temAManha({ noPlano, noCirculo }) ? "dela" : cfgDoPlano.ativo ? "convite" : null}
      tmanha={textosDaManha(t)}
      vela={{ aberta: velaDela, gracas: gracasDela, podeAcender: temAManha({ noPlano, noCirculo }) }}
      tvela={textosDaVela(t)}
      luaDoMes={luaDoMes ? { versao: hoje } : null}
      tl={textosDaLuaDoMes(t)}
      perfil={{ feito: perfilR !== null, foco }}
      ceu={(() => {
        // Os signos vão traduzidos (o cálculo devolve o nome em português).
        const c = ceuDoNascimento(dados.contato.nascimento);
        return c ? { ...c, sol: t(c.sol), lua: t(c.lua), luaOutra: c.luaOutra ? t(c.luaOutra) : c.luaOutra } : null;
      })()}
      tp={textosDaEntrada(t)}
      guia={{ foto: urlDaMidiaDaArea(org.config.guia?.foto, baseDoStorage()), nome: org.config.guia?.nome ?? null }}
      abaInicial={abaValida(aba)}
      chat={{
        inicial: chat,
        podeEscrever: chatAberto,
        // As perguntas prontas do chat: a primeira fala da carta que ela tirou hoje.
        sugestoes: [
          carta ? `${t("Me ajuda a entender a minha carta de hoje")}: ${t(carta.nome)}` : t("Me ajuda a entender o meu momento"),
          t("Quero fazer uma pergunta às cartas"),
          t("Como está a minha energia no amor?"),
        ],
      }}
      tch={textosDoChat(t)}
      ritual={ritual}
      tr={textosDoRitual(t)}
    />
  );
}
