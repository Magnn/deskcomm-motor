---
impacto: capacidade_nova
secao: adicionado
titulo: O agente emite o boleto na conversa para quem paga na lotérica
---

Quando a pessoa diz que paga na lotérica, por boleto, ou que não tem Pix nem cartão, o agente pede nome completo, CPF e CEP e entrega o boleto já emitido: o link da página do boleto e a linha digitável. O endereço exigido pelo banco vem do CEP. O pagamento confirma sozinho depois da compensação, em até um dia útil, e então a venda é marcada e a entrega começa. Precisa da Stripe conectada com boleto ativo.

O CPF informado não volta em nenhuma mensagem enviada e não é escrito nos registros do sistema; ele fica no histórico da conversa, na mensagem que a própria pessoa mandou.

A chave Pix da empresa passa a ser o último recurso: o agente só pode usá-la depois de outra forma de pagamento já ter sido enviada na conversa.
