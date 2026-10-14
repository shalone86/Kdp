// Preflight: everything that would get a book rejected by KDP, or look bad in print, explained plainly.

import { coverDisplayList, pageDisplayList } from './displayList';
import { DPI_MIN, DPI_GOOD, placeImage } from './geometry';
import { checkTrim, coverLayout, inkPaperProblems, pageLimits, printedPageCount, SPINE_TEXT_MIN_PAGES } from './kdp';
import type { Photo, Project } from './types';

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  message: string;
  /** 0-based page index, or 'cover'. */
  where?: number | 'cover';
  /** Machine-readable code so the UI can offer a one-click fix. */
  code: string;
}

export function preflight(project: Project): Issue[] {
  const issues: Issue[] = [];
  const { spec, pages } = project;
  const n = pages.length;
  const photos = new Map<string, Photo>(project.photos.map((p) => [p.id, p]));

  const trim = checkTrim(spec);
  if (!trim.ok) issues.push({ level: 'error', code: 'trim', message: trim.reason });
  for (const m of inkPaperProblems(spec)) issues.push({ level: 'error', code: 'ink-paper', message: m });

  const limits = pageLimits(spec);
  if (n < limits.min) issues.push({ level: 'error', code: 'too-few-pages', message: `KDP needs at least ${limits.min} pages for this book; it has ${n}. Add blank pages or spread photos out.` });
  if (n > limits.max) issues.push({ level: 'error', code: 'too-many-pages', message: `KDP allows at most ${limits.max} pages for this book; it has ${n}.` });
  if (n % 2 === 1) issues.push({ level: 'info', code: 'odd-pages', message: 'Odd page count — a blank page will be added at the end when you export.' });

  const blanks = pages.filter((p) => p.kind === 'blank').length;
  if (blanks > Math.max(4, n * 0.25)) issues.push({ level: 'warning', code: 'many-blanks', message: `${blanks} pages are blank. Add more photos or use fewer photos per page for a fuller book.` });

  if (spec.ink === 'bw' && project.photos.length) issues.push({ level: 'info', code: 'bw', message: 'Black & white ink: your photos will print in greyscale. Choose premium colour for colour photos.' });

  pages.forEach((_, i) => {
    const dl = pageDisplayList(project, i);
    let empty = 0;
    for (const it of dl.items) {
      if (it.kind !== 'image') continue;
      const photo = it.slot.photoId ? photos.get(it.slot.photoId) : undefined;
      if (!photo) {
        empty++;
        continue;
      }
      const { dpi } = placeImage(it.rect, photo, it.slot);
      if (dpi < DPI_MIN) issues.push({ level: 'warning', code: 'low-dpi', where: i, message: `Page ${i + 1}: “${photo.name}” is only ${Math.round(dpi)} DPI here and will look blurry. Use a smaller frame or a higher-resolution copy.` });
      else if (dpi < DPI_GOOD) issues.push({ level: 'info', code: 'soft-dpi', where: i, message: `Page ${i + 1}: “${photo.name}” prints at ${Math.round(dpi)} DPI — acceptable, but 300 is ideal.` });
    }
    if (empty) issues.push({ level: 'warning', code: 'empty-slot', where: i, message: `Page ${i + 1} has ${empty} empty photo frame${empty > 1 ? 's' : ''}.` });
  });

  // Cover
  const c = project.cover;
  if (!c.title.trim()) issues.push({ level: 'warning', code: 'no-title', where: 'cover', message: 'The cover has no title.' });
  const cover = coverDisplayList(project);
  for (const it of cover.items) {
    if (it.kind !== 'image') continue;
    const photo = it.slot.photoId ? photos.get(it.slot.photoId) : undefined;
    if (!photo) {
      issues.push({ level: 'warning', code: 'cover-empty', where: 'cover', message: 'The cover has an empty photo frame.' });
      continue;
    }
    const { dpi } = placeImage(it.rect, photo, it.slot);
    if (dpi < DPI_MIN) issues.push({ level: 'warning', code: 'cover-low-dpi', where: 'cover', message: `Cover photo “${photo.name}” is only ${Math.round(dpi)} DPI and will look blurry.` });
  }
  const L = coverLayout(spec, printedPageCount(n));
  if (c.spineText && !L.spineTextAllowed) issues.push({ level: 'info', code: 'spine', where: 'cover', message: `Spine text is left off: KDP only allows it on books with at least ${SPINE_TEXT_MIN_PAGES} pages.` });
  if (L.hardcoverApproximate) issues.push({ level: 'info', code: 'hardcover', where: 'cover', message: 'Hardcover spine width is approximate — compare with KDP’s cover calculator before ordering a proof.' });

  const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}

export function summarize(issues: Issue[]) {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
    infos: issues.filter((i) => i.level === 'info').length,
  };
}
