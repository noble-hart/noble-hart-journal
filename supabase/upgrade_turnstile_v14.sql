-- Version 14: close direct reader-comment submission bypass.
-- IMPORTANT: Run ONLY after V14 Worker/API code has deployed successfully,
-- with TURNSTILE_SECRET_KEY and SUPABASE_SECRET_KEY configured.
-- Do not run before the Worker endpoint is live.
BEGIN;

-- Only the Cloudflare Worker (using its private Supabase server key) may
-- invoke this privileged reader-comment submission RPC.
REVOKE ALL ON FUNCTION public.journal_submit_editable_comment(
  uuid, uuid, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journal_submit_editable_comment(
  uuid, uuid, text, text, uuid, uuid
) TO service_role;

-- Remove all existing INSERT-only policies on comments, including legacy
-- reader submission policies. Keep SELECT, UPDATE and DELETE policies intact.
DO $$
DECLARE policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'comments'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.comments', policy_record.policyname);
  END LOOP;
END;
$$;

-- Anonymous browsers cannot insert comments through the REST table endpoint.
REVOKE INSERT ON public.comments FROM anon;

-- Administrator author replies continue to use authenticated INSERT,
-- but visitors who happen to sign into Supabase cannot insert directly.
GRANT INSERT ON public.comments TO authenticated;
CREATE POLICY "Journal admins add author replies"
ON public.comments FOR INSERT TO authenticated
WITH CHECK ((SELECT public.is_journal_admin()));

COMMIT;

-- Expected result: new reader comments via /api/comments succeed after
-- Turnstile validation, while direct anon/auth RPC submissions and direct
-- anon/auth REST INSERTs are rejected. Admin replies still work.
