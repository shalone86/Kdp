// Project defaults, book presets and the automatic cover designer.

import { emptySlot, sortPhotos } from './autoLayout';
import { coverPhotoCount } from './displayList';
import type { BookSpec, CoverDesign, CoverTemplateId, Photo, Project, Theme } from './types';
import { uid } from './uid';

export interface BookPreset {
  id: string;
  name: string;
  description: string;
  emoji: string;
  spec: BookSpec;
  theme?: Partial<Theme>;
}

const colour = (w: number, h: number): BookSpec => ({ format: 'paperback', trimWidth: w, trimHeight: h, bleed: true, ink: 'premium-color', paper: 'white' });

export const PRESETS: BookPreset[] = [
  { id: 'album', name: 'Photo album', emoji: '📸', description: 'Square 8.5″ — the classic coffee-table photo book.', spec: colour(8.5, 8.5) },
  { id: 'travel', name: 'Travel book', emoji: '✈️', description: 'Landscape 8.25 × 6″ — great for wide scenery shots.', spec: colour(8.25, 6) },
  { id: 'family', name: 'Family yearbook', emoji: '👨‍👩‍👧', description: 'Portrait 8 × 10″ — room for lots of photos and captions.', spec: colour(8, 10) },
  { id: 'portfolio', name: 'Portfolio', emoji: '🖼️', description: 'Large 8.5 × 11″ — big, bold, full-page images.', spec: colour(8.5, 11), theme: { pageBackground: '#111111', textColor: '#f1f1f1', headingFont: 'inter', bodyFont: 'inter' } },
  { id: 'kids', name: 'Kids’ picture book', emoji: '🧸', description: 'Square 8.5″ with a playful handwritten font.', spec: colour(8.5, 8.5), theme: { headingFont: 'caveat', bodyFont: 'caveat' } },
  { id: 'pocket', name: 'Pocket book', emoji: '📗', description: 'Compact 6 × 9″ — cheaper to print, easy to gift.', spec: colour(6, 9) },
];

export const DEFAULT_THEME: Theme = {
  pageBackground: '#ffffff',
  textColor: '#222222',
  headingFont: 'playfair',
  bodyFont: 'lora',
  gap: 0.12,
  margin: 0.5,
  pageNumbers: false,
};

export function defaultCover(title = 'My Photo Book'): CoverDesign {
  return {
    template: 'full-bleed',
    title,
    subtitle: '',
    author: '',
    backText: '',
    slots: [emptySlot()],
    backSlot: emptySlot(),
    background: '#1f2933',
    textColor: '#ffffff',
    accentColor: '#ffffff',
    titleFont: 'playfair',
    bodyFont: 'lora',
    spineText: true,
  };
}

export function newProject(name: string, spec: BookSpec, theme: Partial<Theme> = {}): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    spec,
    photos: [],
    pages: [],
    cover: { ...defaultCover(name), titleFont: theme.headingFont ?? 'playfair', bodyFont: theme.bodyFont ?? 'lora' },
    theme: { ...DEFAULT_THEME, ...theme },
  };
}

// ------------------------------------------------------------------------------------- colour helpers

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

export function readableOn(bg: string): string {
  return luminance(bg) > 0.4 ? '#1d1d1f' : '#ffffff';
}

// ------------------------------------------------------------------------------------- auto cover

/** Score how good a photo is as the front cover for a panel of this aspect ratio. */
export function coverScore(p: Photo, panelAspect: number): number {
  const mp = (p.width * p.height) / 1e6;
  const fit = Math.abs(Math.log(p.width / p.height / panelAspect));
  return Math.min(mp, 24) / 24 - fit * 0.8;
}

export function pickCoverPhotos(photos: Photo[], panelAspect: number, count: number, exclude: string[] = []): Photo[] {
  const pool = photos.filter((p) => !exclude.includes(p.id));
  const ranked = [...pool].sort((a, b) => coverScore(b, panelAspect) - coverScore(a, panelAspect));
  if (count === 1) return ranked.slice(0, 1);
  // For collages pick good photos spread across the book rather than the top N from one moment.
  const chrono = sortPhotos(ranked.slice(0, Math.max(count * 4, count)), true);
  const step = chrono.length / count;
  return Array.from({ length: Math.min(count, chrono.length) }, (_, i) => chrono[Math.floor(i * step)]);
}

/** Build a cover automatically: choose photos, derive colours from the main photo. */
export function autoCover(project: Project, template?: CoverTemplateId): CoverDesign {
  const c = project.cover;
  const tpl = template ?? c.template;
  const { trimWidth, trimHeight } = project.spec;
  const wantWide = tpl === 'wraparound';
  const panelAspect = wantWide ? (trimWidth * 2) / trimHeight : tpl === 'band' ? trimWidth / (trimHeight * 0.66) : trimWidth / trimHeight;
  const n = coverPhotoCount(tpl);
  const picks = pickCoverPhotos(project.photos, panelAspect, n);
  const main = picks[0];
  const base = main?.avgColor ?? '#2f3e46';
  const background = luminance(base) > 0.35 ? mix(base, '#000000', 0.55) : mix(base, '#000000', 0.25);
  const back = pickCoverPhotos(project.photos, trimWidth / (trimHeight * 0.5), 1, picks.map((p) => p.id))[0];
  return {
    ...c,
    template: tpl,
    title: c.title || project.name,
    slots: Array.from({ length: n }, (_, i) => emptySlot(picks[i]?.id ?? null)),
    backSlot: emptySlot(back?.id ?? null),
    background,
    textColor: readableOn(background),
    accentColor: mix(base, '#ffffff', 0.75),
  };
}
