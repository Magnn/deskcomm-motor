---
impacto: capacidade_nova
secao: adicionado
titulo: Funil e painel ao vivo dos quizzes da página, medidos no nosso banco
---

Nova aba **Quizzes** em Área do cliente. Cada passo de quem faz um quiz da página (abriu, dados, perguntas,
e-mail, prévia, clicou em pagar, recebeu a cobrança, pagou, viu a leitura) passa a ser gravado no banco
(`area_quiz_passos`, migration 0944), sem depender do pixel da Meta. A aba mostra:

- **ao vivo**: quantas pessoas estão com um quiz aberto agora (sinal a cada 20 s com a aba visível), em que etapa,
  região aproximada pelo fuso do aparelho, celular ou computador, campanha (`utm_campaign`) e há quanto tempo;
  nome e e-mail aparecem a partir do pedido de pagamento;
- **quem parou no pagamento**: pediram o Pix ou abriram o cartão e não pagaram, com nome e e-mail;
- de onde vêm as visitas, a que horas abrem e o tempo mediano até a prévia;
- o funil de cada quiz, com a maior perda destacada, e o resultado por campanha.

A visita é anônima (um id aleatório guardado no navegador) até o pedido de pagamento; o que a pessoa digitou e
não enviou não é guardado. Requer a migration 0944.
