---
impacto: exige_acao
secao: corrigido
titulo: Os cinco nós de paridade do fluxo (PIX, Voice Studio, Pixel, Template WhatsApp e Cobrança) agora fazem o que a tela promete
---

Até aqui cinco caixas novas do editor de fluxos deixavam publicar e passavam direto, sem fazer nada — e o
simulador mostrava a mensagem como se tivesse saído. Agora todas executam de verdade:

- **Enviar PIX** manda a mensagem pela mesma cadeia de envio das demais (janela, opt-out, anti-ban): o texto com valor e favorecido e, numa bolha só, a chave — para a pessoa tocar e copiar.
- **Voice Studio** sintetiza a voz na hora do envio, com a chave de voz da organização, e manda uma nota de voz. Se a voz não puder ser gerada, a pessoa recebe o texto. As vozes são as reais da OpenAI, e a prévia do formulário toca a voz de verdade.
- **Editar Pixel** reporta o evento à Meta pela conexão da aba Conversões, e o resultado aparece lá. Só sai para lead que veio de anúncio de clique para o WhatsApp.
- **Template WhatsApp** envia o modelo aprovado da conexão (oficial ou parceiro), com um campo por variável do modelo e as variáveis do contato. O formulário lista os modelos reais da conta. Modelo inexistente, não aprovado ou com campo vazio falha com a causa, antes de qualquer envio.
- **Cobrança** cria a cobrança PIX no Asaas e manda o link de pagamento e o PIX copia e cola. Nova tela **Configurações › Pagamentos** para conectar a conta (chave cifrada, sandbox ou produção, conferida no Asaas ao salvar). Um replay do envio nunca cobra duas vezes.
- As variáveis `{primeiro_nome}`, `{nome_completo}`, `{telefone}` (e as grafias em inglês) são resolvidas nas mensagens desses nós.
- O motor passou a ler cada versão de fluxo uma vez por rodada, em vez de uma vez por inscrição.

## Requer atenção

Para usar a caixa Cobrança, conecte a conta do Asaas em Configurações › Pagamentos (comece pelo ambiente sandbox): a publicação de um fluxo com Cobrança é recusada enquanto a conexão não existir ou estiver desligada. Para Voice Studio, cadastre a chave de voz (OpenAI ou ElevenLabs) na organização; sem ela a pessoa recebe o texto no lugar do áudio. Para Template WhatsApp, sincronize os modelos da Meta em Conexões. Esta versão adiciona a tabela `payment_gateway_connections` (migration 0905), aplicada pelo update.
