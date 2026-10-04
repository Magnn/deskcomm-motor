---
impacto: capacidade_nova
secao: adicionado
titulo: Meta Ads conecta com um clique — botão "Conectar com Facebook" e escolha da conta numa lista
---

Em Configurações › Meta Ads, a conta de anúncios agora é conectada pelo login do Facebook:
a pessoa autoriza a leitura e volta com a conta conectada, sem gerar nem colar token. Quem
tem uma única conta ativa não escolhe nada; quem tem várias escolhe pelo nome numa lista,
em vez de digitar o `act_…`. Colar um token continua disponível, recolhido em "avançado".

O botão aparece quando a instalação tem o app da Meta cadastrado (`META_APP_ID` e o segredo
de Admin › API Oficial) com o produto "Login do Facebook", a permissão `ads_read` e o
endereço de volta `/api/v1/plataformas-de-anuncio/meta/callback`. Sem isso, a tela segue
como era. `META_ADS_CONFIG_ID` é opcional.
