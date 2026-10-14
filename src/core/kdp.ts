// KDP print specifications. Sources (checked Oct 2026):
//  - Trim sizes & page counts: https://kdp.amazon.com/help/topic/G201834180
//  - Cover formula & spine multipliers: https://kdp.amazon.com/help/topic/G201953020
//  - Hardcover cover: https://kdp.amazon.com/help/topic/GDTKFJPNQCBTMRV6
//  - Margins & bleed: https://kdp.amazon.com/help/topic/G201834190
// KDP changes these occasionally; keep every number in this file so updates happen in one place.

import type { BookFormat, BookSpec, Ink, Paper } from './types';

export const BLEED = 0.125;
export const MM_PER_INCH = 25.4;

export interface TrimSize {
  w: number;
  h: number;
  label: string;
  /** Short hint for people who don't know what a trim size is. */
  hint?: string;
}

export const PAPERBACK_TRIM_SIZES: TrimSize[] = [
  { w: 5, h: 8, label: '5 × 8 in' },
  { w: 5.06, h: 7.81, label: '5.06 × 7.81 in' },
  { w: 5.25, h: 8, label: '5.25 × 8 in' },
  { w: 5.5, h: 8.5, label: '5.5 × 8.5 in' },
  { w: 6, h: 9, label: '6 × 9 in', hint: 'Classic paperback' },
  { w: 6.14, h: 9.21, label: '6.14 × 9.21 in' },
  { w: 6.69, h: 9.61, label: '6.69 × 9.61 in' },
  { w: 7, h: 10, label: '7 × 10 in' },
  { w: 7.44, h: 9.69, label: '7.44 × 9.69 in' },
  { w: 7.5, h: 9.25, label: '7.5 × 9.25 in' },
  { w: 8, h: 10, label: '8 × 10 in', hint: 'Portrait photo book' },
  { w: 8.25, h: 6, label: '8.25 × 6 in', hint: 'Landscape' },
  { w: 8.25, h: 8.25, label: '8.25 × 8.25 in', hint: 'Square' },
  { w: 8.5, h: 8.5, label: '8.5 × 8.5 in', hint: 'Square photo book' },
  { w: 8.5, h: 11, label: '8.5 × 11 in', hint: 'Large / portfolio' },
  { w: 8.27, h: 11.69, label: 'A4 (8.27 × 11.69 in)' },
];

export const HARDCOVER_TRIM_SIZES: TrimSize[] = [
  { w: 5.5, h: 8.5, label: '5.5 × 8.5 in' },
  { w: 6, h: 9, label: '6 × 9 in' },
  { w: 6.14, h: 9.21, label: '6.14 × 9.21 in' },
  { w: 7, h: 10, label: '7 × 10 in' },
  { w: 8.25, h: 11, label: '8.25 × 11 in', hint: 'Large photo book' },
];

/** Custom trim sizes are paperback-only. */
export const CUSTOM_TRIM_LIMITS = { minW: 4, maxW: 8.5, minH: 6, maxH: 11.69 };

/** Paper thickness per page (inches) used for spine width. */
export function pageThickness(ink: Ink, paper: Paper): number {
  if (ink === 'premium-color') return 0.002347;
  if (ink === 'standard-color') return 0.002252;
  return paper === 'cream' ? 0.0025 : 0.002252;
}

export interface PageLimits {
  min: number;
  max: number;
}

export function pageLimits(spec: Pick<BookSpec, 'format' | 'ink' | 'paper' | 'trimWidth' | 'trimHeight'>): PageLimits {
  if (spec.format === 'hardcover') return { min: 75, max: 550 };
  if (spec.ink === 'standard-color') return { min: 72, max: 600 };
  // A4-ish large sizes have lower maxima.
  const large = spec.trimWidth > 8.26 && spec.trimHeight > 10.1;
  if (spec.ink === 'premium-color') return { min: 24, max: large ? 780 : 828 };
  if (spec.paper === 'cream') return { min: 24, max: large ? 730 : 776 };
  return { min: 24, max: large ? 780 : 828 };
}

/** Spine text is only allowed above this page count. */
export const SPINE_TEXT_MIN_PAGES = 79;
/** Keep spine text this far from each spine fold. */
export const SPINE_TEXT_MARGIN = 0.0625;

/** Gutter (inside) margin grows with page count so photos don't vanish into the binding. */
export function insideMargin(pageCount: number): number {
  if (pageCount <= 150) return 0.375;
  if (pageCount <= 300) return 0.5;
  if (pageCount <= 500) return 0.625;
  if (pageCount <= 700) return 0.75;
  return 0.875;
}

/** Minimum top/bottom/outside margin. */
export function outsideMargin(bleed: boolean): number {
  return bleed ? 0.375 : 0.25;
}

export function isLargeTrim(w: number, h: number): boolean {
  return w > 6.12 || h > 9;
}

export function sameSize(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.006;
}

export function findTrimSize(format: BookFormat, w: number, h: number): TrimSize | undefined {
  const list = format === 'hardcover' ? HARDCOVER_TRIM_SIZES : PAPERBACK_TRIM_SIZES;
  return list.find((t) => sameSize(t.w, w) && sameSize(t.h, h));
}

export type TrimCheck = { ok: true; standard: boolean } | { ok: false; reason: string };

/** Can KDP print this trim size in this format? */
export function checkTrim(spec: Pick<BookSpec, 'format' | 'trimWidth' | 'trimHeight' | 'ink'>): TrimCheck {
  const { format, trimWidth: w, trimHeight: h } = spec;
  if (findTrimSize(format, w, h)) {
    if (spec.ink === 'standard-color' && sameSize(w, 8.27) && sameSize(h, 11.69)) {
      return { ok: false, reason: 'Standard colour is not available for A4. Choose premium colour.' };
    }
    return { ok: true, standard: true };
  }
  if (format === 'hardcover') {
    return { ok: false, reason: 'KDP hardcovers only come in 5 sizes. Pick one of them or switch to paperback.' };
  }
  const L = CUSTOM_TRIM_LIMITS;
  if (w < L.minW || w > L.maxW || h < L.minH || h > L.maxH) {
    return {
      ok: false,
      reason: `KDP paperbacks must be ${L.minW}–${L.maxW} in wide and ${L.minH}–${L.maxH} in tall. You can still export PDFs for another printer.`,
    };
  }
  return { ok: true, standard: false };
}

export function inkPaperProblems(spec: BookSpec): string[] {
  const out: string[] = [];
  if (spec.paper === 'cream' && spec.ink !== 'bw') out.push('Cream paper is only available with black & white ink.');
  if (spec.format === 'hardcover' && spec.ink === 'standard-color') out.push('Standard colour is not available for hardcovers.');
  return out;
}

/** KDP prints an even number of pages; an odd count gets a blank page added at the end. */
export function printedPageCount(pages: number): number {
  return pages + (pages % 2);
}

export function spineWidth(spec: BookSpec, pageCount: number): number {
  const base = pageCount * pageThickness(spec.ink, spec.paper);
  // KDP sizes hardcover spines from a board table; this approximation is within a few hundredths
  // of an inch. Always compare with KDP's cover calculator before ordering hardcover proofs.
  return spec.format === 'hardcover' ? base + 0.06 : base;
}

export interface CoverLayout {
  /** Full cover sheet size. */
  width: number;
  height: number;
  /** Extra paper around the outside: 0.125" bleed for paperback, 0.51" wrap for hardcover. */
  outer: number;
  spine: { x: number; w: number };
  back: { x: number; y: number; w: number; h: number };
  front: { x: number; y: number; w: number; h: number };
  /** Inset from trim edges that text should respect. */
  safeInset: number;
  /** Hardcover hinge gap between spine and the safe area. 0 for paperback. */
  hinge: number;
  spineTextAllowed: boolean;
  /** Where KDP prints its barcode if you don't supply one (lower right of the back cover). */
  barcode: { x: number; y: number; w: number; h: number };
  hardcoverApproximate: boolean;
}

export function coverLayout(spec: BookSpec, pageCount: number): CoverLayout {
  const hard = spec.format === 'hardcover';
  const outer = hard ? 0.51 : BLEED;
  const hinge = hard ? 0.4 : 0;
  const spine = spineWidth(spec, pageCount);
  const W = spec.trimWidth;
  const H = spec.trimHeight;
  const width = outer + W + spine + W + outer;
  const height = outer + H + outer;
  const back = { x: outer, y: outer, w: W, h: H };
  const spineX = outer + W;
  const front = { x: spineX + spine, y: outer, w: W, h: H };
  const safeInset = hard ? 0.635 - 0.51 + 0.125 : 0.125;
  const bw = 2;
  const bh = 1.2;
  const barcode = {
    x: back.x + back.w - bw - Math.max(0.25, hinge) - 0.125,
    y: back.y + back.h - bh - (hard ? 0.76 - 0.51 + 0.125 : 0.25),
    w: bw,
    h: bh,
  };
  return {
    width,
    height,
    outer,
    spine: { x: spineX, w: spine },
    back,
    front,
    safeInset,
    hinge,
    spineTextAllowed: pageCount >= SPINE_TEXT_MIN_PAGES,
    barcode,
    hardcoverApproximate: hard,
  };
}

export const inToMm = (v: number) => v * MM_PER_INCH;
export const mmToIn = (v: number) => v / MM_PER_INCH;

export function formatInches(v: number, digits = 3): string {
  return `${Number(v.toFixed(digits))}″`;
}
