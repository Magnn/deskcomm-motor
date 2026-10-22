---
impacto: capacidade_nova
secao: adicionado
titulo: Os quizzes da página mostram a guia (foto) e os vídeos dela
---

A área do cliente ganha a "guia dos quizzes": nome e foto da personagem que conduz, e dois vídeos por quiz, um no
meio (na tela que explica como a leitura funciona) e outro na prévia, acima da oferta. A foto aparece no topo do
quiz, nas frases entre os capítulos e na tela de cálculo. Os arquivos ficam num bucket público só para isso
(`area-midia`, migration 0946). A configuração guarda o caminho do arquivo, e a URL é montada a partir do endereço
do Storage da instalação. Sem foto ou sem vídeo configurado, a tela fica como antes.
