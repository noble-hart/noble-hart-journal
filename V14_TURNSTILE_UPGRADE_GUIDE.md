# Noble Hart Journal — Version 14 (Turnstile and server-side comment throttling)

This is a **staged change**. Do not merge to `main` yet. The existing live Version 13 site must remain usable until all Worker secrets are configured.

## What's included

- Cloudflare Turnstile Managed challenge on new reader comments and replies using public site key `0x4AAAAAAGEHuOUnfK_l1O4b`.
- New Worker endpoint `POST /api/comments` checks the Origin header, validates field lengths and UUIDs, rate-limits IPs (Cloudflare native binding: approximately 8 submissions per 60 seconds per edge), and validates the one-time Turnstile token with Cloudflare Siteverify. It verifies the expected `workers.dev` hostname and `journal_comment`/`journal_reply` action.
- Worker submits the accepted comment through the existing Supabase `journal_submit_editable_comment` function. This continues to generate the edit token in the visitor's browser, screen new submissions, approve normal comments immediately, and hold suspicious content for moderation.
- SQL migration **after deployment** removes anonymous/direct authenticated comment INSERT access and restricts the privileged submission RPC to `service_role`, preventing client bypass of Turnstile.
- Existing admin replies and login, public likes, helpful votes, and visitor edit-token functionality are intentionally left unchanged.

## Extra private key needed before deployment

**TURNSTILE_SECRET_KEY** is already saved by the site owner to Cloudflare as a Worker Secret.

The Worker ALSO requires **SUPABASE_SECRET_KEY**. This is **not** the public anon/publishable key in `js/config.js`.

1. Open your project's Supabase dashboard → Project Settings → API Keys (or Connect → API Keys).
2. Under **Secret API Keys**, create a dedicated new key for this Worker if available (e.g. `journal-comment-worker-v14`). Copy the value beginning with `sb_secret_`. Never put it in chat, the GitHub repo, frontend files, or a screenshot.
3. Open Cloudflare → Workers & Pages → `noble-hart-journal` → Settings → Variables and Secrets → Add. Select **Secret**, name exactly `SUPABASE_SECRET_KEY`, paste the secret, then save/deploy.
4. Make sure existing `TURNSTILE_SECRET_KEY`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` bindings remain in place. Do **not** replace them.

**Security note:** The Supabase secret key bypasses RLS. Protect the Cloudflare account with MFA, restrict who can edit the Worker, and rotate the secret if compromised. The Worker uses it exclusively for one fixed comment RPC and never sends it to clients.

## Safe deployment sequence — follow in order

1. Configure `SUPABASE_SECRET_KEY` as a Cloudflare secret **before merging**.
2. Check that the GitHub changes and SQL file are present in the draft PR. Then merge to `main` to deploy the updated Worker, Wrangler binding, browser JavaScript, and CSS.
3. Confirm the Cloudflare deployment succeeded and `/sitemap.xml`, articles, `/admin` still load.
4. From an incognito browser, submit a thoughtful comment and a reply using Turnstile. Confirm they save and, if low-risk, publish immediately. Test admin author reply and visitor edit.
5. **Immediately after confirming the Worker submission works,** run `supabase/upgrade_turnstile_v14.sql` **ONCE** in Supabase SQL Editor. This closes the direct Supabase bypass.
6. Repeat reader comment, reader reply, admin reply and reader token-edit tests. Verify direct anon `comments` table INSERT and `journal_submit_editable_comment` RPC requests fail.
7. Observe Cloudflare Worker error logs and Turnstile Analytics for unexpected failures.

**Why SQL must follow deployment:** Running it first would intentionally block the old browser submission route, causing a comment outage. Deploying first leaves a short transition period in which old direct requests remain possible, until the SQL step completes. Do both steps in one supervised maintenance session.

## Important boundaries

- Current rate limiting is Cloudflare's **approximate per-edge** rate limiter, not a globally strict quota or absolute prevention of bot traffic.
- Likes and helpful votes still use browser IDs and are not covered by this Turnstile change; protecting those will be a separate, scoped update.
- If either server secret is absent, reader comment submissions fail closed with HTTP 503; the public site and admin page remain available.
- Turnstile tokens are single-use and expire; reload/reset the widget after a failed attempt.
- `workers.dev` is the widget's expected hostname. If a custom domain is added, update the Turnstile widget allowed hostnames and the Worker hostname check together.
- Never use the Supabase server secret in `js/config.js` or any client-exposed file.
- Current code has been prepared for review but **not yet tested against production secrets or live Cloudflare/Supabase**.

## Rollback

If the Worker deployment fails before SQL migration, revert the V14 GitHub merge to V13. If SQL has already been applied, reverting only the code will stop reader comments. You must either fix/redeploy the Worker, or explicitly restore the former INSERT policies and RPC grants from a reviewed pre-migration backup (temporarily reopening the abuse path). Do not disable RLS or distribute the Supabase secret as a workaround.
