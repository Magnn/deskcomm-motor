---
impacto: exige_acao
secao: corrigido
titulo: Os nós PIX, Voice Studio e Pixel do fluxo agora fazem o que a tela promete — Cobrança e Template Meta ficam fora até existirem de verdade
---

Até aqui cinco caixas novas do editor de fluxos (Enviar PIX, Voice Studio, Editar Pixel, Cobrança por
gateway e Template WhatsApp) deixavam publicar e **passavam direto, sem fazer nada** — e o simulador
mostrava a mensagem como se tivesse saído. Agora:

- **Enviar PIX** manda a mensagem de verdade, pela mesma cadeia de envio das demais (janela, opt-out,
  anti-ban): o texto com valor e favorecido e, numa bolha só, a chave — para a pessoa tocar e copiar.
- **Voice Studio** sintetiza a voz na hora do envio, com a chave de voz da organização, e manda uma
  nota de voz. Se a voz não puder ser gerada, a pessoa recebe o texto. As vozes são as reais da
  OpenAI (a prévia do formulário agora toca a voz de verdade); fluxos com as seis vozes antigas
  continuam falando, numa voz real do mesmo gênero.
- **Editar Pixel** reporta o evento à Meta pela conexão da aba Conversões, e o resultado aparece lá.
  Só sai para lead que veio de anúncio de clique para o WhatsApp.
- As variáveis `{primeiro_nome}`, `{nome_completo}`, `{telefone}` (e as grafias em inglês) são
  resolvidas nas mensagens desses nós.
- Cobrança por gateway e Template WhatsApp saíram da paleta e a publicação os recusa, com o motivo: ainda não há motor para eles. O fluxo já publicado continua passando por elas sem efeito, como antes.
- O motor passou a ler cada versão de fluxo uma vez por rodada, em vez de uma vez por inscrição.

## Requer atenção

Fluxo que tenha as caixas Cobrança por gateway ou Template WhatsApp não publica mais uma nova versão: abra o fluxo, troque essas caixas (por Enviar PIX ou Enviar mensagem) e publique de novo. Quem usa Voice Studio precisa ter a chave de voz (OpenAI ou ElevenLabs) cadastrada na organização; sem ela a pessoa recebe o texto em vez do áudio.
