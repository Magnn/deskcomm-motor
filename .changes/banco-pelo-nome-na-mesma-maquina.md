---
impacto: capacidade_nova
secao: adicionado
titulo: O app e o worker acham o banco pelo nome quando o Supabase roda na mesma máquina
---

Quem roda o Supabase na própria VPS pode apontar `SUPABASE_DB_URL` para
`host.docker.internal` em vez do IP da rede do Docker. O IP muda quando o Docker
recria a rede (um reinício bastou para o worker ficar horas sem conectar); o nome é
resolvido pelo Docker a cada criação do contêiner. Quem usa o Supabase na nuvem não
precisa mudar nada.
