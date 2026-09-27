---
impacto: nada_mudou
secao: corrigido
titulo: Uma espera longa imune à resposta não é mais cancelada quando o prazo vence
---

Uma inscrição em espera longa imune à resposta ("dormente") que chegava ao prazo era
cancelada com "Atendimento encerrado ou substituído", mesmo sem o atendimento ter
acabado: o guarda de agenda só reconhecia as inscrições ativas ou aguardando resposta.
Agora ele reconhece também as dormentes. A correção vem na atualização do banco, sem
ação manual.
