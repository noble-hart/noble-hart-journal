-- Run once in Supabase SQL Editor. Public access is intentionally limited.
create extension if not exists pgcrypto;
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 3 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null default 'Journal',
  kind text not null default 'article' check (kind in ('article','guide')),
  status text not null default 'draft' check (status in ('draft','published')),
  excerpt text default '', body text not null,
  cover_url text, cover_alt text,
  seo_title text, seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  name text not null default 'Reader' check (length(name) between 1 and 60),
  body text not null check (length(body) between 3 and 1500),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  unique(post_id,visitor_id)
);
create index if not exists posts_published_idx on public.posts(status,published_at desc);
create index if not exists comments_post_status_idx on public.comments(post_id,status,created_at desc);
create index if not exists likes_post_idx on public.likes(post_id);
create or replace function public.is_journal_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.admin_users where user_id=(select auth.uid()));
$$;
revoke all on function public.is_journal_admin() from public;
grant execute on function public.is_journal_admin() to anon,authenticated;
create or replace function public.touch_post_updated_at() returns trigger language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end$$;
drop trigger if exists posts_updated_at on public.posts;
create trigger posts_updated_at before update on public.posts for each row execute function public.touch_post_updated_at();
alter table public.admin_users enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
revoke all on public.admin_users,public.posts,public.comments,public.likes from anon,authenticated;
grant select on public.admin_users to authenticated;
grant select on public.posts,public.comments,public.likes to anon,authenticated;
grant insert on public.comments,public.likes to anon,authenticated;
grant insert,update,delete on public.posts,public.comments,public.likes to authenticated;
create policy "Admins can see own admin record" on public.admin_users for select to authenticated using (user_id=(select auth.uid()));
create policy "Public published posts" on public.posts for select to anon,authenticated using (status='published' or (select public.is_journal_admin()));
create policy "Admins insert posts" on public.posts for insert to authenticated with check ((select public.is_journal_admin()));
create policy "Admins update posts" on public.posts for update to authenticated using ((select public.is_journal_admin())) with check ((select public.is_journal_admin()));
create policy "Admins delete posts" on public.posts for delete to authenticated using ((select public.is_journal_admin()));
create policy "Public approved comments" on public.comments for select to anon,authenticated using (status='approved' or (select public.is_journal_admin()));
create policy "Readers submit pending comments" on public.comments for insert to anon,authenticated with check (
  status='pending' and exists(select 1 from public.posts p where p.id=post_id and p.status='published')
  and body !~* '(https?://|www\.|<[^>]+>)'
);
create policy "Admins moderate comments" on public.comments for update to authenticated using ((select public.is_journal_admin())) with check ((select public.is_journal_admin()));
create policy "Admins delete comments" on public.comments for delete to authenticated using ((select public.is_journal_admin()));
create policy "Readers view likes" on public.likes for select to anon,authenticated using (true);
create policy "Readers like published posts" on public.likes for insert to anon,authenticated with check (
  exists(select 1 from public.posts p where p.id=post_id and p.status='published')
);
create policy "Admins delete likes" on public.likes for delete to authenticated using ((select public.is_journal_admin()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('journal-images','journal-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "Public view journal images" on storage.objects for select to public using (bucket_id='journal-images');
create policy "Admins upload journal images" on storage.objects for insert to authenticated with check (bucket_id='journal-images' and (select public.is_journal_admin()));
create policy "Admins remove journal images" on storage.objects for delete to authenticated using (bucket_id='journal-images' and (select public.is_journal_admin()));
-- IMPORTANT: after signing in once, find your user ID in Authentication > Users and run:
-- insert into public.admin_users(user_id) values ('YOUR_AUTH_USER_UUID');
-- Do not add admin_users write policies or expose service_role credentials.
-- Protect visitor identifiers: only admins can read raw like rows.
revoke select on public.likes from anon;
drop policy if exists "Readers view likes" on public.likes;
create policy "Admins view likes" on public.likes for select to authenticated using ((select public.is_journal_admin()));
create or replace function public.get_like_count(p_post_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.likes l join public.posts p on p.id=l.post_id
 where l.post_id=p_post_id and p.status='published';
$$;
revoke all on function public.get_like_count(uuid) from public;
grant execute on function public.get_like_count(uuid) to anon,authenticated;
