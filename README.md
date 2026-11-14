# The Noble Hart Journal — public blog + unified admin dashboard

A complete, deployable **starter** for a long-term editorial website. Uses static HTML/CSS/JavaScript, Supabase for data/auth/storage, and Cloudflare Pages for hosting. No Node build step is needed.

## What's included

- Responsive branded homepage; articles, gift guides, category filters, search, individual article pages
- Private `/admin` dashboard: magic-link sign-in, article create/edit/delete, drafts/publish, SEO fields, category renaming, image uploads, comment approval/rejection/deletion, engagement overview
- Persistent likes (one per local browser ID, **not bot-proof**) and moderated reader comments
- Supabase schema with row-level security and image storage bucket
- Three original supplied launch articles as **unpublished drafts**, with editorial placeholders preserved
- About, Contact, Privacy and Disclosure starter pages

## Step 1 — Set up the database

1. In Supabase open your `noble-hart-journal` project, then **SQL Editor > New query**.
2. Paste the entire `supabase/schema.sql` and click **Run**. It creates the tables, policies, functions and image bucket.
3. Optionally run `supabase/seed-drafts.sql` to import the three supplied article drafts. They are deliberately drafts; review and replace `[ADD A REAL MOMENT]` and `[LINK TO BOOKS PAGE]` before publishing.
4. Under **Project Settings > API** (or the current equivalent **Connect / API Keys** section), locate **Project URL** and the **publishable key** (or legacy `anon` key). These values are intended to be public; **never use the `service_role` or secret key in browser code**.
5. Open `js/config.js` and replace both placeholder strings with your Project URL and publishable/anon key. Save the file.

## Step 2 — Configure admin email login

1. In Supabase **Authentication > Providers**, enable Email. Use the email OTP/magic-link flow.
2. In **Authentication > URL Configuration**, set **Site URL** to your final Cloudflare Pages URL, e.g. `https://noble-hart-journal.pages.dev` (the exact name depends on availability). Add `https://YOUR-ACTUAL-SITE.pages.dev/admin` to **Redirect URLs**.
3. Once deployed, visit `https://YOUR-ACTUAL-SITE.pages.dev/admin` and request a login link with your own email. Open the link to create/sign in to your account.
4. Supabase **Authentication > Users** now shows your user UUID. Copy **only the UUID** and, in SQL Editor, run:

```sql
insert into public.admin_users(user_id) values ('PASTE-YOUR-USER-UUID-HERE') on conflict do nothing;
```

5. Refresh `/admin`. The admin dashboard is now accessible to this approved user only. **Other sign-ins cannot manage posts**.

**Security note:** Supabase's default email delivery is limited and may need a configured SMTP provider for production. Enable MFA on your Supabase and GitHub accounts. Configure the authentication email templates and allowed redirect URLs carefully.

## Step 3 — Upload to GitHub

1. Download this ZIP and extract it on your computer.
2. Open `https://github.com/noble-hart/noble-hart-journal`.
3. Choose **Add file > Upload files**, and upload **the contents of the extracted folder**, not the outer folder. Make sure `index.html`, `_redirects`, `assets/`, `js/`, and `supabase/` appear at the repository root. GitHub's web uploader may not accept a folder directly on every browser; use GitHub Desktop or upload files in batches if needed.
4. Commit changes to `main`. Keep the `supabase/` SQL files in the repository; they contain no credentials.

## Step 4 — Deploy on Cloudflare Pages

1. Open Cloudflare dashboard > **Workers & Pages** > **Create** > **Pages** > **Connect to Git** (wording may vary).
2. Connect GitHub and select repository `noble-hart/noble-hart-journal`.
3. Choose branch `main`, **Framework preset: None**, **Build command: leave empty**, **Build output directory: /** (repository root). If Cloudflare requires a build command, use `exit 0`; set output directory to `.`.
4. Deploy. Note the exact `*.pages.dev` URL assigned by Cloudflare.
5. Update Supabase Authentication URL settings to the **actual** address, as described above.
6. Visit the home page and `/admin`. Once authorized, create a draft, publish it, and test a comment from an incognito window. Approve it in the dashboard and verify it becomes public.

## Pre-launch checklist / limitations

- **Spam protection**: Direct anonymous Supabase inserts are functional but can be abused. Before inviting substantial traffic, add Cloudflare Turnstile and a server-side Cloudflare Pages Function or Worker with request throttling for comments/likes. Client-only restrictions are not sufficient. This starter is best for low-traffic launch and testing.
- **Privacy**: review Privacy/Contact/Disclosure text, add a real contact method and local legal requirements. Do not collect children's personal data. Likes use random local browser identifiers, not account identity.
- **Images**: public media URLs are accessible to everyone. Avoid uploading private assets. Images max 5MB; optimize before uploading.
- **Rich text**: editor supports plain text paragraphs and `##` / `###` headings, not WYSIWYG formatting. No newsletter integration yet.
- **SEO**: dynamic page titles/descriptions are client-rendered; social crawlers may not see post-specific metadata. For robust SEO/social previews, add prerendering/SSR in a later release. `robots.txt` is included; dynamic sitemap is not yet generated.
- **Drafts**: imported articles are not automatically published because they include original placeholders requiring your review.
- **Security**: no passwords, secret keys or database service credentials belong in the GitHub repository. Row-level security is critical; do not disable it.
- **Costs**: free tiers have usage limits; check provider plans before launch.

## Local preview

Open a local static server in the extracted directory (for example `python -m http.server 8080`) and visit `http://localhost:8080`. To test magic links locally, add `http://localhost:8080/admin` to Supabase Redirect URLs. Browsers cannot reliably load ES modules via `file://`.

## Brand palette

Navy `#17365D`, sky blue `#BFDDF0`, sage green `#A8C5A0`, warm cream `#FFF8EC`, gold `#F4C95D`. Fonts: Nunito and DM Sans.
