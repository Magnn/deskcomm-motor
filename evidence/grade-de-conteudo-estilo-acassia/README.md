# A grade "Adicionar Conteúdo" no estilo do card grande (referência da AcassIA)

O dono do produto mandou um print do editor da AcassIA mostrando o padrão de card que
queria para a grade de tipos do nó "Ação" → modo "Conteúdo": card com ícone num círculo
colorido e o rótulo embaixo, borda tracejada — não o botão compacto que
`evidence/_visual-proof-redesign/01b-grade-de-tipos.png` documentava antes.

**Tipo:** reproduzível — basta reabrir o nó "Ação" em qualquer fluxo e trocar para o modo
"Conteúdo".

**Ambiente:** `next dev` local, fluxo de teste criado na hora ("Prova visual grade de
conteúdo"), login pela tela como admin.

| Arquivo | O que mostra |
|---|---|
| `01-painel-completo.png` | A tela inteira — barra de publicação, paleta à esquerda, canvas com o nó "Enviar mensagem" e o painel de configuração "Ação" aberto à direita, já no modo "Conteúdo". |
| `02-grade-recortada.png` | Recorte só do painel de configuração: os 7 cards da grade (Texto, Imagem, Vídeo, Áudio, Pausa, Contato, Documento), cada um com ícone em círculo pastel colorido e borda tracejada. |

De brinde, `01-painel-completo.png` é a primeira captura desta entrega em que o painel
"Ação" abre de verdade — o PR anterior (visual novo do construtor) não tinha conseguido
confirmar essa tela ao vivo por instabilidade do navegador automatizado na sessão daquele
dia. Confirma o que já era esperado: o painel usa os mesmos componentes `shadcn` do resto
da tela e sai com o mesmo acabamento.

## O que não mudou

Não existe tipo "Sticker" no motor de fluxo hoje (`ConteudoItemType` tem só text, image,
video, audio, document, contact, delay) — a referência da AcassIA tinha um oitavo card de
sticker, mas isto seria uma capacidade nova do canal (enviar figurinha), não um ajuste de
visual, e ficou fora deste PR.
