---
impacto: capacidade_nova
secao: adicionado
titulo: Voz do servidor — a agente responde em áudio sem custo por uso
---

A aba Voz do agente e o Voice Studio ganharam um terceiro serviço, "Voz do servidor": a nota de voz
do WhatsApp sai de um modelo aberto (Kokoro, vozes do português do Brasil) rodando na própria
instalação, sem pagar por caractere a um provedor. Não há chave para cadastrar: quem administra a
instalação configura `VOZ_PROPRIA_BASE_URL` (o mesmo serviço da leitura narrada da área do cliente),
e o operador só escolhe "Voz do servidor" e a voz. A nota é convertida para o formato do WhatsApp pelo
ffmpeg do worker; se a voz falhar, a resposta segue em texto como sempre.
