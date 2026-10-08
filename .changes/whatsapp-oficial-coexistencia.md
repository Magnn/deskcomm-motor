---
impacto: capacidade_nova
secao: adicionado
titulo: WhatsApp oficial — manter o número também no aplicativo do celular (coexistência)
---

Ao conectar pelo botão **Conectar com Facebook**, marque **Manter o número também no aplicativo WhatsApp Business do celular**. O número passa a atender pela API oficial sem sair do aplicativo: a conexão é feita lendo um código QR com o próprio aplicativo, na janela da Meta.

- **O que você responde pelo celular aparece na conversa**, como mensagem enviada por fora do CRM.
- **O agente pausa naquela conversa** quando alguém responde pelo celular, e volta sozinho depois do prazo — a mesma regra dos outros canais.
- **O número não é registrado de novo**: ele continua pertencendo ao aplicativo.
- **Conversas e contatos antigos do aplicativo não são importados** nesta versão.

Sem marcar a opção, nada muda.

**Para usar:**

No app da Meta, em **Webhooks › WhatsApp Business Account**, cadastre a URL do app `https://SEU-DOMINIO/api/v1/webhooks/meta` (com o token de verificação de Admin › API Oficial) e assine os campos `messages`, `message_template_status_update` e `smb_message_echoes`. A URL aparece em Conexões › API Oficial (Meta), pronta para copiar. É por ela que chegam as mensagens enviadas pelo celular; sem esse passo, o canal em coexistência conecta, envia e recebe do cliente, mas o que for respondido pelo celular não aparece e não pausa o agente.
