---
impacto: nada_mudou
secao: corrigido
titulo: O serviço próprio de transcrição recebe um áudio de cada vez, em vez de travar nos horários de pico
---

Quem transcreve áudio num serviço próprio (um Whisper na mesma máquina, por exemplo) via o serviço travar nos horários de mais movimento: muitos áudios eram enviados ao mesmo tempo, disputavam o processador, nenhum terminava no prazo e a transcrição caía para o serviço pago de reserva.

Agora os áudios entram em fila e o serviço próprio recebe um de cada vez. Quem esperar mais de 30 segundos pela vez segue pelo caminho de reserva, então nenhum áudio fica sem leitura. Se o seu serviço aguenta mais de um por vez, aumente `TRANSCRIPTION_MAX_CONCURRENCY` no `.env`; sem essa linha, vale 1.
