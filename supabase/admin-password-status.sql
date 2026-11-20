-- V16: expose only whether the signed-in administrator has a password.
begin;
create or replace function public.journal_admin_has_password()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when auth.uid() is not null and public.is_journal_admin()
    then (select coalesce(u.encrypted_password, '') <> '' from auth.users u where u.id = auth.uid())
    else null end;
$$;
revoke all on function public.journal_admin_has_password() from public, anon;
grant execute on function public.journal_admin_has_password() to authenticated;
commit;
