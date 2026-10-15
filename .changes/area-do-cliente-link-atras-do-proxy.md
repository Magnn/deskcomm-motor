---
impacto: nada_mudou
secao: corrigido
titulo: Link de acesso da Área do cliente abria página de erro atrás do proxy
---

Em instalação com proxy reverso, o link de acesso (e os botões de comprar, abrir material e
sair) redirecionava para o endereço interno do contêiner (`0.0.0.0:3000`) e o navegador
mostrava erro. O redirecionamento passa a ser relativo ao domínio em que a pessoa está, e o
link gerado na tela usa o endereço público da instalação.
