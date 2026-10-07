---
impacto: capacidade_nova
secao: adicionado
titulo: Quando a chave de IA do agente fica sem saldo ou é recusada, outra chave cadastrada assume
---

O agente dependia de uma chave só. Se a conta daquele provedor ficava sem saldo, batia no limite ou a chave era recusada, a IA parava de responder — mesmo com outras chaves ativas cadastradas na mesma empresa.

Agora, nesses três casos, a chamada é refeita na hora com outra chave ativa e validada da empresa:

- primeiro as outras chaves do **mesmo provedor**, com o mesmo modelo — o cliente não percebe diferença. Cadastrar uma segunda chave do mesmo provedor passa a servir de reserva;
- depois as chaves de **outro provedor**, com o modelo padrão do catálogo que aquela chave alcança. O tom das respostas pode mudar um pouco.

Cada troca abre um aviso na Central dizendo qual chave falhou e qual assumiu, e as duas tentativas aparecem em Execuções.

A reserva não entra quando o provedor está fora do ar (a causa não é a chave), quando o ponto usa um endereço próprio, nem no meio de uma resposta que já enviou mensagem. Chaves de voz não contam como reserva.
