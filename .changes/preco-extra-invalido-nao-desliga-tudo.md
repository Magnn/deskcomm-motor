---
impacto: nada_mudou
secao: corrigido
titulo: Uma cobrança à parte com texto acima do limite não desliga mais o preço inteiro do agente
---

Um extra da aba Preço com o texto de "quando cobrar" ou de entrega acima do limite reprovava a
configuração inteira: o agente ficava sem preço, sem Pix na conversa, sem escada de negociação e sem
entrada + restante, e a aba Preço aparecia em branco. Agora só esse extra é ignorado (com aviso no log
do worker) e o resto continua valendo.
