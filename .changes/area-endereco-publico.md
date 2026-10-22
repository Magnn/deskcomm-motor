---
impacto: capacidade_nova
secao: adicionado
titulo: Endereço público da área do cliente (apelido) e a tela da área deixa de apagar os quizzes ao salvar
---

Em **Área do cliente › Configuração**, o campo **Endereço público** dá à área um segundo endereço, `/c/<apelido>`,
que abre a mesma área que `/c/<slug>`. O slug costuma ser o nome de quem criou a conta e não muda (é a chave da
sessão, do app instalado e dos links já enviados); o apelido é o nome que vai em anúncio e em link novo — convites,
link mandado pelo agente, presentes e os redirecionamentos de dentro da área passam a usá-lo. Ele é único na
instalação: um nome já usado por outra empresa é recusado com 409.

Conserto junto: salvar a configuração pela tela apagava `sinastria_quiz`, `quiz_prosperidade` e `quiz_caminhos`,
porque a tela não os enviava e o PUT grava a área inteira. A tela agora devolve o que não edita como veio.
