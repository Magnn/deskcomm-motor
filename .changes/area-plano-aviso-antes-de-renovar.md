---
impacto: exige_acao
secao: corrigido
titulo: O Plano da Semana avisa por e-mail antes de renovar no cartão
---

A renovação sozinha do Plano da Semana cobrava o cartão sem avisar antes. Agora o cliente recebe um e-mail 48 horas antes, com o valor, o dia da cobrança e o caminho para cancelar na área. A renovação só cobra a semana que foi avisada há 24 horas ou mais: sem e-mail no contato, ou com o envio de e-mail sem configuração, ninguém é cobrado no cartão (a pessoa ainda pode pagar a semana pela área).

## Requer atenção

Aplique a migration 0958 (`area_planos.aviso_para` e `aviso_em`) junto com a atualização. Sem ela, a rodada de renovação falha e nada é cobrado.
