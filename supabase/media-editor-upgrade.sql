-- Run once in Supabase SQL Editor before using media renaming and video uploads.
-- Existing images, posts and storage policies remain unchanged.
begin;
create table if not exists public.journal_media_labels (
 object_name text primary key,
 label text not null check (char_length(label) between 1 and 120)
);
alter table public.journal_media_labels enable row level security;
revoke all on public.journal_media_labels from anon;
grant select, insert, update, delete on public.journal_media_labels to authenticated;
drop policy if exists "Journal admins manage media labels" on public.journal_media_labels;
create policy "Journal admins manage media labels" on public.journal_media_labels
 for all to authenticated using ((select public.is_journal_admin()))
 with check ((select public.is_journal_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('journal-videos','journal-videos',true,52428800,array['video/mp4','video/webm'])
 on conflict(id) do update set public=true,file_size_limit=52428800,allowed_mime_types=array['video/mp4','video/webm'];
drop policy if exists "Journal admins list videos" on storage.objects;
create policy "Journal admins list videos" on storage.objects for select to authenticated
 using (bucket_id='journal-videos' and (select public.is_journal_admin()));
drop policy if exists "Journal admins upload videos" on storage.objects;
create policy "Journal admins upload videos" on storage.objects for insert to authenticated
 with check (bucket_id='journal-videos' and (select public.is_journal_admin()));
drop policy if exists "Journal admins remove videos" on storage.objects;
create policy "Journal admins remove videos" on storage.objects for delete to authenticated
 using (bucket_id='journal-videos' and (select public.is_journal_admin()));
commit;
