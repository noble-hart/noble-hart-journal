# Version 18 — Fast discovery and featured posts

## Deployment order (important)
1. Keep the live Version 17.2 site running.
2. In the existing Supabase project, run the entire `supabase/upgrade_discovery_v18.sql` migration in SQL Editor. It adds an indexed search vector, a boolean pin flag and two read-only discovery RPCs. It does not delete or rewrite article text, change existing RLS policies, or modify comments.
3. Confirm the SQL succeeds. Then merge the Version 18 PR and let Cloudflare deploy.
4. Verify the public homepage, direct article links, both listing pages, admin and sitemap. No new secrets or subscriptions are needed.

## Discovery behavior
- Homepage: up to six article cards and three gift-guide cards, pinned items first within each section. Within each pin group, newest published date first.
- Listing pages: 12 cards at a time, with a Load more button when another page exists. Only card metadata is requested.
- Search begins approximately 280ms after typing pauses. Pressing Enter or Search still works. Search covers title, category, excerpt, SEO metadata and searchable body text. Partial words, English stemming and a curated set of related terms are supported. Exact title and original keyword matches receive higher weighting. This is ranked keyword search, not an AI semantic search or spelling-correction engine.
- Category filters apply alongside search and reset pagination. Clearing search restores featured/newest ordering.
- Direct article links fetch the body of that specific article; related cards are requested separately. Existing public pages no longer preload the entire article collection.
- Thumbnail images retain native lazy loading and now use async decoding. Existing three/two/one-column responsive card layout is retained.

## Pinning
In Admin → Articles, select **Pin** beside a published item. Select **Unpin** to restore normal order. A Featured label identifies pinned cards. Articles and guides are separated, and pinning never increases the homepage's card limit. Pinning is an admin-only table update governed by existing RLS policies. Search results are ranked by relevance, not pin priority.

## Post-deployment tests
- Search from the first letters of a title; try a term contained only in the article body and a related word (e.g. spouse/wife). Try a punctuation-containing query and clear the input.
- Switch categories during typing; ensure stale responses cannot overwrite current results.
- With more than 12 matching entries, load the next page and check for duplicate cards.
- Pin/unpin a published gift guide and article. Check both home and relevant listing ordering.
- Open a direct article URL and verify body, images, likes, comments, replies and related cards still appear.
- Check mobile layout and the existing visual editor.
- Verify an unpublished draft never appears in discovery results.

Public discovery is paginated at database level; the existing private admin list retains its previous loading model. Migration is additive and V17-compatible; do not merge the PR before running it. Static code checks are not a substitute for testing the new RPCs against the live Supabase project.
