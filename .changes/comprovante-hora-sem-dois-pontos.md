---
impacto: nada_mudou
secao: corrigido
titulo: Comprovante Pix com a hora impressa sem dois-pontos (como o do PicPay) volta a ser conferido sozinho
---

Alguns bancos imprimem a hora do Pix sem separador ("24/nov/2026 - 204459"). A conferência automática
não reconhecia esse formato e mandava o comprovante para a equipe, e a venda ficava fora do faturamento.
Agora a hora é lida nos dois formatos e continua sendo conferida contra o ID da transação.
