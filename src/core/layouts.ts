// Photo grid templates. Frames are fractions of their region:
//  - 'live'  : the area inside the page margins (photos get a white border)
//  - 'bleed' : the whole page including bleed (photos run off the edge)

import type { Rect } from './types';

export type Region = 'live' | 'bleed';

export interface LayoutTemplate {
  id: string;
  name: string;
  region: Region;
  frames: Rect[];
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

function grid(cols: number, rows: number): Rect[] {
  const out: Rect[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) out.push(r(i / cols, j / rows, 1 / cols, 1 / rows));
  return out;
}

export const LAYOUTS: LayoutTemplate[] = [
  // 0 photos — text or blank pages
  { id: 'empty', name: 'Blank', region: 'live', frames: [] },

  // 1 photo
  { id: 'full-bleed', name: 'Full page', region: 'bleed', frames: [r(0, 0, 1, 1)] },
  { id: 'single', name: 'Single with border', region: 'live', frames: [r(0, 0, 1, 1)] },
  { id: 'single-gallery', name: 'Gallery', region: 'live', frames: [r(0.08, 0.1, 0.84, 0.66)] },
  { id: 'title-photo', name: 'Title photo', region: 'live', frames: [r(0, 0, 1, 0.62)] },

  // 2 photos
  { id: '2-stack', name: 'Two stacked', region: 'live', frames: [r(0, 0, 1, 0.5), r(0, 0.5, 1, 0.5)] },
  { id: '2-side', name: 'Side by side', region: 'live', frames: [r(0, 0, 0.5, 1), r(0.5, 0, 0.5, 1)] },
  { id: '2-big-small', name: 'Big + small', region: 'live', frames: [r(0, 0, 1, 0.64), r(0.25, 0.64, 0.5, 0.36)] },
  { id: '2-bleed-stack', name: 'Two full-width', region: 'bleed', frames: [r(0, 0, 1, 0.5), r(0, 0.5, 1, 0.5)] },

  // 3 photos
  { id: '3-top-big', name: 'Hero + two', region: 'live', frames: [r(0, 0, 1, 0.6), r(0, 0.6, 0.5, 0.4), r(0.5, 0.6, 0.5, 0.4)] },
  { id: '3-left-big', name: 'Tall hero + two', region: 'live', frames: [r(0, 0, 0.6, 1), r(0.6, 0, 0.4, 0.5), r(0.6, 0.5, 0.4, 0.5)] },
  { id: '3-rows', name: 'Three rows', region: 'live', frames: grid(1, 3) },
  { id: '3-cols', name: 'Three columns', region: 'live', frames: grid(3, 1) },

  // 4 photos
  { id: '4-grid', name: 'Four grid', region: 'live', frames: grid(2, 2) },
  { id: '4-top-big', name: 'Hero + three', region: 'live', frames: [r(0, 0, 1, 0.58), r(0, 0.58, 1 / 3, 0.42), r(1 / 3, 0.58, 1 / 3, 0.42), r(2 / 3, 0.58, 1 / 3, 0.42)] },
  { id: '4-left-big', name: 'Tall hero + three', region: 'live', frames: [r(0, 0, 0.62, 1), r(0.62, 0, 0.38, 1 / 3), r(0.62, 1 / 3, 0.38, 1 / 3), r(0.62, 2 / 3, 0.38, 1 / 3)] },

  // 5 photos
  { id: '5-mosaic', name: 'Mosaic', region: 'live', frames: [r(0, 0, 0.6, 0.5), r(0.6, 0, 0.4, 0.5), r(0, 0.5, 1 / 3, 0.5), r(1 / 3, 0.5, 1 / 3, 0.5), r(2 / 3, 0.5, 1 / 3, 0.5)] },
  { id: '5-left-big', name: 'Hero + four', region: 'live', frames: [r(0, 0, 0.5, 1), r(0.5, 0, 0.25, 0.5), r(0.75, 0, 0.25, 0.5), r(0.5, 0.5, 0.25, 0.5), r(0.75, 0.5, 0.25, 0.5)] },

  // 6 photos
  { id: '6-grid-2x3', name: 'Six (2 × 3)', region: 'live', frames: grid(2, 3) },
  { id: '6-grid-3x2', name: 'Six (3 × 2)', region: 'live', frames: grid(3, 2) },

  // 9 photos
  { id: '9-grid', name: 'Contact sheet', region: 'live', frames: grid(3, 3) },
];

const byId = new Map(LAYOUTS.map((l) => [l.id, l]));

export function getLayout(id: string): LayoutTemplate {
  return byId.get(id) ?? byId.get('empty')!;
}

export function layoutsForCount(count: number): LayoutTemplate[] {
  return LAYOUTS.filter((l) => l.frames.length === count && l.id !== 'title-photo');
}

export const PHOTO_COUNTS = [...new Set(LAYOUTS.map((l) => l.frames.length))].filter((n) => n > 0).sort((a, b) => a - b);

/**
 * Turn fractional frames into inches on the page, leaving `gap` between neighbouring photos.
 * Edges that touch the region boundary are not inset, so outer photos line up with the margins.
 */
export function framesToRects(frames: Rect[], region: Rect, gap: number): Rect[] {
  const eps = 1e-6;
  return frames.map((f) => {
    const l = f.x > eps ? gap / 2 : 0;
    const t = f.y > eps ? gap / 2 : 0;
    const rr = f.x + f.w < 1 - eps ? gap / 2 : 0;
    const b = f.y + f.h < 1 - eps ? gap / 2 : 0;
    return {
      x: region.x + f.x * region.w + l,
      y: region.y + f.y * region.h + t,
      w: f.w * region.w - l - rr,
      h: f.h * region.h - t - b,
    };
  });
}
