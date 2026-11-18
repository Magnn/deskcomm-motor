---
impacto: capacidade_nova
secao: adicionado
titulo: Número oficial do WhatsApp por link de cadastro de um segundo provedor parceiro
---

Com a chave do projeto da instalação no segundo provedor parceiro (Painel › Configuração,
ou `KAPSO_API_KEY` no `.env`), a tela de Conexões ganha uma aba própria: cada empresa conecta
o número oficial por um link de cadastro (Facebook + número; com coexistência, o app WhatsApp
Business continua no celular), sem conta no provedor. Na volta, o sistema confere que o número
é daquela empresa e registra o webhook sozinho, com segredo próprio. Vários números por empresa,
contados no plano. Sem a chave, nada muda. Modelos aprovados ainda não são gerenciados por esta
aba: fora da janela de 24h, a mensagem fica retida como em qualquer canal da Meta.
