-- Noble Hart Journal: comment ownership and safe moderation (v13)
-- Apply ONCE in Supabase SQL Editor BEFORE merging the accompanying website PR.
-- Preserves automatic approval, public replies, reader edit-token RPCs,
-- admin replies and status-only moderation.
BEGIN;

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS author_user_id uuid;

-- An authenticated Journal administrator is the author of any comment
-- submitted under their session. Ignore caller-supplied owner values.
CREATE OR REPLACE FUNCTION public.journal_assign_comment_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
BEGIN
  NEW.author_user_id := CASE
    WHEN (SELECT public.is_journal_admin()) THEN (SELECT auth.uid())
    ELSE NULL
  END;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS journal_comment_assign_owner ON public.comments;
CREATE TRIGGER journal_comment_assign_owner
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_assign_comment_owner();

-- Admins can moderate anyone's STATUS, but must not rewrite another
-- person's name or text. Authenticated authors may edit only their own text.
-- The legacy reader-edit RPC runs as its owner (postgres), after checking
-- the per-comment edit token, and therefore remains functional.
CREATE OR REPLACE FUNCTION public.journal_guard_comment_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  is_own_admin_comment boolean;
BEGIN
  -- No API caller may reassign ownership or rewrite comment identity.
  IF ROW(NEW.author_user_id, NEW.visitor_id, NEW.post_id,
         NEW.parent_id, NEW.is_author, NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.author_user_id, OLD.visitor_id, OLD.post_id,
         OLD.parent_id, OLD.is_author, OLD.created_at)
  THEN
    RAISE EXCEPTION 'Comment identity and ownership cannot be changed';
  END IF;

  -- SECURITY DEFINER reader edit-token RPC legitimately updates the body.
  -- Ordinary authenticated admin API writes run under 'authenticated'.
  IF current_user <> 'postgres' THEN
    is_own_admin_comment := (
      OLD.author_user_id IS NOT NULL
      AND OLD.author_user_id = (SELECT auth.uid())
      AND (SELECT public.is_journal_admin())
    );
    IF NOT is_own_admin_comment AND
       ROW(NEW.name, NEW.body, NEW.edited_at)
       IS DISTINCT FROM ROW(OLD.name, OLD.body, OLD.edited_at)
    THEN
      RAISE EXCEPTION 'You may edit only your own comment; moderate other comments using status';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS journal_comment_guard_updates ON public.comments;
CREATE TRIGGER journal_comment_guard_updates
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_guard_comment_updates();

-- Internal trigger functions do not need to be callable via the REST API.
REVOKE ALL ON FUNCTION public.journal_assign_comment_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journal_guard_comment_updates() FROM PUBLIC, anon, authenticated;
-- Existing screening trigger also needs no direct REST EXECUTE privilege.
REVOKE ALL ON FUNCTION public.journal_screen_new_comment() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Historical administrator replies have no verifiable ownership ID.
-- They deliberately remain unattributed, hence not editable from admin UI,
-- until ownership is confirmed and backfilled explicitly.
