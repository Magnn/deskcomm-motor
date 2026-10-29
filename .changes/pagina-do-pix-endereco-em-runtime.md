---
impacto: nada_mudou
secao: corrigido
titulo: O Pix enviado pelo botão do chat leva o link certo da página "Copiar código Pix"
---

O Pix enviado à mão pelo chat levava o link da página de pagamento com o endereço provisório da imagem
(`placeholder.invalid`), que não abre. Agora o link usa o endereço público da instalação. Sem endereço
público válido, o link não vai na mensagem e a pessoa recebe só o código.
