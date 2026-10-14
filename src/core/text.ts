// Text layout shared by the on-screen preview and the PDF export, so line breaks match.

import type { FontId } from './types';

export type FontStyle = 'regular' | 'bold' | 'italic';

export const FONTS: Record<FontId, { label: string; css: string; styles: FontStyle[] }> = {
  playfair: { label: 'Playfair Display (elegant serif)', css: 'PB Playfair', styles: ['regular', 'bold', 'italic'] },
  lora: { label: 'Lora (book serif)', css: 'PB Lora', styles: ['regular', 'bold', 'italic'] },
  inter: { label: 'Inter (clean sans)', css: 'PB Inter', styles: ['regular', 'bold', 'italic'] },
  caveat: { label: 'Caveat (handwritten)', css: 'PB Caveat', styles: ['regular', 'bold'] },
};

/** Measures the width of a string in points at the given size. */
export type Measure = (text: string, font: FontId, style: FontStyle, sizePt: number) => number;

export function wrapText(text: string, maxWidthPt: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next) <= maxWidthPt) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    lines.push(line);
  }
  return lines;
}

export interface FittedText {
  lines: string[];
  size: number;
  lineHeight: number;
}

/**
 * Wrap text into a box, shrinking the font size (down to minSize) until it fits.
 * Box dimensions are in inches; sizes in points.
 */
export function fitText(
  text: string,
  box: { w: number; h: number },
  font: FontId,
  style: FontStyle,
  size: number,
  measure: Measure,
  opts: { minSize?: number; lineHeight?: number; maxLines?: number } = {},
): FittedText {
  const lh = opts.lineHeight ?? 1.25;
  const minSize = opts.minSize ?? Math.min(size, 7);
  const wPt = box.w * 72;
  const hPt = box.h * 72;
  let s = size;
  for (;;) {
    const lines = wrapText(text, wPt, (t) => measure(t, font, style, s));
    const widest = Math.max(0, ...lines.map((l) => measure(l, font, style, s)));
    const fits = lines.length * s * lh <= hPt + 0.01 && widest <= wPt + 0.01 && (!opts.maxLines || lines.length <= opts.maxLines);
    if (fits || s <= minSize) return { lines, size: s, lineHeight: lh };
    s = Math.max(minSize, s - Math.max(0.5, s * 0.06));
  }
}
