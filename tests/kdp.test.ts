import { describe, expect, it } from 'vitest';
import { checkTrim, coverLayout, insideMargin, pageLimits, spineWidth } from '../src/core/kdp';
import { pageGeometry, placeImage, visibleSourceRect } from '../src/core/geometry';
import { minimumListPrice, printingCostUSD, royaltyRate, royaltyUSD, suggestedListPrice } from '../src/core/pricing';
import type { BookSpec } from '../src/core/types';

const spec = (o: Partial<BookSpec> = {}): BookSpec => ({ format: 'paperback', trimWidth: 8.5, trimHeight: 8.5, bleed: true, ink: 'premium-color', paper: 'white', ...o });

describe('KDP cover calculator', () => {
  it('matches KDP formula for a 6x9 white-paper paperback', () => {
    const s = spec({ trimWidth: 6, trimHeight: 9, ink: 'bw' });
    const L = coverLayout(s, 300);
    expect(L.spine.w).toBeCloseTo(0.6756, 4);
    expect(L.width).toBeCloseTo(0.125 + 6 + 0.6756 + 6 + 0.125, 4);
    expect(L.height).toBeCloseTo(9.25, 6);
    expect(L.front.x).toBeCloseTo(0.125 + 6 + 0.6756, 4);
  });

  it('uses the right paper thickness per ink/paper', () => {
    expect(spineWidth(spec({ ink: 'bw', paper: 'cream' }), 100)).toBeCloseTo(0.25, 6);
    expect(spineWidth(spec({ ink: 'premium-color' }), 100)).toBeCloseTo(0.2347, 6);
    expect(spineWidth(spec({ ink: 'standard-color' }), 100)).toBeCloseTo(0.2252, 6);
  });

  it('only allows spine text from 79 pages', () => {
    expect(coverLayout(spec(), 78).spineTextAllowed).toBe(false);
    expect(coverLayout(spec(), 80).spineTextAllowed).toBe(true);
  });

  it('keeps the barcode box on the back cover', () => {
    const L = coverLayout(spec(), 40);
    expect(L.barcode.x + L.barcode.w).toBeLessThan(L.spine.x);
    expect(L.barcode.y + L.barcode.h).toBeLessThan(L.back.y + L.back.h);
  });
});

describe('trim sizes and page limits', () => {
  it('accepts standard and custom sizes, rejects out-of-range', () => {
    expect(checkTrim(spec())).toEqual({ ok: true, standard: true });
    expect(checkTrim(spec({ trimWidth: 7.2, trimHeight: 7.2 }))).toEqual({ ok: true, standard: false });
    expect(checkTrim(spec({ trimWidth: 12, trimHeight: 12 })).ok).toBe(false);
    expect(checkTrim(spec({ format: 'hardcover', trimWidth: 8.5, trimHeight: 8.5 })).ok).toBe(false);
    expect(checkTrim(spec({ format: 'hardcover', trimWidth: 8.25, trimHeight: 11 })).ok).toBe(true);
  });

  it('knows min/max page counts', () => {
    expect(pageLimits(spec())).toEqual({ min: 24, max: 828 });
    expect(pageLimits(spec({ ink: 'standard-color' }))).toEqual({ min: 72, max: 600 });
    expect(pageLimits(spec({ format: 'hardcover' }))).toEqual({ min: 75, max: 550 });
  });

  it('grows the gutter with page count', () => {
    expect(insideMargin(24)).toBe(0.375);
    expect(insideMargin(151)).toBe(0.5);
    expect(insideMargin(828)).toBe(0.875);
  });
});

describe('page geometry', () => {
  const theme = { margin: 0.5 };
  it('adds bleed on the outside edge only and mirrors margins', () => {
    const s = spec({ trimWidth: 6, trimHeight: 9 });
    const right = pageGeometry(s, theme, 0, 24);
    const left = pageGeometry(s, theme, 1, 24);
    expect(right.width).toBeCloseTo(6.125);
    expect(right.height).toBeCloseTo(9.25);
    expect(right.recto).toBe(true);
    expect(right.trim.x).toBe(0);
    expect(left.trim.x).toBeCloseTo(0.125);
    // gutter (inside) on the left of a right-hand page and on the right of a left-hand page
    expect(right.live.x - right.trim.x).toBeCloseTo(0.5);
    expect(left.trim.x + left.trim.w - (left.live.x + left.live.w)).toBeCloseTo(0.5);
  });

  it('enforces the KDP gutter for thick books', () => {
    const g = pageGeometry(spec(), { margin: 0.3 }, 0, 400);
    expect(g.margins.inside).toBe(0.625);
    expect(g.margins.outside).toBe(0.3);
  });

  it('places a cover-fit image and reports DPI', () => {
    const p = placeImage({ w: 4, h: 3 }, { width: 1200, height: 1200 }, { zoom: 1, focusX: 0.5, focusY: 0.5 });
    expect(p.w).toBeCloseTo(4);
    expect(p.h).toBeCloseTo(4);
    expect(p.y).toBeCloseTo(-0.5);
    expect(p.dpi).toBeCloseTo(300);
    const src = visibleSourceRect({ w: 4, h: 3 }, { width: 1200, height: 1200 }, { zoom: 2, focusX: 0, focusY: 1 });
    expect(src.x).toBeCloseTo(0);
    expect(src.w).toBeCloseTo(600);
    expect(src.h).toBeCloseTo(450);
    expect(src.y).toBeCloseTo(750);
  });
});

describe('pricing (Amazon.com)', () => {
  it('computes premium colour printing cost', () => {
    expect(printingCostUSD(spec({ trimWidth: 6, trimHeight: 9 }), 40).cost).toBe(3.6);
    expect(printingCostUSD(spec({ trimWidth: 6, trimHeight: 9 }), 100).cost).toBe(7.5);
    expect(printingCostUSD(spec(), 100).cost).toBe(9); // 8.5" is large trim
  });
  it('uses 50/60% royalty split at $9.99', () => {
    expect(royaltyRate(9.98)).toBe(0.5);
    expect(royaltyRate(9.99)).toBe(0.6);
    expect(royaltyUSD(20, 9)).toBe(3);
  });
  it('suggests sensible prices', () => {
    expect(minimumListPrice(3.6)).toBe(7.2);
    expect(minimumListPrice(9)).toBe(15);
    const p = suggestedListPrice(9);
    expect(royaltyUSD(p, 9)).toBeGreaterThanOrEqual(3);
    expect(p % 1).toBeCloseTo(0.99);
  });
});
