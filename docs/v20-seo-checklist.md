# V20 deployment checks

This branch adds edge-rendered initial HTML for public home, article and gift-guide listings, and article detail pages. The existing client takes over after Supabase initializes. The initial listing contains up to 50 published entries per kind; normal interactive pagination is unchanged.

## Before merging
- Verify a Cloudflare preview deployment has SUPABASE_URL and SUPABASE_ANON_KEY configured (the same public bindings used by sitemap.xml). Never use the secret key for article reads.
- View page source (not just Elements) on a published article. Confirm heading, body, SEO title, description, canonical, OG and BlogPosting JSON-LD.
- Disable JavaScript and check article readability, home and listing links.
- Re-enable JavaScript and test search, load more, categories, likes, comments/Turnstile, admin login, import and SEO alternatives.
- Test rich HTML tables, images, links, Markdown and malicious HTML fixtures (scripts, events, javascript: links, SVG, malformed markup).
- A non-existent or draft slug must return 404 and noindex; a database outage returns 503 with Retry-After.
- Verify sitemap.xml, robots.txt and Search Console verification remain intact.
- Check GET and HEAD, trailing slash routes, and mobile layout. Compare edge content to the browser-rendered content. The initial shell is intentionally simpler than the interactive UI.
- Confirm browser failure leaves the initial HTML usable and that publishing/editing is reflected without an outdated cached response.

No database migrations are required by this change. The response advertises a 60-second shared-cache lifetime; actual Cloudflare cache behavior depends on deployment settings. No explicit Cache API storage is implemented.

After deployment, use Search Console URL Inspection and submit the existing sitemap. Indexing is not guaranteed.

Rollback: revert the V20 merge or redeploy the previous main commit.
