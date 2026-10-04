---
impacto: nada_mudou
secao: corrigido
titulo: Conectar o Meta Ads com Facebook funciona com o token que não expira
---

Com a configuração do "Login do Facebook para Empresas" que emite token de usuário do
sistema, a conexão terminava em "A permissão de leitura dos anúncios não foi concedida"
mesmo com tudo concedido: a plataforma não lista contas para esse tipo de token. O sistema
agora pergunta quais contas o consentimento concedeu e lê cada uma. Esse token também
deixa de passar pela troca de longa duração, que é só do token de pessoa.
