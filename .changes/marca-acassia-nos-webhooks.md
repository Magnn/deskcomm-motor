---
impacto: capacidade_nova
secao: alterado
titulo: Webhooks com cabeçalhos X-Acassia-* e marca antiga fora do que é visível
---

Os webhooks de saída passam a enviar `X-Acassia-Event` e `X-Acassia-Signature`. Os nomes antigos (`X-Deskcomm-*`) continuam indo junto, com o mesmo valor, para não quebrar quem já confere por eles. O webhook de entrada aceita a assinatura em `X-Acassia-Signature` ou no nome antigo.

Também saem o nome antigo do widget de chat colado nos sites, da página de vitrine visual (/design), do User-Agent enviado à Nuvemshop (que levava o e-mail do autor original) e do cliente enviado ao Supabase. O alarme de orçamento de IA, que não tinha chamador, foi apagado.
