# Photobook Studio

Make print-ready **Amazon KDP photo books** without knowing anything about KDP. It's like Kindle Create, but built for photos.

1. Pick what you're making (photo album, travel book, yearbook…) and a size, which can be any KDP trim size or a custom one.
2. Add photos: drag & drop, **Google Photos**, **Immich**, or an **iCloud shared album**. iPhone HEIC files are converted automatically.
3. Click **Create my book automatically**. Photos are sorted by date and laid out in grids that match their shapes. A cover is designed from your best photo, using KDP's cover formula (spine width from page count and paper).
4. Tweak anything: drag photos between frames, drag to re-crop, scroll to zoom, change grids, add captions and chapter pages, reorder pages.
5. **Check & export**: plain-English preflight (page count, low-resolution photos, empty frames), a price/royalty estimate, two PDFs (interior and cover), and step-by-step KDP upload instructions.

Everything runs in the browser. Photos are stored in the browser's IndexedDB and never uploaded anywhere. A small Node server only proxies the photo services that browsers can't call directly.

## Quick start

```bash
npm install
cp .env.example .env      # optional: Google client ID, Immich defaults
npm run dev               # web app on http://localhost:5173, API on :8787
```

Production:

```bash
npm run build
npm start                 # serves the built app and the API on $PORT (default 8787)
```

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run smoke` (end-to-end: builds a book in a real browser and exports both PDFs; needs the app running and Chromium; set `CHROMIUM_PATH` if needed).

## Photo sources

| Source | How it works | Setup |
| --- | --- | --- |
| Your computer | Drag & drop anywhere, or **＋ Add**. On iPhone Safari, **＋ Add → Photo Library**. On a Mac, drag photos straight out of the Photos app. | None |
| **Immich** | REST API with an API key, proxied by the server (Immich doesn't send CORS headers). Browse albums, favourites or recent photos, then import originals. | In Immich: *Account Settings → API Keys*. Set `IMMICH_ALLOWED_HOSTS` if you host this app for other people. |
| **Google Photos** | [Photos Picker API](https://developers.google.com/photos/picker). Google opens its own picker and we get only the photos the user picks. Since March 2025 the old Library API can't read a user's existing photos, so this is the only option. | Google Cloud project with the *Photos Picker API* enabled, plus an OAuth **Web** client ID with your origin authorised. Put it in `.env` as `GOOGLE_CLIENT_ID`. |
| **iCloud** | Apple has no public iCloud Photos API. We read **shared albums with "Public Website" turned on**, using the same endpoints icloud.com's web viewer uses. These are unofficial and can change. Shared albums cap photos at about 2048 px. | None |

## KDP rules built in

All KDP numbers live in [`src/core/kdp.ts`](src/core/kdp.ts) and [`src/core/pricing.ts`](src/core/pricing.ts), with links to the KDP help pages they came from:

- Trim sizes for paperback (16 standard sizes, plus custom 4–8.5″ × 6–11.69″) and hardcover (5 sizes).
- Bleed of 0.125″ on the outside, top and bottom edges. Interior pages are trim + 0.125″ wide and trim + 0.25″ tall. Margins mirror on left/right pages, and the gutter grows with page count (0.375″ up to 0.875″).
- Page limits for each ink and paper (24–828 premium colour, 72–600 standard colour, 75–550 hardcover). Books are padded to an even page count.
- Cover = bleed + back + spine + front + bleed. Spine = pages × paper thickness (0.002252″ white, 0.0025″ cream, 0.002347″ premium colour). Spine text is only allowed from 79 pages. The barcode area is kept clear on the back cover.
- Hardcover covers use a 0.51″ wrap and a 0.4″ hinge. The hardcover spine is an **approximation**, and the app says so.
- All fonts are embedded (bundled OFL fonts: Playfair Display, Lora, Inter, Caveat). Photos are cropped and resampled to at most 300 DPI, and anything under 150 DPI is flagged.
- Amazon.com printing cost and royalty estimates (50% below $9.99, 60% from $9.99).

## How it's built

```
src/core/     pure TypeScript: KDP specs, geometry, layout templates, auto-layout, cover design,
              preflight, pricing, and the "display list" that describes every page
src/render/   PDF export (pdf-lib + fontkit), fonts, text measuring
src/state/    zustand store (undo/redo, autosave to IndexedDB) and the photo blob store
src/ui/       React editor
src/sources/  Immich / Google Photos / iCloud clients
server/       Express proxy for Immich, Google Photos media and iCloud shared albums
tests/        vitest unit tests
```

The on-screen editor and the PDF exporter both draw from the same **display list** (`src/core/displayList.ts`), so what you see is what gets printed. Text wrapping uses the same algorithm and the same font files in both.

See [docs/PRODUCT.md](docs/PRODUCT.md) for the feature roadmap and product notes.
