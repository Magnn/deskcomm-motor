---
impacto: capacidade_nova
secao: adicionado
titulo: Voz clonada no próprio servidor — sua voz gravada, sem custo por uso
---

O Voice Studio agora clona vozes também no próprio servidor ("Onde criar a voz › No servidor"): grave
ou envie 1 a 3 minutos da voz, com o consentimento de quem fala, e ela aparece na "Voz do servidor"
para a agente responder no WhatsApp, sem custo por caractere. Por baixo, um serviço aberto
(`ops/vps/voz-clonada`: OpenVoice V2 sobre o Kokoro) guarda o timbre da gravação; uma resposta típica
de WhatsApp sai em cerca de 10 segundos numa VPS sem placa de vídeo, com marca d'água inaudível que
identifica o áudio como sintético. Configuração da instalação: `VOZ_CLONADA_BASE_URL` e
`VOZ_CLONADA_API_KEY`. Combine com "Se a voz principal falhar" para a ElevenLabs ou a OpenAI
assumirem se o servidor cair.
