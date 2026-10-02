---
impacto: capacidade_nova
secao: adicionado
titulo: Instagram — quem comenta numa publicação recebe uma mensagem no direct
---

Conecte a conta profissional do Instagram e monte regras: quando alguém comenta numa publicação, o sistema manda uma mensagem no direct na hora e, se você quiser, posta uma resposta embaixo do comentário. Fica em **Canais › Instagram**.

- **Conexão direta com a Meta**, pelo login do Instagram — sem página do Facebook no meio e sem serviço de terceiro.
- **Regras por publicação e por palavra**: todas as publicações ou só as que você escolher; qualquer comentário, comentário que contém uma palavra, ou comentário exato. Maiúsculas, acentos e pontuação não fazem diferença.
- **Mensagem do direct** com `{{usuario}}` para citar quem comentou, e **respostas públicas variadas** (uma por linha, escolhida ao acaso).
- **Cada comentário é atendido uma única vez**, mesmo que a Meta reenvie o aviso. A resposta pública só é postada quando o direct saiu — nunca "te mandei no direct" embaixo de um envio que falhou.
- **Registro** dos últimos comentários atendidos, com o que foi enviado e o motivo quando algo falha.
- O acesso da conta é renovado sozinho antes de vencer; se a Meta recusar, a tela pede para reconectar.

A Meta permite uma mensagem privada por comentário, em até 7 dias; a conversa só continua se a pessoa responder.

**Para usar:**

Para usar, aplique a migration 0910 e cadastre o aplicativo do Instagram: no app da Meta, adicione o produto "Instagram" (API com login do Instagram), cadastre o endereço de volta `https://SEU-DOMINIO/api/v1/instagram/oauth/callback` e o webhook `https://SEU-DOMINIO/api/v1/webhooks/instagram` assinando o campo `comments`. No `.env`, defina `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (os do produto Instagram, não os do app da Meta) e `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. Sem os três o recurso não aparece. Enquanto o app não passar pela análise da Meta, só contas com função no app (administrador, desenvolvedor ou testador) conseguem conectar. Quem usa agendador próprio precisa da linha nova de `api/v1/cron/instagram-tokens`.
