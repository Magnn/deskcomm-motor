---
impacto: nada_mudou
secao: corrigido
titulo: Cada saída de uma caixa leva uma linha só — o construtor não deixa mais desenhar caminho que nunca roda
---

O fluxo sempre seguiu uma única linha por saída, mas o construtor deixava puxar duas da mesma bolinha: a segunda ficava desenhada e nunca rodava. Agora, puxar de novo da mesma saída **troca** o destino (com aviso), e não dá para ligar uma caixa nela mesma. Ao publicar, um fluxo antigo ou importado que tenha duas linhas na mesma saída é recusado com o nome da caixa e da saída. Várias linhas **entrando** na mesma caixa continuam permitidas: são caminhos que se juntam, e cada contato chega por um só. Fluxos já publicados continuam rodando como estavam. Não há ação para quem opera a VPS.
