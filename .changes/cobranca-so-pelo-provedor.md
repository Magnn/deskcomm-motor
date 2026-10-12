---
impacto: capacidade_nova
secao: adicionado
titulo: Cobrança só pelo provedor conectado, sem link de checkout externo
---

Nova opção da configuração de preço do agente (`pricing.provider_only_checkout`). Com ela ligada e o provedor de pagamento conectado, o link de checkout externo deixa de chegar à pessoa: no lugar dele saem o Pix copia e cola e um link de cartão criados no provedor, no valor combinado. Se o provedor falhar nos dois, entra a chave Pix da empresa com o valor embutido; sem chave cadastrada, a mensagem não sai e o agente avisa que manda o código em instantes. Por enquanto a opção é ligada pela configuração, sem controle na tela; salvar a aba Preço preserva o que estiver gravado.
