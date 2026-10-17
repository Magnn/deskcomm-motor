---
impacto: nada_mudou
secao: corrigido
titulo: A troca de domínio da VPS do motor valida o Caddy antes de gravar e não recria o banco
---

`ops/vps/trocar-dominio.sh` passa a validar o Caddyfile novo antes de gravar qualquer arquivo
(antes os `.env` ficavam com os endereços novos quando o Caddy recusava) e reinicia o login do
Supabase com o projeto e os arquivos do próprio contêiner em execução, sem encostar no banco.
