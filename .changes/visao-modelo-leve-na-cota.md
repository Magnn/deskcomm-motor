---
impacto: nada_mudou
secao: corrigido
titulo: Leitura de imagem segue no modelo leve do Gemini quando o modelo escolhido esgota a cota
---

No Google a cota grátis é contada por modelo. Quando o modelo da leitura de imagem (por exemplo
gemini-3.5-flash) responde "cota esgotada" em todas as chaves, a leitura tenta sozinha o modelo
leve da mesma família (gemini-3.5-flash-lite), que tem cota própria, antes de desistir. Comprovante
de Pix volta a ser lido sem trocar nada na tela.
