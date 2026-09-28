# O visual novo do construtor de fluxos (Fluxos)

Prova em tela do PR "feat(fluxos): visual novo do construtor — categorias, cor por tipo de
nó, cards maiores". Mudança só de aparência — nenhum comportamento do fluxo muda.

**Tipo:** reproduzível — basta abrir `/app/ai/followups/[id]` de novo; nenhum destes
estados depende de dado que não existe mais.

**Ambiente:** `next dev` (Turbopack) local, organização e fluxo de teste ("Prova visual
…"), login pela tela como admin.

| Arquivo | O que mostra |
|---|---|
| `00-paleta.png` | A paleta "Adicionar nó" agrupada por categoria (Início & fim, Mensagens, Inteligência artificial, Lógica & roteamento, Ações & integrações), cada item com ícone colorido, nome e a linha do que faz — antes era uma lista achatada sem grupo nem descrição. |
| `01-editor-de-conteudo.png` | O editor do nó "Ação" no modo "Conteúdo" (sequência de itens): a grade de botões de adicionar no topo, um item de texto e um de espera já montados, cada um com a faixa lateral colorida do próprio tipo. |
| `01b-grade-de-tipos.png` | Recorte da grade de tipos que motivou o rótulo curto "Áudio" — o rótulo completo "Áudio (nota de voz)" quebrava em três linhas e vazava por cima do botão vizinho num grid de 4 colunas. |
| `02-canvas-claro.png` | O canvas no tema claro, com os quatro cards (Gatilho, Aguardar, Ação, Condição) no tamanho e cor novos — selo de categoria abaixo do rótulo, bolinhas de conexão coloridas por tipo. |
| `03-canvas-escuro.png` | O mesmo canvas no tema escuro, para conferir que as cores dos 16 matizes (`nodeVisuals.ts`) têm contraste nos dois temas. |
| `04-paleta-mobile.png` | A paleta dentro do `Sheet` que abre em telas estreitas (abaixo do breakpoint `lg`) — confirma que o agrupamento por categoria também funciona no layout mobile. |

## O que estas telas NÃO provam

Não é uma jornada Playwright com previsão registrada por caso — é captura manual de cada
estado, pelo `run` desta sessão. Em especial, o painel de configuração à direita (que abre
ao clicar num nó, com os campos "Rótulo", "Como escrever a mensagem" etc.) não tem captura
própria aqui: o clique no nó ficou instável no navegador headless usado para tentar essa
prova (carregamento do grafo intermitente num fluxo de teste). Esse painel usa os mesmos
componentes (`shadcn` `Label`/`Select`/`Textarea`/`Button`) já vistos renderizando bem na
barra de publicação acima do canvas nestas mesmas capturas, mas isso é inferência, não uma
tela própria dele.
