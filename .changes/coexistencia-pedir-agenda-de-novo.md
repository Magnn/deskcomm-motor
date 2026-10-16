---
impacto: nada_mudou
secao: corrigido
titulo: Coexistência — agenda e conversas do celular podem ser pedidas de novo
---

Ao conectar um número em coexistência, o pedido da agenda e das conversas do celular à Meta
saía uma única vez, no mesmo segundo da conexão; se a Meta recusasse (por exemplo, número ainda
não ativo na Cloud API), os contatos e o histórico não vinham e só refazendo a conexão pelo
celular. Agora a conexão tenta de novo por alguns segundos quando o número ainda não está ativo,
guarda o desfecho no número e a aba API Oficial mostra o resultado com o botão "Pedir de novo"
dentro das 24 horas que a Meta permite.
