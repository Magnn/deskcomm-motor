---
impacto: capacidade_nova
secao: adicionado
titulo: A tela da fonte de webhook agora mostra se há segredo e permite gravar ou trocar
---

O painel de uma fonte, em Webhooks › Receber dados, ganhou o bloco
**Segredo da fonte**: mostra se já existe um segredo guardado e traz um campo
para gravar ou trocar (mínimo de 16 caracteres). Antes a troca só era possível
pela API, e quem ligava uma plataforma de pagamento, que exige o mesmo segredo
dos dois lados, não tinha onde colá-lo: os avisos chegavam e eram recusados. O
valor continua cifrado e nunca é exibido de volta.
