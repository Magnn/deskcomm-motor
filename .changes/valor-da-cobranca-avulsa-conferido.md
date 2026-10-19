---
impacto: nada_mudou
secao: corrigido
titulo: A agente não diz mais um valor errado para a pergunta nova e outras cobranças avulsas
---

Toda mensagem da agente que fala de uma cobrança avulsa (pergunta nova, sinastria, acompanhamento…) com
um valor em reais passa a ser conferida antes de sair: o valor tem de ser o cadastrado (ou um múltiplo
exato, para mais de uma). Se não for, a mensagem não sai e a agente reescreve. Em produção, a agente
cobrou "R$ 130 por pergunta" — o preço do trabalho principal — por uma pergunta de R$ 5, e depois
"corrigiu" o Pix certo. O bloco do turno também passou a dizer que o valor é o DESTA cobrança.
