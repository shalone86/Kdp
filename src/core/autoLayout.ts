// Automatic book building: sort photos, decide how many go on each page, and pick the grid whose
// frame shapes best fit the photos' shapes (portrait photos into tall frames, landscapes into wide ones).

import { pageGeometry } from './geometry';
import { pageLimits } from './kdp';
import { getLayout, LAYOUTS, type LayoutTemplate } from './layouts';
import type { BookSpec, Page, Photo, Rect, SlotContent, Theme } from './types';
import { uid } from './uid';

export type Density = 'airy' | 'balanced' | 'packed';
export type LayoutStyle = 'clean' | 'mixed' | 'bleed';

export interface AutoLayoutOptions {
  density: Density;
  style: LayoutStyle;
  sortByDate: boolean;
  /** Insert a heading page whenever there's a gap of this many days between photos. 0 = off. */
  chapterGapDays: number;
  titlePage: boolean;
  title?: string;
  subtitle?: string;
}

export const DEFAULT_AUTO_OPTIONS: AutoLayoutOptions = {
  density: 'balanced',
  style: 'mixed',
  sortByDate: true,
  chapterGapDays: 0,
  titlePage: true,
};

const AVG_PER_PAGE: Record<Density, number> = { airy: 1.6, balanced: 2.8, packed: 4.8 };
const MAX_PER_PAGE: Record<Density, number> = { airy: 3, balanced: 5, packed: 9 };
/** Rhythm so consecutive pages don't all look the same. */
const RHYTHM = [1, 1.35, 0.6, 1.15, 0.85, 1.3, 0.75];

export function emptySlot(photoId: string | null = null): SlotContent {
  return { photoId, zoom: 1, focusX: 0.5, focusY: 0.5 };
}

export function sortPhotos(photos: Photo[], byDate: boolean): Photo[] {
  if (!byDate) return [...photos];
  return photos
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const ta = a.p.takenAt ?? Number.POSITIVE_INFINITY;
      const tb = b.p.takenAt ?? Number.POSITIVE_INFINITY;
      return ta === tb ? a.i - b.i : ta - tb;
    })
    .map((x) => x.p);
}

/** Split photos into sections wherever there's a long gap in capture time. */
export function splitChapters(photos: Photo[], gapDays: number): Photo[][] {
  if (gapDays <= 0 || photos.length === 0) return [photos];
  const out: Photo[][] = [[photos[0]]];
  for (let i = 1; i < photos.length; i++) {
    const prev = photos[i - 1].takenAt;
    const cur = photos[i].takenAt;
    if (prev != null && cur != null && cur - prev > gapDays * 86_400_000) out.push([]);
    out[out.length - 1].push(photos[i]);
  }
  return out;
}

export function chapterLabel(photos: Photo[]): string {
  const times = photos.map((p) => p.takenAt).filter((t): t is number => t != null);
  if (!times.length) return 'Chapter';
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const a = fmt(Math.min(...times));
  const b = fmt(Math.max(...times));
  return a === b ? a : `${a} – ${b}`;
}

const allowedCounts = (max: number) => [...new Set(LAYOUTS.map((l) => l.frames.length))].filter((n) => n > 0 && n <= max).sort((a, b) => a - b);

/**
 * Distribute `n` photos over exactly `pages` pages, with a gentle rhythm and only using counts we have
 * templates for. Requires pages <= n <= pages * max.
 */
export function distribute(n: number, pages: number, max: number): number[] {
  const counts = allowedCounts(max);
  const out: number[] = [];
  let remaining = n;
  for (let i = 0; i < pages; i++) {
    const left = pages - i - 1;
    const ideal = (remaining / (left + 1)) * RHYTHM[i % RHYTHM.length];
    const feasible = counts.filter((c) => c <= remaining && canFill(remaining - c, left, counts));
    if (!feasible.length) break;
    const pick = feasible.reduce((best, c) => (Math.abs(c - ideal) < Math.abs(best - ideal) ? c : best));
    out.push(pick);
    remaining -= pick;
  }
  return out;
}

/** Can `n` photos be split over exactly `pages` pages using the given per-page counts? */
function canFill(n: number, pages: number, counts: number[]): boolean {
  if (pages === 0) return n === 0;
  // Counts are 1..k contiguous plus possibly one bigger outlier (e.g. 9): try each number of outliers.
  let contiguous = 1;
  while (counts.includes(contiguous + 1)) contiguous++;
  const big = counts.filter((c) => c > contiguous);
  if (!big.length) return n >= pages && n <= pages * contiguous;
  const b = big[big.length - 1];
  for (let k = 0; k <= pages; k++) {
    const rest = n - k * b;
    if (rest >= pages - k && rest <= (pages - k) * contiguous) return true;
  }
  return false;
}

export function aspect(p: Pick<Photo, 'width' | 'height'>) {
  return p.width / p.height;
}

/** Best pairing of photos to frames (by sorting both by aspect ratio) and its mismatch cost. */
export function matchPhotosToFrames(photos: Photo[], frameAspects: number[]): { order: number[]; cost: number } {
  const fi = frameAspects.map((a, i) => ({ a, i })).sort((x, y) => x.a - y.a);
  const pi = photos.map((p, i) => ({ a: aspect(p), i })).sort((x, y) => x.a - y.a);
  const order = new Array<number>(frameAspects.length);
  let cost = 0;
  fi.forEach((f, k) => {
    order[f.i] = pi[k].i;
    cost += Math.abs(Math.log(f.a / pi[k].a));
  });
  return { order, cost };
}

function templateAllowed(t: LayoutTemplate, style: LayoutStyle, photos: Photo[]): boolean {
  if (t.id === 'title-photo' || t.id === 'empty') return false;
  if (t.region === 'bleed') {
    if (style === 'clean') return false;
    if (style === 'mixed' && t.frames.length > 1) return false;
  }
  if (t.id === '9-grid' && photos.length !== 9) return false;
  return true;
}

export interface Areas {
  live: Rect;
  bleed: Rect;
}

export function frameAspects(t: LayoutTemplate, areas: Areas): number[] {
  const region = t.region === 'bleed' ? areas.bleed : areas.live;
  return t.frames.map((f) => (f.w * region.w) / (f.h * region.h));
}

/** Choose the grid for these photos. Returns the template and photo order per frame. */
/**
 * Choose the grid for these photos. `recent` holds the layouts of the last few pages (most recent last);
 * reusing them is penalised so the book doesn't repeat the same grid page after page.
 */
export function chooseLayout(photos: Photo[], areas: Areas, style: LayoutStyle, recent: string[] = [], avoidId?: string) {
  const candidates = LAYOUTS.filter((t) => t.frames.length === photos.length && templateAllowed(t, style, photos));
  let best: { t: LayoutTemplate; order: number[]; score: number } | null = null;
  for (const t of candidates) {
    const { order, cost } = matchPhotosToFrames(photos, frameAspects(t, areas));
    let score = cost;
    score += recent.reduce((pen, id, k) => (id === t.id ? pen + 0.25 + 0.15 * (k / Math.max(1, recent.length - 1)) : pen), 0);
    if (t.id === avoidId) score += 100;
    if (t.region === 'bleed' && style === 'mixed') {
      // In mixed style, only give strong landscape-friendly or large photos the full-page treatment.
      score += photos[0].width * photos[0].height > 6e6 ? 0.05 : 0.6;
    }
    if (t.region === 'bleed' && style === 'bleed') score -= 0.2;
    if (!best || score < best.score) best = { t, order, score };
  }
  if (!best) {
    const t = getLayout('single');
    return { template: t, order: photos.map((_, i) => i) };
  }
  return { template: best.t, order: best.order };
}

export function buildPhotoPage(photos: Photo[], areas: Areas, style: LayoutStyle, recent: string[] = []): Page {
  const { template, order } = chooseLayout(photos, areas, style, recent);
  return {
    id: uid(),
    kind: 'photos',
    layoutId: template.id,
    slots: order.map((i) => emptySlot(photos[i].id)),
  };
}

export function titlePage(title: string, subtitle: string, photo?: Photo): Page {
  return {
    id: uid(),
    kind: 'title',
    layoutId: photo ? 'title-photo' : 'empty',
    slots: photo ? [emptySlot(photo.id)] : [],
    heading: title,
    body: subtitle,
  };
}

export function blankPage(): Page {
  return { id: uid(), kind: 'blank', layoutId: 'empty', slots: [] };
}

export function textPage(heading: string, body = ''): Page {
  return { id: uid(), kind: 'text', layoutId: 'empty', slots: [], heading, body };
}

export interface AutoLayoutResult {
  pages: Page[];
  /** Blank pages that had to be added to reach KDP's minimum page count. */
  paddedPages: number;
}

/** Build a complete book from photos. */
export function autoLayout(photos: Photo[], spec: BookSpec, theme: Theme, opts: AutoLayoutOptions): AutoLayoutResult {
  const sorted = sortPhotos(photos, opts.sortByDate);
  const limits = pageLimits(spec);
  const chapters = splitChapters(sorted, opts.chapterGapDays);
  const useChapters = chapters.length > 1;

  const front: Page[] = [];
  if (opts.titlePage) {
    front.push(titlePage(opts.title ?? 'My Photo Book', opts.subtitle ?? ''));
    front.push(blankPage()); // back of the title page
  }
  const chapterPages = useChapters ? chapters.length : 0;
  const fixed = front.length + chapterPages;

  // How many photo pages? Enough for the chosen density, but at least enough to reach KDP's minimum.
  const n = sorted.length;
  const max = MAX_PER_PAGE[opts.density];
  let photoPages = Math.ceil(n / AVG_PER_PAGE[opts.density]);
  photoPages = Math.max(photoPages, Math.ceil(n / max), Math.min(n, limits.min - fixed));
  photoPages = Math.min(photoPages, n, limits.max - fixed);

  // Estimate geometry with the final page count (it affects the gutter).
  const estPages = fixed + photoPages;
  const g = pageGeometry(spec, theme, 0, estPages);
  const areas: Areas = { live: g.live, bleed: { x: 0, y: 0, w: g.width, h: g.height } };

  const pages: Page[] = [...front];
  const recent: string[] = [];
  for (const chapter of chapters) {
    if (!chapter.length) continue;
    if (useChapters) pages.push(textPage(chapterLabel(chapter)));
    const share = Math.max(1, Math.round((photoPages * chapter.length) / Math.max(1, n)));
    const chapterPageCount = Math.min(chapter.length, Math.max(share, Math.ceil(chapter.length / max)));
    const counts = distribute(chapter.length, chapterPageCount, max);
    let i = 0;
    for (const c of counts) {
      const page = buildPhotoPage(chapter.slice(i, i + c), areas, opts.style, recent);
      recent.push(page.layoutId);
      if (recent.length > 5) recent.shift();
      pages.push(page);
      i += c;
    }
  }

  let paddedPages = 0;
  while (pages.length < limits.min) {
    pages.push(blankPage());
    paddedPages++;
  }
  if (pages.length % 2 === 1) pages.push(blankPage());
  return { pages, paddedPages };
}

/** Re-pick the grid for one page (e.g. after adding/removing a photo, or "shuffle"). */
export function relayoutPage(page: Page, photosById: Map<string, Photo>, areas: Areas, style: LayoutStyle, shuffle = false): Page {
  const photos = page.slots.map((s) => (s.photoId ? photosById.get(s.photoId) : undefined)).filter((p): p is Photo => !!p);
  if (!photos.length) return { ...page, layoutId: page.kind === 'photos' ? 'empty' : page.layoutId, slots: [] };
  const { template, order } = chooseLayout(photos, areas, style, [], shuffle ? page.layoutId : undefined);
  const old = new Map(page.slots.filter((s) => s.photoId).map((s) => [s.photoId!, s]));
  return {
    ...page,
    layoutId: template.id,
    slots: order.map((i) => {
      const prev = old.get(photos[i].id);
      return prev ? { ...prev } : emptySlot(photos[i].id);
    }),
  };
}
