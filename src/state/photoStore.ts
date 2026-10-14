// Photos live in IndexedDB (in the browser) so nothing is uploaded anywhere.
// For each photo we keep the original, a ~1600px preview for the editor, and a small thumbnail.

import { createStore, del, get, set } from 'idb-keyval';
import { uid } from '../core/uid';
import type { Photo, PhotoSource } from '../core/types';

const store = createStore('photobook-photos', 'blobs');
const PREVIEW_PX = 1600;
const THUMB_PX = 360;

type Variant = 'orig' | 'prev' | 'thumb';
const key = (v: Variant, id: string) => `${v}:${id}`;

const urlCache = new Map<string, string>();

export async function photoUrl(id: string, variant: 'prev' | 'thumb'): Promise<string | null> {
  const k = key(variant, id);
  const cached = urlCache.get(k);
  if (cached) return cached;
  const blob = await get<Blob>(k, store);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(k, url);
  return url;
}

export function cachedPhotoUrl(id: string, variant: 'prev' | 'thumb'): string | undefined {
  return urlCache.get(key(variant, id));
}

export async function originalBlob(id: string): Promise<Blob | undefined> {
  return get<Blob>(key('orig', id), store);
}

export async function deletePhotoBlobs(id: string) {
  for (const v of ['orig', 'prev', 'thumb'] as Variant[]) {
    const k = key(v, id);
    const u = urlCache.get(k);
    if (u) URL.revokeObjectURL(u);
    urlCache.delete(k);
    await del(k, store);
  }
}

function isHeic(file: Blob & { name?: string }) {
  return /image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name ?? '');
}

export function isSupportedImage(file: File) {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|hei[cf])$/i.test(file.name);
}

async function decode(blob: Blob): Promise<{ bitmap: ImageBitmap; blob: Blob }> {
  try {
    return { bitmap: await createImageBitmap(blob, { imageOrientation: 'from-image' }), blob };
  } catch (err) {
    // Most browsers (except Safari) can't decode iPhone HEIC photos: convert them to JPEG first.
    if (isHeic(blob as Blob & { name?: string }) || blob.type === '' || /hei/.test(blob.type)) {
      const { default: heic2any } = await import('heic2any');
      const converted = (await heic2any({ blob, toType: 'image/jpeg', quality: 0.92 })) as Blob;
      return { bitmap: await createImageBitmap(converted, { imageOrientation: 'from-image' }), blob: converted };
    }
    throw err;
  }
}

async function resize(bitmap: ImageBitmap, maxPx: number, quality: number): Promise<{ blob: Blob; canvas: OffscreenCanvas | HTMLCanvasElement }> {
  const s = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * s));
  const h = Math.max(1, Math.round(bitmap.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode failed'))), 'image/jpeg', quality));
  return { blob, canvas };
}

function averageColor(canvas: HTMLCanvasElement | OffscreenCanvas): string {
  const small = document.createElement('canvas');
  small.width = 16;
  small.height = 16;
  const ctx = small.getContext('2d')!;
  ctx.drawImage(canvas as CanvasImageSource, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = d.length / 4;
  return '#' + [r / n, g / n, b / n].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

async function readTakenAt(blob: Blob): Promise<number | undefined> {
  try {
    const { default: exifr } = await import('exifr');
    const meta = await exifr.parse(blob, ['DateTimeOriginal', 'CreateDate']);
    const d: Date | undefined = meta?.DateTimeOriginal ?? meta?.CreateDate;
    return d instanceof Date && !isNaN(d.getTime()) ? d.getTime() : undefined;
  } catch {
    return undefined;
  }
}

export interface ImportMeta {
  name?: string;
  source: PhotoSource;
  takenAt?: number;
}

/** Decode, measure and store one image. Returns the Photo record. */
export async function importImage(input: Blob & { name?: string; lastModified?: number }, meta: ImportMeta): Promise<Photo> {
  const takenAtExif = await readTakenAt(input);
  const { bitmap, blob } = await decode(input);
  const id = uid();
  const prev = await resize(bitmap, PREVIEW_PX, 0.85);
  const thumb = await resize(bitmap, THUMB_PX, 0.8);
  const photo: Photo = {
    id,
    name: meta.name ?? input.name ?? 'photo.jpg',
    width: bitmap.width,
    height: bitmap.height,
    takenAt: takenAtExif ?? meta.takenAt ?? input.lastModified,
    source: meta.source,
    avgColor: averageColor(thumb.canvas),
  };
  bitmap.close();
  await set(key('orig', id), blob, store);
  await set(key('prev', id), prev.blob, store);
  await set(key('thumb', id), thumb.blob, store);
  return photo;
}

/** Import many images with limited concurrency, reporting progress. Failed files are skipped. */
export interface ImportItem {
  /** Either the image itself, or a function that downloads it (so big remote imports stream). */
  blob?: Blob & { name?: string };
  load?: () => Promise<Blob>;
  meta: ImportMeta;
}

export async function importMany(
  items: ImportItem[],
  onProgress?: (done: number, total: number) => void,
  onPhoto?: (p: Photo) => void,
): Promise<{ photos: Photo[]; failed: string[] }> {
  const photos: Photo[] = [];
  const failed: string[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        const blob = item.blob ?? (await item.load!());
        const p = await importImage(blob, item.meta);
        photos.push(p);
        onPhoto?.(p);
      } catch (e) {
        console.warn('Import failed', item.meta.name, e);
        failed.push(item.meta.name ?? item.blob?.name ?? 'unknown');
      }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { photos, failed };
}
