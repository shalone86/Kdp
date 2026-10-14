// iCloud Photos has no public API. Public *shared albums* (iCloud "Shared Albums" with "Public Website"
// turned on) are readable through the same endpoints icloud.com uses for its web viewer. These are
// unofficial and may change; everything else in the app keeps working if they do.

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export function albumToken(input: string): string {
  const s = input.trim();
  const hash = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s;
  const token = hash.split(/[;?&/]/)[0];
  if (!/^[A-Za-z0-9]{10,}$/.test(token)) throw new Error('Paste the link of an iCloud shared album that has “Public Website” turned on (https://www.icloud.com/sharedalbum/#…)');
  return token;
}

/** The token encodes which iCloud server partition hosts the album. */
export function partitionHost(token: string): string {
  const b62 = (s: string) => [...s].reduce((n, ch) => n * 62 + BASE62.indexOf(ch), 0);
  const partition = token[0] === 'A' ? b62(token[1]) : b62(token.slice(1, 3));
  return `p${String(partition).padStart(2, '0')}-sharedstreams.icloud.com`;
}

interface Derivative {
  checksum: string;
  fileSize: string;
  width: string;
  height: string;
}
interface StreamPhoto {
  photoGuid: string;
  caption?: string;
  dateCreated?: string;
  batchDateCreated?: string;
  width?: string;
  height?: string;
  mediaAssetType?: string;
  derivatives: Record<string, Derivative>;
}

export interface ICloudPhoto {
  guid: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  takenAt?: number;
  caption?: string;
}

async function post(host: string, token: string, endpoint: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://${host}/${token}/sharedstreams/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain', origin: 'https://www.icloud.com' },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

export async function fetchSharedAlbum(link: string): Promise<{ name: string; owner: string; photos: ICloudPhoto[] }> {
  const token = albumToken(link);
  let host = partitionHost(token);
  let r = await post(host, token, 'webstream', { streamCtag: null });
  if (r.status === 330 && typeof r.json['X-Apple-MMe-Host'] === 'string') {
    host = r.json['X-Apple-MMe-Host'] as string;
    r = await post(host, token, 'webstream', { streamCtag: null });
  }
  if (r.status !== 200) throw new Error('Couldn’t open that album. Make sure “Public Website” is on in the shared album settings.');
  const photos = ((r.json.photos as StreamPhoto[]) ?? []).filter((p) => p.mediaAssetType !== 'video');
  if (!photos.length) return { name: String(r.json.streamName ?? 'Shared album'), owner: String(r.json.userFirstName ?? ''), photos: [] };

  // Ask for download URLs in batches.
  const items: Record<string, { url_location: string; url_path: string }> = {};
  for (let i = 0; i < photos.length; i += 100) {
    const batch = photos.slice(i, i + 100).map((p) => p.photoGuid);
    const u = await post(host, token, 'webasseturls', { photoGuids: batch });
    Object.assign(items, (u.json.items as typeof items) ?? {});
  }
  const urlFor = (d?: Derivative) => {
    const it = d && items[d.checksum];
    return it ? `https://${it.url_location}${it.url_path}` : '';
  };

  const out: ICloudPhoto[] = [];
  for (const p of photos) {
    const ds = Object.values(p.derivatives ?? {}).filter((d) => d.checksum);
    if (!ds.length) continue;
    const bySize = [...ds].sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height));
    const best = bySize[0];
    const small = bySize.find((d) => Number(d.width) <= 800 && Number(d.width) > 0) ?? bySize[bySize.length - 1];
    const url = urlFor(best);
    if (!url) continue;
    const t = Date.parse(p.dateCreated ?? p.batchDateCreated ?? '');
    out.push({
      guid: p.photoGuid,
      url,
      thumbUrl: urlFor(small) || url,
      width: Number(best.width) || Number(p.width) || 0,
      height: Number(best.height) || Number(p.height) || 0,
      takenAt: Number.isNaN(t) ? undefined : t,
      caption: p.caption || undefined,
    });
  }
  return { name: String(r.json.streamName ?? 'Shared album'), owner: String(r.json.userFirstName ?? ''), photos: out };
}

export function isICloudAssetUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname.endsWith('.icloud-content.com');
  } catch {
    return false;
  }
}
