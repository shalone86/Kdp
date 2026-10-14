// A "display list" describes everything drawn on a page or cover in inches. The on-screen editor and
// the PDF exporter both draw from the same list, so what you see is what gets printed.

import { coverLayout, printedPageCount, type CoverLayout } from './kdp';
import { pageGeometry, type PageGeometry } from './geometry';
import { framesToRects, getLayout } from './layouts';
import type { FontStyle } from './text';
import type { CoverDesign, FontId, Page, Project, Rect, SlotContent } from './types';

export type SlotRef = { target: 'page'; pageId: string; slot: number } | { target: 'cover'; slot: number } | { target: 'cover-back' };

export type DLItem =
  | { kind: 'rect'; rect: Rect; color: string; opacity?: number }
  | { kind: 'image'; rect: Rect; slot: SlotContent; ref: SlotRef }
  | {
      kind: 'text';
      rect: Rect;
      text: string;
      font: FontId;
      style: FontStyle;
      size: number;
      color: string;
      align: 'left' | 'center' | 'right';
      valign: 'top' | 'middle' | 'bottom';
      /** 90 = rotated clockwise (reads top to bottom, as on US book spines). */
      rotate?: 90;
      maxLines?: number;
      role?: string;
    };

export interface Guide {
  rect: Rect;
  kind: 'trim' | 'safe' | 'spine' | 'barcode' | 'fold';
  label?: string;
}

export interface DisplayList {
  width: number;
  height: number;
  items: DLItem[];
  guides: Guide[];
}

const CAPTION_BAND = 0.42;

function inset(r: Rect, dx: number, dy = dx): Rect {
  return { x: r.x + dx, y: r.y + dy, w: r.w - 2 * dx, h: r.h - 2 * dy };
}

export function pageDisplayList(project: Project, pageIndex: number): DisplayList {
  const { spec, theme } = project;
  const pageCount = project.pages.length;
  const page = project.pages[pageIndex];
  const g = pageGeometry(spec, theme, pageIndex, pageCount);
  return buildPage(page, g, project, pageIndex);
}

function buildPage(page: Page, g: PageGeometry, project: Project, pageIndex: number): DisplayList {
  const { theme } = project;
  const items: DLItem[] = [];
  const full: Rect = { x: 0, y: 0, w: g.width, h: g.height };
  items.push({ kind: 'rect', rect: full, color: page.background ?? theme.pageBackground });

  const layout = getLayout(page.layoutId);
  const live = g.live;
  const hasCaption = !!page.caption?.trim();

  if (page.kind === 'title') {
    const photoArea: Rect = { ...live, h: live.h * 0.62 };
    if (layout.frames.length) {
      framesToRects(layout.frames, live, 0).forEach((rect, i) => pushImage(items, rect, page, i));
    }
    const textTop = layout.frames.length ? photoArea.y + photoArea.h + 0.3 : live.y + live.h * 0.3;
    const headingBox: Rect = { x: live.x, y: textTop, w: live.w, h: Math.min(1.4, live.h * 0.2) };
    items.push(textItem(page.heading || 'Untitled', headingBox, theme.headingFont, 'regular', 34, theme.textColor, 'center', 'bottom', { maxLines: 3, role: 'heading' }));
    if (page.body?.trim()) {
      const subBox: Rect = { x: live.x, y: headingBox.y + headingBox.h + 0.12, w: live.w, h: 0.9 };
      items.push(textItem(page.body, subBox, theme.bodyFont, 'italic', 14, theme.textColor, 'center', 'top', { role: 'body' }));
    }
  } else if (page.kind === 'text') {
    const headingBox: Rect = { x: live.x, y: live.y + live.h * 0.32, w: live.w, h: 1.1 };
    items.push(textItem(page.heading || '', headingBox, theme.headingFont, 'regular', 26, theme.textColor, 'center', 'bottom', { role: 'heading' }));
    if (page.body?.trim()) {
      const bodyBox: Rect = { x: live.x + live.w * 0.08, y: headingBox.y + headingBox.h + 0.25, w: live.w * 0.84, h: live.y + live.h - headingBox.y - headingBox.h - 0.25 };
      items.push(textItem(page.body, bodyBox, theme.bodyFont, 'regular', 12, theme.textColor, 'center', 'top', { role: 'body' }));
    }
  } else if (page.kind === 'photos') {
    let region: Rect = layout.region === 'bleed' ? full : live;
    if (hasCaption && layout.region === 'live') region = { ...region, h: region.h - CAPTION_BAND };
    framesToRects(layout.frames, region, theme.gap).forEach((rect, i) =>
      pushImage(items, rect, page, i),
    );
    if (hasCaption) {
      const band: Rect = { x: live.x, y: live.y + live.h - CAPTION_BAND + 0.08, w: live.w, h: CAPTION_BAND - 0.08 };
      if (layout.region === 'bleed') {
        items.push({ kind: 'rect', rect: inset(band, -0.08, 0), color: '#000000', opacity: 0.45 });
        items.push(textItem(page.caption!, inset(band, 0.04, 0.02), theme.bodyFont, 'italic', 10.5, '#ffffff', 'center', 'middle', { maxLines: 2, role: 'caption' }));
      } else {
        items.push(textItem(page.caption!, band, theme.bodyFont, 'italic', 10.5, theme.textColor, 'center', 'middle', { maxLines: 2, role: 'caption' }));
      }
    }
    if (theme.pageNumbers && layout.region === 'live') {
      const y = g.trim.y + g.trim.h - g.margins.bottom / 2 - 0.1;
      items.push(textItem(String(pageIndex + 1), { x: g.trim.x, y, w: g.trim.w, h: 0.2 }, theme.bodyFont, 'regular', 9, theme.textColor, 'center', 'middle', { role: 'folio' }));
    }
  }

  const guides: Guide[] = [
    { rect: g.trim, kind: 'trim', label: 'Trim' },
    { rect: g.live, kind: 'safe', label: 'Margin' },
  ];
  return { width: g.width, height: g.height, items, guides };
}

function pushImage(items: DLItem[], rect: Rect, page: Page, i: number) {
  const slot = page.slots[i] ?? { photoId: null, zoom: 1, focusX: 0.5, focusY: 0.5 };
  items.push({ kind: 'image', rect, slot, ref: { target: 'page', pageId: page.id, slot: i } });
}

function textItem(
  text: string,
  rect: Rect,
  font: FontId,
  style: FontStyle,
  size: number,
  color: string,
  align: 'left' | 'center' | 'right',
  valign: 'top' | 'middle' | 'bottom',
  extra: { maxLines?: number; role?: string; rotate?: 90 } = {},
): DLItem {
  return { kind: 'text', text, rect, font, style, size, color, align, valign, ...extra };
}

// ---------------------------------------------------------------------------------------------- cover

export const COVER_TEMPLATES: { id: CoverDesign['template']; name: string; photos: number; description: string }[] = [
  { id: 'full-bleed', name: 'Photo front', photos: 1, description: 'One photo fills the front, title on a band.' },
  { id: 'wraparound', name: 'Wraparound', photos: 1, description: 'One wide photo wraps around back, spine and front.' },
  { id: 'band', name: 'Photo + colour band', photos: 1, description: 'Photo on top, solid colour band with the title below.' },
  { id: 'framed', name: 'Framed', photos: 1, description: 'Solid colour cover with a framed photo — classic album look.' },
  { id: 'collage', name: 'Collage', photos: 4, description: 'Four photos on the front with the title across the middle.' },
];

export function coverPhotoCount(t: CoverDesign['template']) {
  return COVER_TEMPLATES.find((c) => c.id === t)?.photos ?? 1;
}

export function coverDisplayList(project: Project): DisplayList {
  const L = coverLayout(project.spec, printedPageCount(project.pages.length));
  return buildCover(project.cover, L);
}

export function buildCover(c: CoverDesign, L: CoverLayout): DisplayList {
  const items: DLItem[] = [];
  const W = L.width;
  const H = L.height;
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const frontBleed: Rect = { x: L.front.x, y: 0, w: W - L.front.x, h: H };
  const s = L.safeInset + L.hinge;
  const frontSafe: Rect = { x: L.front.x + s, y: L.front.y + L.safeInset, w: L.front.w - s - L.safeInset, h: L.front.h - 2 * L.safeInset };
  const backSafe: Rect = { x: L.back.x + L.safeInset, y: L.back.y + L.safeInset, w: L.back.w - s - L.safeInset, h: L.back.h - 2 * L.safeInset };
  const slot = (i: number) => c.slots[i] ?? { photoId: null, zoom: 1, focusX: 0.5, focusY: 0.5 };
  const img = (rect: Rect, i: number) => items.push({ kind: 'image', rect, slot: slot(i), ref: { target: 'cover', slot: i } });

  items.push({ kind: 'rect', rect: full, color: c.background });

  const fh = L.front.h;
  const titleSize = Math.max(22, Math.min(54, L.front.w * 6));
  const titleBlock = (area: Rect, color: string, valign: 'top' | 'middle' | 'bottom' = 'middle') => {
    const hasSub = !!c.subtitle.trim();
    const titleH = area.h * (hasSub ? 0.66 : 1);
    items.push(textItem(c.title || 'Untitled', { ...area, h: titleH }, c.titleFont, 'bold', titleSize, color, 'center', hasSub ? 'bottom' : valign, { maxLines: 3, role: 'title' }));
    if (hasSub) {
      items.push(textItem(c.subtitle, { x: area.x, y: area.y + titleH + 0.05, w: area.w, h: area.h - titleH - 0.05 }, c.bodyFont, 'italic', titleSize * 0.36, color, 'center', 'top', { maxLines: 2, role: 'subtitle' }));
    }
  };
  const author = (area: Rect, color: string) => {
    if (c.author.trim()) items.push(textItem(c.author, area, c.bodyFont, 'regular', Math.max(11, titleSize * 0.34), color, 'center', 'middle', { maxLines: 1, role: 'author' }));
  };

  switch (c.template) {
    case 'wraparound': {
      img(full, 0);
      const band: Rect = { x: L.front.x, y: L.front.y + fh * 0.07, w: W - L.front.x, h: fh * 0.27 };
      items.push({ kind: 'rect', rect: band, color: c.background, opacity: 0.82 });
      titleBlock({ x: frontSafe.x, y: band.y + 0.12, w: frontSafe.w, h: band.h - 0.24 }, c.textColor);
      const ab: Rect = { x: L.front.x, y: L.front.y + fh * 0.86, w: W - L.front.x, h: fh * 0.09 };
      if (c.author.trim()) items.push({ kind: 'rect', rect: ab, color: c.background, opacity: 0.82 });
      author(inset({ ...ab, x: frontSafe.x, w: frontSafe.w }, 0, 0.05), c.textColor);
      break;
    }
    case 'band': {
      const split = L.front.y + fh * 0.66;
      img({ x: frontBleed.x, y: 0, w: frontBleed.w, h: split }, 0);
      titleBlock({ x: frontSafe.x, y: split + 0.2, w: frontSafe.w, h: (L.front.y + fh - split) * 0.62 }, c.textColor);
      author({ x: frontSafe.x, y: L.front.y + fh - L.safeInset - 0.55, w: frontSafe.w, h: 0.4 }, c.textColor);
      break;
    }
    case 'framed': {
      const fw = frontSafe.w * 0.8;
      const frame: Rect = { x: frontSafe.x + (frontSafe.w - fw) / 2, y: L.front.y + fh * 0.1, w: fw, h: fh * 0.5 };
      items.push({ kind: 'rect', rect: inset(frame, -0.08), color: c.accentColor });
      img(frame, 0);
      titleBlock({ x: frontSafe.x, y: frame.y + frame.h + 0.3, w: frontSafe.w, h: fh * 0.22 }, c.textColor, 'top');
      author({ x: frontSafe.x, y: L.front.y + fh - L.safeInset - 0.6, w: frontSafe.w, h: 0.4 }, c.textColor);
      break;
    }
    case 'collage': {
      const halfW = frontBleed.w / 2;
      const top = L.front.y + fh * 0.36;
      const bottom = L.front.y + fh * 0.64;
      img({ x: frontBleed.x, y: 0, w: halfW - 0.03, h: top - 0.03 }, 0);
      img({ x: frontBleed.x + halfW + 0.03, y: 0, w: halfW - 0.03, h: top - 0.03 }, 1);
      img({ x: frontBleed.x, y: bottom + 0.03, w: halfW - 0.03, h: H - bottom - 0.03 }, 2);
      img({ x: frontBleed.x + halfW + 0.03, y: bottom + 0.03, w: halfW - 0.03, h: H - bottom - 0.03 }, 3);
      titleBlock({ x: frontSafe.x, y: top + 0.15, w: frontSafe.w, h: bottom - top - 0.5 }, c.textColor);
      author({ x: frontSafe.x, y: bottom - 0.4, w: frontSafe.w, h: 0.3 }, c.textColor);
      break;
    }
    case 'full-bleed':
    default: {
      img(frontBleed, 0);
      const band: Rect = { x: L.front.x, y: L.front.y + fh * 0.07, w: frontBleed.w, h: fh * 0.27 };
      items.push({ kind: 'rect', rect: band, color: c.background, opacity: 0.82 });
      titleBlock({ x: frontSafe.x, y: band.y + 0.12, w: frontSafe.w, h: band.h - 0.24 }, c.textColor);
      const ab: Rect = { x: L.front.x, y: L.front.y + fh * 0.86, w: frontBleed.w, h: fh * 0.09 };
      if (c.author.trim()) items.push({ kind: 'rect', rect: ab, color: c.background, opacity: 0.82 });
      author(inset({ ...ab, x: frontSafe.x, w: frontSafe.w }, 0, 0.05), c.textColor);
    }
  }

  // Back cover: optional photo + blurb, keeping clear of the barcode area.
  const wrap = c.template === 'wraparound';
  let blurbTop = backSafe.y + backSafe.h * 0.12;
  if (!wrap && c.backSlot.photoId) {
    const bw = backSafe.w * 0.78;
    const r: Rect = { x: backSafe.x + (backSafe.w - bw) / 2, y: backSafe.y + backSafe.h * 0.08, w: bw, h: backSafe.h * 0.4 };
    items.push({ kind: 'image', rect: r, slot: c.backSlot, ref: { target: 'cover-back' } });
    blurbTop = r.y + r.h + 0.35;
  }
  if (c.backText.trim()) {
    const blurb: Rect = { x: backSafe.x + backSafe.w * 0.08, y: blurbTop, w: backSafe.w * 0.84, h: L.barcode.y - 0.3 - blurbTop };
    if (wrap) items.push({ kind: 'rect', rect: inset(blurb, -0.18), color: c.background, opacity: 0.82 });
    items.push(textItem(c.backText, blurb, c.bodyFont, 'regular', 12, c.textColor, 'center', wrap ? 'middle' : 'top', { role: 'blurb' }));
  }

  // Spine
  if (c.spineText && L.spineTextAllowed) {
    const m = 0.0625;
    const sw = L.spine.w - 2 * m;
    if (!wrap) items.push({ kind: 'rect', rect: { x: L.spine.x, y: 0, w: L.spine.w, h: H }, color: c.background });
    const text = [c.title, c.author].filter((t) => t.trim()).join('   ·   ');
    items.push(
      textItem(text, { x: L.spine.x + m, y: L.front.y + 0.3, w: sw, h: L.front.h - 0.6 }, c.titleFont, 'bold', Math.min(14, sw * 72 * 0.7), c.textColor, 'center', 'middle', {
        rotate: 90,
        maxLines: 1,
        role: 'spine',
      }),
    );
  }

  const guides: Guide[] = [
    { rect: L.back, kind: 'trim', label: 'Back cover' },
    { rect: L.front, kind: 'trim', label: 'Front cover' },
    { rect: { x: L.spine.x, y: L.front.y, w: L.spine.w, h: L.front.h }, kind: 'spine', label: 'Spine' },
    { rect: frontSafe, kind: 'safe' },
    { rect: backSafe, kind: 'safe' },
    { rect: L.barcode, kind: 'barcode', label: 'Barcode (KDP)' },
  ];
  return { width: W, height: H, items, guides };
}
