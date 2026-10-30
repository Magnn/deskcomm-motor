---
impacto: capacidade_nova
secao: adicionado
titulo: Vozes da Microsoft na Voz do servidor — Francisca e Thalita, sem custo por uso
---

A "Voz do servidor" ganhou Francisca e Thalita, vozes neurais em português do Brasil, mais naturais e
muito mais rápidas que as do Kokoro. Por baixo, um serviço aberto (`ops/vps/voz-microsoft`, pacote
`edge-tts`) usa a leitura em voz alta do navegador Edge. Não é um serviço contratado e pode falhar ou
mudar sem aviso: ele repete sozinho até 4 vezes, e a agente deve ter uma reserva em "Se a voz principal
falhar". Configuração da instalação: `VOZ_MICROSOFT_BASE_URL` e `VOZ_MICROSOFT_API_KEY`.
