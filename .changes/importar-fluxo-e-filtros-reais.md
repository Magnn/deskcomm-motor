---
impacto: nada_mudou
secao: corrigido
titulo: Importar fluxo volta a funcionar, e os filtros da lista de fluxos passam a ler o dado real
---

**Importar fluxo.** A importação nunca chegava ao fim: a tela chamava um endereço que não existe no servidor, criava o fluxo vazio e mostrava erro. Agora o arquivo é conferido antes de qualquer coisa (arquivo incompatível não deixa um fluxo vazio para trás) e o fluxo importado é salvo como rascunho. A tela deixou de prometer arquivos do ChatbotX — só é aceito o arquivo gerado pelo botão Exportar deste sistema — e avisa quando o fluxo tem imagens, áudios ou arquivos: eles não vêm dentro do arquivo exportado e precisam ser enviados de novo nas caixas.

**Filtros da lista de fluxos.** "App Oficial / App Business" e "Gatilhos" liam uma escolha guardada no navegador de quem criou o fluxo: em outro computador todo fluxo aparecia como "App Business" e os filtros esvaziavam a lista. Agora o filtro de canal mostra os fluxos vinculados a número oficial ou a número por QR code, e o de gatilho usa a origem configurada na caixa "Início". O selo do cartão só aparece quando o fluxo tem número vinculado. Não há ação para quem opera a VPS.
