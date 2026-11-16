# Version 15 — Rich HTML Gift Guide Import

## How to import your existing Noble Hart gift guide

1. Sign in at `/admin` and choose **Write / Edit**.
2. Fill in **Article title**, **URL slug**, **Category**, **Type = Gift guide**, excerpt and featured image as usual.
3. In the **Article body** area, choose **Import HTML gift guide (.html)** and select your saved HTML file.
4. The uploader removes embedded scripts, styles, unsafe attributes, and any HTML `<h1>` because the Journal already renders your article title from the Title field. It retains normal paragraphs, headings, links, ordered/unordered lists, simple comparison tables, and supported callout classes.
5. Click **Preview**, inspect the formatted guide, then save as **Draft** first.
6. Open the draft to edit again or publish when ready.

### Supported design classes

- `nh-check`: cream highlighted “Before you buy” advice with gold left border.
- `nh-note`: soft grey editorial note box.
- `nh-kicker`: burgundy subheading.
- `nh-reference`: small manufacturer/reference information.
- `nh-table-wrap`: horizontally scrollable comparison table on small phones.
- `nh-eyebrow`: small uppercase category.
- Other CSS class names and all inline styling are intentionally stripped.

### Safety boundaries and limitations

- No arbitrary JavaScript, iframes, embedded forms, image tags, inline CSS, event handlers or SVG are allowed in imported articles.
- Standard links support absolute `https://`, `http://` and `mailto:` URLs only. External links get `rel="noopener noreferrer"`.
- Imported body content is marked internally as rich HTML and sanitized again whenever displayed. Regular Markdown articles remain unchanged.
- The text area becomes an HTML source editor for rich articles, not a WYSIWYG editor. Import the file again to replace the body; other fields remain unchanged.
- HTML file must be under 500 KB. The app does not upload the HTML file itself: its cleaned content is stored in the article's existing Supabase `body` text field.
- Featured images should still be added via the existing Media Library and cover image field.
- The original `<style>` block is removed; supported gift-guide components use the Journal's own scoped stylesheet.
- This change introduces no new SQL migrations, no new secrets and no changes to Supabase security policies, comments or existing article records.

## Verification

- Publish an imported gift guide as a draft first and verify the article title appears exactly once.
- Verify the comparison table scrolls horizontally on narrow screens and “Before you buy” boxes are highlighted.
- Confirm manufacturer links work and no JavaScript, unexpected site header or custom global styles appear.
- Reopen the draft in the editor and check the imported source remains.
- Open a pre-existing Markdown article and confirm its formatting/preview still works.
