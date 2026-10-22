---
impacto: capacidade_nova
secao: adicionado
titulo: Quizzes da página vendidos em euro e dólar para quem está fora do Brasil
---

Os quizzes da área (sinastria, prosperidade e caminhos) ganham preço opcional em euro e dólar
(`precos_internacionais` em `sinastria_quiz`, `quiz_prosperidade` e `quiz_caminhos`). A página propõe a moeda
pelo fuso do aparelho — fuso do Brasil paga em reais com Pix, zona do euro em euro, o resto do mundo em dólar — e
em moeda estrangeira oferece só cartão, cobrado pela Stripe naquela moeda. O valor sai sempre da configuração,
nunca do navegador; sem preço na moeda, a página segue em reais. A receita entra em reais pelo valor que a Stripe
converteu, como já acontecia no atendimento.
