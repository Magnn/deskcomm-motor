---
impacto: capacidade_nova
secao: adicionado
titulo: WhatsApp oficial — conectar com Facebook, sem copiar ID nem token
---

Em **Conexões › API Oficial (Meta)**, o botão **Conectar com Facebook** abre a janela da própria Meta: você escolhe (ou cria) a conta do WhatsApp Business e o número, e o canal fica pronto para enviar e receber. Nada para copiar do painel da Meta.

- **O webhook é registrado sozinho**, como já acontecia ao colar a credencial.
- **Número criado na janela já sai ativo para envio**: o CRM o registra na Cloud API na mesma conexão.
- **Acesso que vence é recusado na hora**, com a frase que diz o que trocar — em vez de o canal parar sozinho dois meses depois.
- **O formulário continua lá**, recolhido, para quem prefere colar o ID do número, o ID da conta e o token.

Sem a configuração abaixo nada muda: a tela segue com o formulário.

**Para usar:**

No `.env`, defina `META_APP_ID` (se ainda não estiver) e `META_WHATSAPP_CONFIG_ID`. No app da Meta, adicione os produtos **WhatsApp** e **Login do Facebook para Empresas**; crie uma configuração com a variação **Cadastro incorporado do WhatsApp**, token de usuário do sistema que **não expira** e as permissões `whatsapp_business_management` e `whatsapp_business_messaging` — o ID dela é o `META_WHATSAPP_CONFIG_ID`. Ligue **Login com o SDK do JavaScript** e cadastre o domínio da instalação nos domínios permitidos. Enquanto o app não tiver acesso avançado às duas permissões, só contas de quem tem função no app conectam.
