---
impacto: nada_mudou
secao: corrigido
titulo: O bloco "Editar Pixel" do fluxo mandava o evento para um destino que a plataforma recusa
---

O bloco de pixel do construtor de fluxos enviava o evento para o pixel escrito nele (ou o da tela de Conversões), sem informar a conta do WhatsApp. Em conversa de WhatsApp a plataforma só aceita o evento no conjunto de dados da própria conta do WhatsApp Business — a venda já ia para lá, o bloco não. Agora o bloco usa o mesmo destino da venda.

O campo de pixel do bloco deixou de escolher o destino. Quando ele traz um pixel diferente do conjunto da conta, o evento vai para o conjunto da conta e a tela de Conversões registra que o pixel do bloco foi ignorado. Conversa que não passou por um canal oficial aparece como pendência, com o motivo.
