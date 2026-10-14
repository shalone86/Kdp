# Photobook Studio: product notes & feature workshop

## Who it's for

People with a folder (or phone) full of photos who want a real printed book and have **never heard of trim size, bleed or spine width**. Typical books:

- a family yearbook, a baby's first year, a wedding, a trip, a pet;
- a photographer's portfolio or a small coffee-table book to sell on Amazon;
- a kids' picture book made from family photos.

Kindle Create handles text well but gives photos very little control: no grids, no automatic layout, no cover builder that understands photos. KDP's own Cover Creator is limited, and many people end up in Canva fighting with templates they had to work out the dimensions for.

**Principle:** every KDP rule is enforced or explained by the app. The user should never need to read KDP help pages.

## What's in v0.1 (this repo)

| Area | Feature |
| --- | --- |
| Setup | 3-step wizard with book-type presets (album, travel, yearbook, portfolio, kids, pocket); every KDP trim size plus a validated custom size; paperback/hardcover; ink & paper with plain-English hints; inch/mm units |
| Photos | Drag & drop anywhere; HEIC → JPEG; EXIF date & orientation; Immich (albums, favourites, recent); Google Photos Picker; iCloud shared albums; library with used/unused filter and multi-select; low-res badges |
| Auto layout | Sort by date; density (spacious / balanced / packed); style (clean / mixed / bold full-bleed); matches photo shape to frame shape; avoids repeating grids; chapter pages on date gaps; title page; pads to KDP minimum and even page count |
| Editing | 20 grid templates (1–9 photos, bordered and full-bleed); drag photos between frames (swap); drop photo on a page thumbnail to add it (grid re-picks itself); drag to pan, scroll to zoom; "try another layout"; captions; title/text/chapter pages; page backgrounds; reorder/duplicate/delete pages; undo/redo; autosave |
| Cover | 5 templates (photo front, wraparound, photo + band, framed, collage); auto-design picks the best photo and derives colours from it; title/subtitle/author/back text; spine text only when allowed (79+ pages); barcode area; live KDP cover-calculator readout |
| Output | Preflight (errors / warnings / info, each with "Show"); interior PDF with bleed & trim boxes; cover PDF; fonts embedded; photos at ≤300 DPI; printing cost, minimum price and royalty estimate; KDP upload walkthrough with this book's exact settings; full-screen read-through preview |

## Roadmap

### Next (high value, moderate effort)

1. **Smart crop / face-aware focus.** Run a small face/saliency model in the browser (e.g. MediaPipe) so auto-crop never cuts off heads. Store it as `focusX/focusY`.
2. **Best-shot picking & de-duplication.** Detect near-duplicate bursts (perceptual hash) and blurry shots. Offer "use the best 80 of these 400 photos".
3. **Spread layouts.** One photo across both pages of a spread, with a gutter-safety warning when faces fall in the fold.
4. **Text tools.** Free text boxes, quotes, dates and places on photo pages. Captions auto-filled from EXIF date or location ("June 2024 · Lisbon").
5. **More themes.** Background textures, frames/mats, rounded corners, a polaroid look, a scrapbook style with the Caveat font. Theme packs for weddings, babies and travel.
6. **Project backup.** Export/import a `.photobook` zip (project JSON + originals) so a book can move between computers. Cloud sync after that.
7. **Ebook (Kindle) export.** Fixed-layout KPF/EPUB for photo books ("Kindle Kids' Book Creator"-style), reusing the display list.
8. **Proof mode.** Soft-proof colours (a slightly darker, less saturated preview that mimics premium colour on paper) and a "print a test page at home" PDF.

### Later

- **Real 3D book mockup** for marketing images (Amazon A+ content, social posts).
- **Map pages** from GPS EXIF (route of a trip).
- **Collaborative books.** Family members add photos through a share link (the server would store photos).
- **Other printers.** Lulu, IngramSpark, Blurb and Mixbook presets. The geometry engine already supports any size; only the specs differ.
- **AI helpers.** Write the back-cover blurb, suggest chapter titles, write captions from photos, suggest a title. (An LLM call would need the user's consent to send images.)
- **Amazon listing helper.** Description, keywords, categories, and a checklist for the KDP Details page.
- **Barcode/ISBN support** for people who bring their own ISBN.
- **Hardcover spine accuracy.** Replace the approximation with KDP's board table, or call KDP's template generator.

### Ideas worth testing with users

- A **"one-click book"** landing page: drop photos → book preview in 10 seconds → "Looks good? Download files".
- A **"make it cheaper" slider** that trades photos-per-page against printing cost, showing the KDP price live.
- **Templates by occasion** with placeholder text that teaches ("Write who was there…").
- A **checklist mode** that walks people through KDP account setup, tax interview, ISBN, proof copy and publishing.

## Known limitations

- **iCloud:** private libraries can't be read (Apple has no API). Shared albums are limited to about 2048 px, which is fine for small photos and soft for full-page prints. The endpoints are unofficial.
- **Google Photos:** needs an OAuth client ID. While the Google app is unverified, only test users can sign in, and verification takes a few weeks.
- **Hardcover spine width** is approximate.
- **Pricing** covers Amazon.com paperbacks only.
- **Colour:** PDFs are RGB, which KDP accepts and converts. There is no CMYK soft proofing yet.
- **Storage:** very large projects (thousands of 20 MB photos) depend on the browser's IndexedDB quota. Chrome allows a large share of free disk space; Safari is stricter.

## Security notes

- The Immich proxy forwards to whatever server URL the user enters. That's fine on your own machine, but set `IMMICH_ALLOWED_HOSTS` before hosting the app publicly so it can't be used to reach internal hosts.
- The Google and iCloud download proxies only allow `*.googleusercontent.com` and `*.icloud-content.com` over HTTPS.
- API keys and tokens are never stored on the server. The Immich key is kept in the user's browser (localStorage).
