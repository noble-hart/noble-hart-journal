# Version 19 — Smart Publishing Assistant

No database migration or new credentials required.

## SEO
New empty SEO title/description, excerpt and slug fields receive local suggestions based on title and article text. Existing nonempty fields are preserved unless you explicitly regenerate SEO. Auto-generated values are editable; manually changed fields are protected in the current editor session. The SEO preview is illustrative, not a guarantee of Google's displayed snippet. Existing article slugs are never regenerated automatically. Suggestions are deterministic, not an AI service, and should be reviewed for readability and relevance.

## Import
Use Import an article or document. HTML and TXT: up to 2 MB. Word DOCX and PDF: up to 15 MB; PDF limited to 100 pages. Imports replace the article body after confirmation, keep nonempty title and other settings, and open the visual editor. Word imports preserve supported text formatting and tables but omit embedded images. PDF imports extract selectable text; scanned PDFs need OCR first. Complex layouts, PDF headings and tables need manual review. The importer uses Mammoth and PDF.js, loaded on demand from a pinned CDN version. No document is uploaded to a conversion service. The original file is not stored; only the sanitized article content is saved. Old .doc files must be converted to .docx.

## Test
Create a draft and type a title and content. Check suggestions, edit SEO manually, and ensure further typing doesn't replace the manual values. Test HTML, DOCX, TXT and text-based PDF imports. Review formatting, save a draft, reopen, and verify the saved fields. Confirm the public page, existing article editor, comments and search still work. The PDF/Word browser integration has not been runtime-tested and should be verified after deployment.
