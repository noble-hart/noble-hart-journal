-- V18 additive migration. Run before deploying V18. Safe for V17.
begin;
alter table public.posts add column if not exists is_pinned boolean not null default false;
create index if not exists posts_public_discovery_idx on public.posts(kind,is_pinned desc,published_at desc,id) where status='published';
create index if not exists posts_public_category_idx on public.posts(kind,category) where status='published';
-- Search content with weighted fields; HTML tags are removed before indexing.
alter table public.posts add column if not exists discovery_search tsvector generated always as (
 setweight(to_tsvector('english'::regconfig,coalesce(title,'')),'A') ||
 setweight(to_tsvector('english'::regconfig,coalesce(category,'')||' '||coalesce(excerpt,'')||' '||coalesce(seo_title,'')||' '||coalesce(seo_description,'')),'B') ||
 setweight(to_tsvector('english'::regconfig,regexp_replace(coalesce(body,''),'<[^>]*>',' ','g')),'D')
) stored;
create index if not exists posts_discovery_search_idx on public.posts using gin(discovery_search) where status='published';

create or replace function public.journal_discover_posts(
 p_kind text, p_query text default '', p_category text default null,
 p_offset integer default 0, p_limit integer default 12
)
returns table(id uuid,title text,slug text,category text,kind text,excerpt text,cover_url text,cover_alt text,published_at timestamptz,created_at timestamptz,is_pinned boolean)
language sql stable security invoker set search_path = ''
as $$
 with terms as (
   select left(lower(trim(coalesce(p_query,''))),120) as phrase
 ), tokens as (
   select distinct word from terms cross join lateral regexp_split_to_table(phrase,'[^[:alnum:]]+') as word
   where length(word)>0
 ), synonyms(term,related) as (
   values
   ('spouse','wife'),('spouse','husband'),('spouse','partner'),
   ('wife','spouse'),('wife','partner'),('husband','spouse'),('husband','partner'),
   ('partner','spouse'),('partner','wife'),('partner','husband'),
   ('kid','child'),('kids','children'),('kids','child'),('children','kids'),('child','kid'),
   ('teen','teenager'),('teens','teenager'),('teenager','teen'),('teenagers','teen'),
   ('gift','present'),('gifts','present'),('present','gift'),('presents','gift'),
   ('christmas','festive'),('christmas','holiday'),('festive','christmas'),('holiday','christmas'),
   ('birthday','celebration'),('celebration','birthday'),
   ('icebreaker','conversation'),('icebreakers','conversation'),('conversation','icebreaker'),
   ('game','activity'),('games','activities')
 ), expanded as (
   select word from tokens
   union
   select s.related from synonyms s join tokens t on t.word=s.term
 ), q as (
   select phrase,
     (select to_tsquery('english'::regconfig,string_agg(quote_literal(word)||':*',' | ')) from tokens) as exact_query,
     (select to_tsquery('english'::regconfig,string_agg(quote_literal(word)||':*',' | ')) from expanded) as query
   from terms
 )
 select p.id,p.title,p.slug,p.category,p.kind,p.excerpt,p.cover_url,p.cover_alt,p.published_at,p.created_at,p.is_pinned
 from public.posts p cross join q
 where p.status='published' and p.kind=p_kind
 and (p_category is null or p.category=p_category)
 and (q.phrase='' or p.discovery_search @@ q.query
      or strpos(lower(p.title||' '||coalesce(p.excerpt,'')||' '||p.category),q.phrase)>0)
 order by
 case when q.phrase='' then p.is_pinned else false end desc,
 case when q.phrase<>'' then
   (case when strpos(lower(p.title),q.phrase)>0 then 8 else 0 end)
   + coalesce(ts_rank_cd(p.discovery_search,q.exact_query),0)*12
   + coalesce(ts_rank_cd(p.discovery_search,q.query),0)*2
   + (select count(*) from tokens where strpos(lower(p.title||' '||p.category||' '||coalesce(p.excerpt,'')),word)>0)
 else 0 end desc,
 p.published_at desc nulls last,p.id
 offset greatest(0,coalesce(p_offset,0)) limit least(51,greatest(1,coalesce(p_limit,12)));
$$;
create or replace function public.journal_discovery_categories(p_kind text)
returns table(category text) language sql stable security invoker set search_path=''
as $$ select distinct p.category from public.posts p where p.status='published' and p.kind=p_kind and p.category<>'' order by p.category $$;
revoke all on function public.journal_discover_posts(text,text,text,integer,integer) from public;
revoke all on function public.journal_discovery_categories(text) from public;
grant execute on function public.journal_discover_posts(text,text,text,integer,integer) to anon,authenticated;
grant execute on function public.journal_discovery_categories(text) to anon,authenticated;
commit;
