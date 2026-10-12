---
impacto: capacidade_nova
secao: adicionado
titulo: Lembrete de silêncio pode oferecer um valor menor a quem ouviu o preço e sumiu
---

A recuperação de silêncio do agente ganhou um valor por passo (`recovery.step_offers_cents`, na mesma ordem dos passos). Quando a pessoa já ouviu o preço, não comprou e ficou sem responder, o passo configurado oferece aquele valor numa mensagem curta e pergunta se ela quer o Pix; se ela disser que sim, a conversa cobra exatamente esse valor. O valor tem de ser um dos degraus da escada de preço do agente. Quem ainda não ouviu o preço, ou já comprou, recebe o lembrete de sempre. Por enquanto o valor por passo é ligado na configuração, sem campo na tela; a tela de recuperação preserva o que estiver gravado.
