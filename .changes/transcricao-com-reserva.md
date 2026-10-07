---
impacto: nada_mudou
secao: corrigido
titulo: Áudio do cliente volta a ser transcrito quando o serviço principal fica sem saldo
---

Quando a conta do serviço de transcrição ficava sem saldo, sem cota ou com a chave recusada, os áudios dos clientes não eram transcritos e o agente respondia sem ter ouvido. Agora, nesses casos, a transcrição é feita pela chave do provedor de voz da organização (ElevenLabs), se ela estiver cadastrada em IA › Credenciais. Sem essa chave, tudo segue como antes: o aviso na Central diz o que regularizar.
