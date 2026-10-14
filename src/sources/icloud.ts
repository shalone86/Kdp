// iCloud shared albums (with "Public Website" enabled), read through our API server.
import { jsonOrThrow } from './api';

export interface ICloudPhoto {
  guid: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  takenAt?: number;
  caption?: string;
}

export async function loadAlbum(link: string): Promise<{ name: string; owner: string; photos: ICloudPhoto[] }> {
  return jsonOrThrow(await fetch(`/api/icloud/album?url=${encodeURIComponent(link)}`));
}

export function proxied(url: string) {
  return `/api/icloud/download?url=${encodeURIComponent(url)}`;
}

export async function download(p: ICloudPhoto): Promise<Blob> {
  const res = await fetch(proxied(p.url));
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return res.blob();
}
