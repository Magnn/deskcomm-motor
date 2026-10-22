-- 0946 · A mídia da área do cliente: a foto da guia e os vídeos dos quizzes (`lib/area-do-cliente/midia.ts`).
--
-- Bucket PÚBLICO só disto (`area-midia`): a página do quiz é pública e o vídeo precisa tocar sem sessão. Caminho
-- `<organização>/<arquivo>`; a configuração guarda o caminho, nunca a URL. Limite de 15 MB por arquivo (um vídeo
-- vertical de ~1 min comprimido tem 5–6 MB). Idempotente e convergente: `on conflict do update`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('area-midia', 'area-midia', true, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
