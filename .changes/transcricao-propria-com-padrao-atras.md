---
impacto: capacidade_nova
secao: alterado
titulo: Transcrição de áudio rodando no seu servidor passa a ter as chaves da empresa como reserva
---

Quem configura a transcrição para um serviço próprio (`TRANSCRIPTION_BASE_URL`, por exemplo um Whisper rodando na mesma máquina) ficava sem nenhuma reserva: se esse serviço saísse do ar, os áudios dos clientes deixavam de ser lidos, mesmo com chaves de transcrição cadastradas na empresa.

Agora o serviço próprio continua sendo o primeiro, e qualquer falha dele (fora do ar, demora acima de 75 segundos, erro) faz o áudio seguir pelo caminho de sempre: a chave da empresa e as reservas dela. A falha fica registrada no log do servidor.

Para quem não usa serviço próprio, nada muda.
