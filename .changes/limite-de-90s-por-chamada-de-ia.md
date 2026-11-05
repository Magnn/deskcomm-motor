---
impacto: nada_mudou
secao: corrigido
titulo: Provedor de IA pendurado não deixa mais o atendimento mudo por 10 minutos
---

Cada ida ao provedor de IA tem agora um limite de 90 segundos. Antes, uma chamada que não
voltava segurava o atendimento até a fila desistir do job (10 minutos), entregá-lo de novo e
descartar a resposta original. Agora, estourado o limite, a chave reserva cadastrada (inclusive
de outro provedor) assume a chamada; sem reserva, o job falha na hora e a fila tenta de novo.
