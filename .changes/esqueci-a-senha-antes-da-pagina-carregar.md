---
impacto: nada_mudou
secao: corrigido
titulo: "Esqueci a senha" não perde mais o pedido feito antes de a página terminar de carregar
---

Quem digitava o e-mail e clicava em "Enviar link de redefinição" antes de a tela terminar de
carregar via a página recarregar em branco: o e-mail sumia do campo e nenhum link era pedido.
Agora o envio é a própria ação do formulário, então funciona nesse intervalo — e até com o
JavaScript bloqueado —, mostrando "Verifique seu e-mail" como antes. Na falha, o e-mail
digitado continua no campo.
