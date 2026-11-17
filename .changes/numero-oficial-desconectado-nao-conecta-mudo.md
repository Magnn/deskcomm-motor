---
impacto: nada_mudou
secao: corrigido
titulo: Número oficial desconectado na Meta não é mais gravado como conectado
---

Ao conectar um número da API oficial que já existe na Cloud API mas está desconectado
("Offline" no Gerenciador do WhatsApp), o CRM agora tenta registrá-lo de novo. Se a Meta
pedir nova verificação por SMS, a conexão é recusada com a instrução do que fazer — antes,
o número entrava como conectado e ficava mudo, inclusive no rodízio da captura.
