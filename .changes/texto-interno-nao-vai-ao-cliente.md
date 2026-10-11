---
impacto: nada_mudou
secao: corrigido
titulo: O agente não manda mais ao cliente a explicação de por que decidiu não responder, nem a quebra de linha escrita por extenso
---

Dois defeitos faziam texto que era só do sistema chegar ao aparelho de quem conversa
com o agente.

O primeiro: quando o agente decidia não escrever para alguém — porque a pessoa já tinha
se despedido, por exemplo —, ele às vezes registrava essa decisão em texto, e o texto
era enviado. A pessoa recebia frases como "Nenhuma mensagem enviada: a conversa já
estava encerrada". Agora esse registro é reconhecido em mais formas e não sai. Além
disso, nas retomadas de silêncio e nos retornos agendados, em que ninguém escreveu e
ninguém espera resposta, o agente só fala quando decide falar: o registro dele nunca é
tratado como mensagem.

O segundo: em parte das respostas, a quebra de parágrafo chegava escrita na tela como
os caracteres `\n\n`, e o corte entre balões caía no meio da frase. Agora ela vira
quebra de verdade antes do envio.

Mensagens que já foram entregues não mudam.
