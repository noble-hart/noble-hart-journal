# Version 17 — Visual article editor and image layouts

## Editing modes
- Visual editor: edit formatted article text directly, including table cells and existing callouts. Imported HTML opens in visual mode automatically.
- Source / Markdown: advanced editing. Existing Markdown posts open in source mode; switch to Visual to edit the rendered content. Once a visual edit is made, the article is stored as sanitized rich HTML.
- Preview: read-only article-body preview. Return using Visual editor or Source / Markdown.

The toolbar offers bold, italic, underline, strikethrough, H2/H3, lists, quotes, alignment, links, images, new tables, callouts, and native browser undo/redo. Some controls are available only in Visual mode. Undo history may reset when switching modes. Paste into the visual editor inserts plain text; use HTML import to bring in formatted documents.

## Images
Place the cursor before the paragraph that should wrap around the image. Choose Image and upload a JPG, PNG or WebP up to 5 MB, or supply an existing public URL. Enter descriptive alt text and an optional caption.

Choose left, right, center, or full width. Width options are 25%, 40%, 50%, 75%, and 100%. Left and right are capped at 50% on desktop so the text remains readable, and stack as centered images on mobile. For best results, use roughly 40% for product shots.

In Visual mode, click an existing inline image to edit its source, caption, alt text, alignment, or width. Save your article to persist changes. Images used in saved articles are protected against deletion through the Media Library interface.

## Verification
1. Reopen an existing rich HTML gift guide in the dashboard. Confirm table and callout formatting appears in Visual mode.
2. Edit a sentence, apply bold/underline, switch to Source, then Preview, then Visual. Confirm changes and supported formatting persist.
3. Insert a left-aligned 40% image before a paragraph. Check text wrapping on desktop and stacking on mobile.
4. Click the image and change its alignment. Insert a table and change its cell text. Insert a callout.
5. Save as draft, reopen, and confirm all changes persist.
6. Test an existing Markdown article in source mode and verify its published layout is unchanged.

## Compatibility
No SQL migration or new secrets. The existing body field and current HTML sanitizer are retained; additional narrowly approved layout classes and semantic formatting tags are supported. Arbitrary scripts, CSS and event attributes remain excluded. Browser-native visual editing is lightweight, not a full desktop publishing application: complex imported markup and unsupported styles may be simplified, and table structure can be edited in Source mode. The new editor's browser interactions require live testing after deployment.
