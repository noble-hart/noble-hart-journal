# Noble Hart Journal — Version 13: comment ownership + password sign-in

**Staged upgrade:** This PR is prepared on a separate feature branch. It does not change the production website until merged to `main`. It does not execute SQL in Supabase automatically.

## What changes

- Keep automatic approval of low-risk reader comments and the existing spam-screening trigger.
- Keep public reader comments, replies, token-based reader editing, and the administrator's ability to reply to visitors.
- Remove the Edit button from administrator moderation for visitor comments and replies.
- Track verified administrator ownership in `comments.author_user_id`; allow the administrator to edit only their own newly authored comments and replies. Enforce ownership in a database update trigger as well as UI.
- Preserve administrator approval, rejection and deletion of comments.
- Add Supabase email/password sign-in alongside the existing email magic-link option, plus an Account tab to set the password for the **existing** admin account.
- No Firebase account or identity migration is required.

## Installation (order is important)

1. Before changing the live site, save your working `main` revision and ensure you can still log in with your current email magic link. Review the contents of this branch.
2. In Supabase SQL Editor, **run once** `supabase/upgrade_comment_ownership_v13.sql`. This creates the ownership column and update/insert triggers. It does not delete or modify existing comments.
3. Verify that Supabase reports success. Do not rerun earlier setup/schema or migrations.
4. Merge this PR to `main` when ready. Cloudflare should deploy it through the existing GitHub integration. Do not replace `js/config.js`, `js/integrations-config.js`, `worker.js`, `wrangler.jsonc` or live environment variables.
5. Use the **existing magic link** at `/admin` and sign into the existing admin account. Open **Account** in the sidebar and create a unique password of at least 12 characters. Do not create a second administrator account.
6. Sign out; verify email+password login. Magic link remains as fallback.

## Comment tests

- As a logged-out reader, submit a benign comment: if it passes existing screening, it appears immediately.
- As a reader, reply to an approved top-level comment and edit that comment using the saved browser token: the edited comment returns to pending moderation.
- As admin, open Comments: reader comments must **not** display `Edit my comment`, but **Reply as author**, Approve/Reject, and Delete still work.
- Reply to an approved reader top-level comment as admin. The reply should publish as Noble Hart with the Author badge and `Edit my comment` in the admin dashboard.
- Edit that new admin reply; the text should update. Verify a request attempting to edit the body of a visitor comment directly is rejected by the database.
- Test Media Library, article publishing, contact form, analytics and newsletter links for regression.

## Historical author comments

Older author comments and replies predate verified ownership recording and therefore have `author_user_id = NULL`. They remain published (or retain their current status), but are not editable through the administrator dashboard. **Do not bulk-assign every `is_author=true` comment to the current admin without independently verifying its authorship.**

## Why the SQL guard matters

Admin RLS allows general UPDATE for moderation, but the new BEFORE UPDATE trigger rejects modifications to visitor comment text/name. The existing token-verified privileged reader-edit RPC remains enabled and can still edit a reader's comment, setting its status to pending. This design protects the words of others while preserving moderation.

## Rollback

If a deployment issue occurs, revert the `js/app.js` commit/PR merge to return to the previous login interface. If the DB guard itself causes a problem, use the SQL below **only as an emergency rollback**. It removes the new enforcement, **and temporarily restores the old ability to edit visitor comments** until a corrected migration is applied. It intentionally keeps the new column and all comment data.

```sql
BEGIN;
DROP TRIGGER IF EXISTS journal_comment_guard_updates ON public.comments;
DROP TRIGGER IF EXISTS journal_comment_assign_owner ON public.comments;
DROP FUNCTION IF EXISTS public.journal_guard_comment_updates();
DROP FUNCTION IF EXISTS public.journal_assign_comment_owner();
COMMIT;
```

Do not roll back merely because pre-migration author replies are not editable; that is the intended safe behavior.

## Known remaining hardening

This upgrade is **not** a bot-prevention system. Reader comment rate limiting uses a browser-supplied visitor ID, and automated voting is possible with changing IDs. Plan separately for server-verified Cloudflare Turnstile, server-side rate limiting, and optional deactivation of the legacy newsletter RPC. The email/password form does not replace MFA or password breach protection.
