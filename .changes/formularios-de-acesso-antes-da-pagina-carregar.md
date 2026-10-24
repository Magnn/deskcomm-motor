---
impacto: nada_mudou
secao: corrigido
titulo: Login, cadastro, código de 2 etapas e recuperação não perdem mais o clique dado antes de a página carregar
---

Como já tinha sido corrigido no "Esqueci a senha", os demais formulários de acesso — entrar,
criar conta, código de verificação em duas etapas, código de recuperação, nova senha e
recuperar a organização — recarregavam a tela em branco quando o botão era clicado antes de a
página terminar de carregar, e o que tinha sido digitado sumia. Agora o envio é a própria ação
do formulário: funciona nesse intervalo e até com o JavaScript bloqueado. Na falha, os campos
que não são senha continuam preenchidos; ao definir a nova senha, as senhas digitadas também
continuam quando o sistema pede o código de 2 etapas.
