// Immich (self-hosted Google Photos alternative) via its REST API with an API key.
// Create a key in Immich: Account Settings → API Keys (needs asset.read, album.read).

import { jsonOrThrow } from './api';

export interface ImmichConn {
  url: string;
  key: string;
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  assetCount: number;
  albumThumbnailAssetId: string | null;
}

export interface ImmichAsset {
  id: string;
  originalFileName: string;
  type: string;
  width?: number;
  height?: number;
  takenAt?: number;
}

const STORAGE = 'photobook.immich';

export function savedConn(): ImmichConn | null {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? 'null');
  } catch {
    return null;
  }
}
export function saveConn(c: ImmichConn | null) {
  try {
    if (c) localStorage.setItem(STORAGE, JSON.stringify(c));
    else localStorage.removeItem(STORAGE);
  } catch {
    /* storage unavailable */
  }
}

function headers(c: ImmichConn): HeadersInit {
  return { 'x-immich-url': c.url, 'x-immich-key': c.key };
}

export async function whoAmI(c: ImmichConn): Promise<{ name: string; email: string }> {
  return jsonOrThrow(await fetch('/api/immich/users/me', { headers: headers(c) }));
}

export async function listAlbums(c: ImmichConn): Promise<ImmichAlbum[]> {
  const albums = await jsonOrThrow<ImmichAlbum[]>(await fetch('/api/immich/albums', { headers: headers(c) }));
  return albums.sort((a, b) => a.albumName.localeCompare(b.albumName));
}

interface RawAsset {
  id: string;
  originalFileName: string;
  type: string;
  fileCreatedAt?: string;
  localDateTime?: string;
  exifInfo?: { exifImageWidth?: number; exifImageHeight?: number; dateTimeOriginal?: string; orientation?: string | number | null };
}

function normalize(a: RawAsset): ImmichAsset {
  const t = Date.parse(a.exifInfo?.dateTimeOriginal ?? a.localDateTime ?? a.fileCreatedAt ?? '');
  return { id: a.id, originalFileName: a.originalFileName, type: a.type, width: a.exifInfo?.exifImageWidth, height: a.exifInfo?.exifImageHeight, takenAt: Number.isNaN(t) ? undefined : t };
}

/** Photos in an album, or all favourites / recent photos when albumId is a special value. */
export async function listAssets(c: ImmichConn, scope: { albumId: string } | { favorites: true } | { recent: true }, max = 2000): Promise<ImmichAsset[]> {
  const out: ImmichAsset[] = [];
  let page: number | null = 1;
  while (page && out.length < max) {
    const body: Record<string, unknown> = { type: 'IMAGE', page, size: 250, withExif: true, order: 'desc' };
    if ('albumId' in scope) body.albumIds = [scope.albumId];
    if ('favorites' in scope) body.isFavorite = true;
    const res = await fetch('/api/immich/search/metadata', { method: 'POST', headers: { ...headers(c), 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok && 'albumId' in scope && page === 1) {
      // Older Immich versions: album details include the assets.
      const album = await jsonOrThrow<{ assets?: RawAsset[] }>(await fetch(`/api/immich/albums/${scope.albumId}`, { headers: headers(c) }));
      return (album.assets ?? []).filter((a) => a.type === 'IMAGE').map(normalize);
    }
    const j = await jsonOrThrow<{ assets: { items: RawAsset[]; nextPage: string | null } }>(res);
    out.push(...j.assets.items.filter((a) => a.type === 'IMAGE').map(normalize));
    page = j.assets.nextPage ? Number(j.assets.nextPage) : null;
  }
  return out;
}

export async function thumbnail(c: ImmichConn, id: string): Promise<Blob> {
  const res = await fetch(`/api/immich/assets/${id}/thumbnail?size=thumbnail`, { headers: headers(c) });
  if (!res.ok) throw new Error('thumbnail failed');
  return res.blob();
}

export async function original(c: ImmichConn, id: string): Promise<Blob> {
  const res = await fetch(`/api/immich/assets/${id}/original`, { headers: headers(c) });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return res.blob();
}
