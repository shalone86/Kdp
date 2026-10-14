import { describe, expect, it } from 'vitest';
import { autoLayout, DEFAULT_AUTO_OPTIONS, distribute, matchPhotosToFrames, splitChapters } from '../src/core/autoLayout';
import { framesToRects, getLayout, LAYOUTS } from '../src/core/layouts';
import { newProject, PRESETS, autoCover } from '../src/core/project';
import { preflight } from '../src/core/preflight';
import { coverDisplayList, pageDisplayList } from '../src/core/displayList';
import type { Photo } from '../src/core/types';

function photos(n: number, seed = 1): Photo[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const portrait = rnd() < 0.4;
    return { id: `p${i}`, name: `IMG_${i}.jpg`, width: portrait ? 3000 : 4000, height: portrait ? 4000 : 3000, takenAt: 1_700_000_000_000 + i * 3_600_000, source: 'local', avgColor: '#88aacc' };
  });
}

describe('distribute', () => {
  it('uses every photo and only available counts', () => {
    for (const [n, p, max] of [[100, 36, 5], [30, 22, 3], [9, 9, 3], [250, 50, 9]] as const) {
      const c = distribute(n, p, max);
      expect(c.length).toBe(p);
      expect(c.reduce((a, b) => a + b, 0)).toBe(n);
      expect(c.every((x) => x >= 1 && x <= max && x !== 7 && x !== 8)).toBe(true);
    }
  });
});

describe('matchPhotosToFrames', () => {
  it('puts portrait photos into tall frames', () => {
    const ps = [{ width: 4000, height: 3000 }, { width: 3000, height: 4000 }] as Photo[];
    const { order } = matchPhotosToFrames(ps, [0.6, 1.6]);
    expect(order).toEqual([1, 0]);
  });
});

describe('framesToRects', () => {
  it('leaves gaps only between photos', () => {
    const rects = framesToRects(getLayout('2-side').frames, { x: 1, y: 1, w: 10, h: 5 }, 0.2);
    expect(rects[0]).toEqual({ x: 1, y: 1, w: 4.9, h: 5 });
    expect(rects[1].x).toBeCloseTo(6.1);
    expect(rects[1].x + rects[1].w).toBeCloseTo(11);
  });
  it('every template frame lies inside its region', () => {
    for (const l of LAYOUTS) for (const f of l.frames) {
      expect(f.x + f.w).toBeLessThanOrEqual(1 + 1e-9);
      expect(f.y + f.h).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('autoLayout', () => {
  const preset = PRESETS[0];
  it('places every photo exactly once and reaches the page minimum', () => {
    for (const n of [5, 40, 120, 400]) {
      const project = newProject('Test', preset.spec);
      project.photos = photos(n);
      const { pages } = autoLayout(project.photos, project.spec, project.theme, DEFAULT_AUTO_OPTIONS);
      const placed = pages.flatMap((p) => p.slots.map((s) => s.photoId)).filter(Boolean);
      // title page has no photo in auto mode, so every photo is placed exactly once
      expect(placed.sort()).toEqual(project.photos.map((p) => p.id).sort());
      expect(pages.length).toBeGreaterThanOrEqual(24);
      expect(pages.length % 2).toBe(0);
      for (const p of pages) expect(p.slots.length).toBe(getLayout(p.layoutId).frames.length);
    }
  });

  it('density changes page count', () => {
    const ps = photos(200);
    const spec = preset.spec;
    const theme = newProject('t', spec).theme;
    const airy = autoLayout(ps, spec, theme, { ...DEFAULT_AUTO_OPTIONS, density: 'airy' }).pages.length;
    const packed = autoLayout(ps, spec, theme, { ...DEFAULT_AUTO_OPTIONS, density: 'packed' }).pages.length;
    expect(airy).toBeGreaterThan(packed);
  });

  it('splits chapters on time gaps', () => {
    const ps = photos(10);
    ps[5].takenAt! += 10 * 86_400_000;
    for (let i = 6; i < 10; i++) ps[i].takenAt! += 10 * 86_400_000;
    expect(splitChapters(ps, 3).map((c) => c.length)).toEqual([5, 5]);
  });
});

describe('display lists & preflight', () => {
  it('builds pages and a cover without errors for a full book', () => {
    const project = newProject('Summer', PRESETS[0].spec);
    project.photos = photos(90);
    project.pages = autoLayout(project.photos, project.spec, project.theme, DEFAULT_AUTO_OPTIONS).pages;
    project.cover = autoCover(project);
    project.pages.forEach((_, i) => {
      const dl = pageDisplayList(project, i);
      for (const it of dl.items) {
        expect(it.rect.x).toBeGreaterThanOrEqual(-1e-9);
        expect(it.rect.x + it.rect.w).toBeLessThanOrEqual(dl.width + 1e-9);
      }
    });
    const cover = coverDisplayList(project);
    expect(cover.items.some((i) => i.kind === 'image' && i.slot.photoId)).toBe(true);
    const issues = preflight(project);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('flags too few pages and low resolution', () => {
    const project = newProject('Tiny', PRESETS[0].spec);
    project.photos = [{ id: 'a', name: 'tiny.jpg', width: 400, height: 300, source: 'local' }];
    project.pages = [{ id: 'x', kind: 'photos', layoutId: 'full-bleed', slots: [{ photoId: 'a', zoom: 1, focusX: 0.5, focusY: 0.5 }] }];
    const codes = preflight(project).map((i) => i.code);
    expect(codes).toContain('too-few-pages');
    expect(codes).toContain('low-dpi');
  });
});

describe('layout variety', () => {
  it('does not use one grid for most pages', () => {
    const project = newProject('Var', PRESETS[0].spec);
    const ps = photos(120).map((p) => ({ ...p, width: 4000, height: 3000 })); // all landscape: the hardest case
    const { pages } = autoLayout(ps, project.spec, project.theme, DEFAULT_AUTO_OPTIONS);
    const photoPages = pages.filter((p) => p.kind === 'photos');
    const counts = new Map<string, number>();
    photoPages.forEach((p) => counts.set(p.layoutId, (counts.get(p.layoutId) ?? 0) + 1));
    expect(Math.max(...counts.values()) / photoPages.length).toBeLessThan(0.4);
    const repeats = photoPages.filter((p, i) => i > 0 && p.layoutId === photoPages[i - 1].layoutId).length;
    expect(repeats).toBeLessThanOrEqual(2); // some photo counts only have one grid (e.g. 9)
  });
});
