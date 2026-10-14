// Page geometry: where the trim, bleed, margins and live area sit on each PDF page.
// Coordinates are inches from the top-left corner of the PDF page (which includes bleed).

import { BLEED, insideMargin, outsideMargin } from './kdp';
import type { BookSpec, Photo, Rect, SlotContent, Theme } from './types';

export interface PageGeometry {
  /** PDF page size. */
  width: number;
  height: number;
  trim: Rect;
  /** Area inside the margins — text and framed photos stay in here. */
  live: Rect;
  /** True for right-hand pages (page 1, 3, 5…). The binding is on their left. */
  recto: boolean;
  margins: { inside: number; outside: number; top: number; bottom: number };
}

/** pageIndex is 0-based; page index 0 is page 1, a right-hand page. */
export function pageGeometry(spec: BookSpec, theme: Pick<Theme, 'margin'>, pageIndex: number, pageCount: number): PageGeometry {
  const recto = pageIndex % 2 === 0;
  const b = spec.bleed ? BLEED : 0;
  const width = spec.trimWidth + b;
  const height = spec.trimHeight + 2 * b;
  const trim: Rect = { x: recto ? 0 : b, y: b, w: spec.trimWidth, h: spec.trimHeight };
  // KDP's outside minimum with bleed (0.375") is measured from the bleed edge, i.e. 0.25" from trim.
  const kdpOutside = outsideMargin(spec.bleed) - b;
  const outside = Math.max(theme.margin, kdpOutside);
  const inside = Math.max(theme.margin, insideMargin(pageCount));
  const margins = { inside, outside, top: outside, bottom: outside };
  const left = recto ? inside : outside;
  const right = recto ? outside : inside;
  const live: Rect = {
    x: trim.x + left,
    y: trim.y + margins.top,
    w: trim.w - left - right,
    h: trim.h - margins.top - margins.bottom,
  };
  return { width, height, trim, live, recto, margins };
}

/** The full page including bleed. */
export function bleedRect(g: PageGeometry): Rect {
  return { x: 0, y: 0, w: g.width, h: g.height };
}

/**
 * Where the photo sits relative to its frame so that it covers the frame (like CSS object-fit: cover),
 * then zooms and pans per the slot settings. Returns inches relative to the frame's top-left,
 * plus the effective print resolution.
 */
export function placeImage(frame: { w: number; h: number }, photo: Pick<Photo, 'width' | 'height'>, slot: Pick<SlotContent, 'zoom' | 'focusX' | 'focusY'>) {
  const zoom = Math.max(1, slot.zoom || 1);
  const scale = Math.max(frame.w / photo.width, frame.h / photo.height) * zoom; // inches per pixel
  const w = photo.width * scale;
  const h = photo.height * scale;
  const fx = clamp01(slot.focusX ?? 0.5);
  const fy = clamp01(slot.focusY ?? 0.5);
  const x = -(w - frame.w) * fx;
  const y = -(h - frame.h) * fy;
  return { x, y, w, h, dpi: 1 / scale };
}

/** Source rectangle (in photo pixels) that is visible inside the frame. */
export function visibleSourceRect(frame: { w: number; h: number }, photo: Pick<Photo, 'width' | 'height'>, slot: Pick<SlotContent, 'zoom' | 'focusX' | 'focusY'>): Rect {
  const p = placeImage(frame, photo, slot);
  const s = p.w / photo.width;
  return { x: -p.x / s, y: -p.y / s, w: frame.w / s, h: frame.h / s };
}

export function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export const DPI_GOOD = 250;
export const DPI_MIN = 150;

export type DpiQuality = 'good' | 'ok' | 'low';
export function dpiQuality(dpi: number): DpiQuality {
  if (dpi >= DPI_GOOD) return 'good';
  if (dpi >= DPI_MIN) return 'ok';
  return 'low';
}
