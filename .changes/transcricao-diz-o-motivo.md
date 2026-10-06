---
impacto: nada_mudou
secao: corrigido
titulo: O aviso de áudio não lido agora diz se a conta de transcrição está sem saldo, no limite ou com a chave recusada
---

Quando a transcrição de um áudio de cliente falhava, o aviso da Central trazia só
o número do erro, e o 429 serve tanto para pico de chamadas quanto para conta sem
saldo. O aviso passa a dizer qual dos casos é e o que fazer, usando o código que
o próprio provedor devolve. A frase livre do provedor continua de fora, porque
ela pode repetir parte da chave.
