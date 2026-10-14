// PDF export with pdf-lib. Interior and cover are separate PDFs, as KDP asks for.
// Photos are cropped and resampled to the frame at up to 300 DPI, so files stay a sensible size.

import fontkit from '@pdf-lib/fontkit';
import { degrees, PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { blankPage } from '../core/autoLayout';
import { coverDisplayList, pageDisplayList, type DisplayList, type DLItem } from '../core/displayList';
import { visibleSourceRect } from '../core/geometry';
import { hexToRgb } from '../core/project';
import { fitText, type FontStyle } from '../core/text';
import type { FontId, Photo, Project } from '../core/types';
import { originalBlob } from '../state/photoStore';
import { fontBytes } from './fonts';

const PT = 72;
const MAX_DPI = 300;

export type Progress = (done: number, total: number, label: string) => void;

class FontSet {
  private cache = new Map<string, Promise<PDFFont>>();
  constructor(private doc: PDFDocument) {}
  get(font: FontId, style: FontStyle): Promise<PDFFont> {
    const k = `${font}-${style}`;
    if (!this.cache.has(k)) this.cache.set(k, fontBytes(font, style).then((b) => this.doc.embedFont(b, { subset: false })));
    return this.cache.get(k)!;
  }
}

function colour(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgb(r / 255, g / 255, b / 255);
}

async function slotJpeg(blob: Blob, frame: { w: number; h: number }, slot: DLItem & { kind: 'image' }): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const src = visibleSourceRect(frame, { width: bitmap.width, height: bitmap.height }, slot.slot);
    const nativeDpi = src.w / frame.w;
    const dpi = Math.min(MAX_DPI, nativeDpi);
    const cw = Math.max(1, Math.round(frame.w * dpi));
    const ch = Math.max(1, Math.round(frame.h * dpi));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, src.x, src.y, src.w, src.h, 0, 0, cw, ch);
    const out = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('JPEG encode failed'))), 'image/jpeg', 0.92));
    canvas.width = canvas.height = 0;
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    bitmap.close();
  }
}

async function drawList(doc: PDFDocument, page: PDFPage, dl: DisplayList, fonts: FontSet, photos: Map<string, Photo>) {
  const H = dl.height;
  for (const it of dl.items) {
    if (it.kind === 'rect') {
      page.drawRectangle({
        x: it.rect.x * PT,
        y: (H - it.rect.y - it.rect.h) * PT,
        width: it.rect.w * PT,
        height: it.rect.h * PT,
        color: colour(it.color),
        opacity: it.opacity ?? 1,
      });
    } else if (it.kind === 'image') {
      if (!it.slot.photoId || !photos.has(it.slot.photoId)) continue;
      const blob = await originalBlob(it.slot.photoId);
      if (!blob) continue;
      const jpg = await doc.embedJpg(await slotJpeg(blob, it.rect, it));
      page.drawImage(jpg, { x: it.rect.x * PT, y: (H - it.rect.y - it.rect.h) * PT, width: it.rect.w * PT, height: it.rect.h * PT });
    } else {
      await drawText(page, it, H, fonts);
    }
  }
}

async function drawText(page: PDFPage, it: DLItem & { kind: 'text' }, H: number, fonts: FontSet) {
  if (!it.text.trim()) return;
  const font = await fonts.get(it.font, it.style);
  const rotated = it.rotate === 90;
  const box = rotated ? { w: it.rect.h, h: it.rect.w } : { w: it.rect.w, h: it.rect.h };
  const fitted = fitText(it.text, box, it.font, it.style, it.size, (t, _f, _s, size) => font.widthOfTextAtSize(t, size), { maxLines: it.maxLines });
  const size = fitted.size;
  const lineH = size * fitted.lineHeight;
  const full = font.heightAtSize(size);
  const ascent = font.heightAtSize(size, { descender: false });
  const total = fitted.lines.length * lineH;
  const boxH = box.h * PT;
  const top = it.valign === 'top' ? 0 : it.valign === 'bottom' ? boxH - total : (boxH - total) / 2;
  const color = colour(it.color);
  fitted.lines.forEach((line, i) => {
    const w = font.widthOfTextAtSize(line, size);
    const u = it.align === 'left' ? 0 : it.align === 'right' ? box.w * PT - w : (box.w * PT - w) / 2;
    const v = top + i * lineH + (lineH - full) / 2 + ascent; // baseline, from the top of the box
    if (!rotated) {
      page.drawText(line, { x: it.rect.x * PT + u, y: (H - it.rect.y) * PT - v, size, font, color });
    } else {
      // Rotated 90° clockwise: text runs down the page, its "top" faces right.
      const x = (it.rect.x + it.rect.w) * PT - v;
      const y = (H - it.rect.y) * PT - u;
      page.drawText(line, { x, y, size, font, color, rotate: degrees(-90) });
    }
  });
}

function newDoc(project: Project, subject: string) {
  return PDFDocument.create().then((doc) => {
    doc.registerFontkit(fontkit);
    doc.setTitle(project.cover.title || project.name);
    if (project.cover.author) doc.setAuthor(project.cover.author);
    doc.setSubject(subject);
    doc.setCreator('Photobook Studio');
    return doc;
  });
}

export async function exportInteriorPdf(project: Project, onProgress?: Progress): Promise<Uint8Array> {
  // KDP prints in spreads: pad to an even page count.
  const pages = project.pages.length % 2 ? [...project.pages, blankPage()] : project.pages;
  const p: Project = { ...project, pages };
  const doc = await newDoc(project, 'Interior');
  const fonts = new FontSet(doc);
  const photos = new Map(project.photos.map((x) => [x.id, x]));
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i, pages.length, `Page ${i + 1} of ${pages.length}`);
    const dl = pageDisplayList(p, i);
    const page = doc.addPage([dl.width * PT, dl.height * PT]);
    const trim = dl.guides.find((g) => g.kind === 'trim')!.rect;
    page.setTrimBox(trim.x * PT, (dl.height - trim.y - trim.h) * PT, trim.w * PT, trim.h * PT);
    page.setBleedBox(0, 0, dl.width * PT, dl.height * PT);
    await drawList(doc, page, dl, fonts, photos);
  }
  onProgress?.(pages.length, pages.length, 'Saving PDF…');
  return doc.save();
}

export async function exportCoverPdf(project: Project, onProgress?: Progress): Promise<Uint8Array> {
  const doc = await newDoc(project, 'Cover');
  const fonts = new FontSet(doc);
  const photos = new Map(project.photos.map((x) => [x.id, x]));
  onProgress?.(0, 1, 'Cover');
  const dl = coverDisplayList(project);
  const page = doc.addPage([dl.width * PT, dl.height * PT]);
  await drawList(doc, page, dl, fonts, photos);
  onProgress?.(1, 1, 'Saving PDF…');
  return doc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string, type = 'application/pdf') {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
