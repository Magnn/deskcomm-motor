---
impacto: capacidade_nova
secao: adicionado
titulo: Messenger — a página do Facebook atendendo direto pela Meta, sem intermediário
---

Conecte a página do Facebook em **Conexões › Messenger** e as mensagens dela entram na caixa de entrada como as do WhatsApp: o agente responde, os fluxos rodam, o lead nasce, o opt-out vale.

- **Um clique para conectar**: o login do Facebook abre, você marca as páginas que vão atender, e cada uma vira um canal. Sem serviço pago no meio do caminho e sem custo por mensagem.
- **Resposta feita fora do CRM** (pela caixa de entrada da Meta ou pelo celular) aparece no histórico e pausa a IA naquela conversa — ela não responde por cima de uma pessoa.
- **Anúncio "Clique para o Messenger"**: o contato chega com o anúncio de origem gravado, igual ao do WhatsApp.
- Nome de quem escreveu, fotos, vídeos, áudios, arquivos e toques em botão entram na conversa; o "digitando…" aparece enquanto o agente responde; entregue e lido viram tique.
- **A IA começa pausada** em cada página nova, como em todo canal: libere quando quiser, no próprio cartão da página.
- **Desconectar** fica no cartão da página: os avisos são desligados na Meta e as conversas continuam guardadas. Conectar a mesma página de novo retoma as mesmas conversas.
- Uma página atende uma empresa só; a que já está em outra empresa da instalação é recusada com o motivo.

O Messenger só deixa responder até 24h depois da última mensagem da pessoa — passado isso, o envio é recusado com a frase que explica.

**Para usar:**

Aplique a migration 0911. No `.env`, defina `META_APP_ID` (o ID do app da Meta; o segredo e o token de verificação já são os de Admin › API Oficial). No app da Meta, adicione o produto **Messenger** e o **Login do Facebook**, e cadastre o endereço de volta `https://SEU-DOMINIO/api/v1/messenger/oauth/callback`. O webhook das páginas (`https://SEU-DOMINIO/api/v1/webhooks/messenger`) é ligado sozinho na primeira conexão. Se o app for do tipo Empresa, crie uma configuração de "Login do Facebook para Empresas" com as permissões `pages_show_list`, `pages_messaging`, `pages_manage_metadata` e `pages_read_engagement` e defina `META_MESSENGER_CONFIG_ID`. Enquanto o app não passar pela análise da Meta, só páginas de quem tem função no app conectam.
