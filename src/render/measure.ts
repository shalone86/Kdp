import type { Measure } from '../core/text';
import { cssFamily } from './fonts';

let ctx: CanvasRenderingContext2D | null = null;

/** Measure text with the browser, in points. Call after loadFonts() resolves. */
export const domMeasure: Measure = (text, font, style, sizePt) => {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  // Measure at a large size for precision, then scale.
  ctx.font = `100px "${cssFamily(font, style)}"`;
  return (ctx.measureText(text).width / 100) * sizePt;
};
