-- V17 - Reader feedback and article ratings
begin;
create table if not exists public.article_ratings (
  post_id uuid not null references public.posts(id) on delete cascade,
  visitor_id uuid not null,
  rating smallint not null check (rating between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (post_id, visitor_id)
);
alter table public.article_ratings enable row level security;
revoke all on public.article_ratings from public,anon,authenticated;
create or replace function public.journal_rate_article(p_post_id uuid,p_visitor_id uuid,p_rating integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if p_visitor_id is null or p_rating is null or p_rating not between 1 and 5 then raise exception 'Invalid rating'; end if;
 if not exists(select 1 from public.posts where id=p_post_id and status='published') then raise exception 'Article unavailable'; end if;
 insert into public.article_ratings(post_id,visitor_id,rating) values(p_post_id,p_visitor_id,p_rating)
 on conflict(post_id,visitor_id) do update set rating=excluded.rating,updated_at=now();
 return true;
end; $$;
create or replace function public.journal_article_rating(p_post_id uuid,p_visitor_id uuid)
returns table(rating_count bigint,average_rating numeric,my_rating integer)
language sql stable security definer set search_path = '' as $$
 select count(r.rating),round(avg(r.rating),1),coalesce(max(r.rating) filter(where r.visitor_id=p_visitor_id),0)::integer
 from public.article_ratings r join public.posts p on p.id=r.post_id
 where r.post_id=p_post_id and p.status='published';
$$;
create or replace function public.journal_admin_engagement()
returns table(post_id uuid,like_count bigint,comment_count bigint,rating_count bigint,average_rating numeric)
language sql stable security definer set search_path = '' as $$
 select p.id,coalesce(l.n,0),coalesce(c.n,0),coalesce(r.n,0),r.avg
 from public.posts p
 left join (select l.post_id,count(*) n from public.likes l group by l.post_id) l on l.post_id=p.id
 left join (select c.post_id,count(*) n from public.comments c where c.status='approved' group by c.post_id) c on c.post_id=p.id
 left join (select r.post_id,count(*) n,round(avg(r.rating),1) avg from public.article_ratings r group by r.post_id) r on r.post_id=p.id
 where public.is_journal_admin();
$$;
revoke all on function public.journal_rate_article(uuid,uuid,integer),public.journal_article_rating(uuid,uuid),public.journal_admin_engagement() from public,anon,authenticated;
grant execute on function public.journal_rate_article(uuid,uuid,integer),public.journal_article_rating(uuid,uuid) to anon,authenticated;
grant execute on function public.journal_admin_engagement() to authenticated;
commit;
