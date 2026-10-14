// Google Photos via the Photos Picker API. Since March 2025 this is the only way third-party apps can
// read a user's existing Google Photos: the user picks photos in Google's own picker UI, and we get
// access to just those.  https://developers.google.com/photos/picker

import { jsonOrThrow } from './api';

const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}
interface GoogleOAuth2 {
  initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string; message?: string }) => void }): { requestAccessToken(): void };
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleOAuth2 } };
  }
}

let gis: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  gis ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn’t load Google sign-in'));
    document.head.appendChild(s);
  });
  return gis;
}

/** Must be called from a click handler (opens Google's consent popup). */
export function requestToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error_description ?? r.error ?? 'Sign-in failed'))),
      error_callback: (e) => reject(new Error(e.message ?? e.type)),
    });
    client.requestAccessToken();
  });
}

export interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
}

export interface PickedItem {
  id: string;
  createTime?: string;
  type?: string;
  mediaFile: { baseUrl: string; mimeType: string; filename: string; mediaFileMetadata?: { width?: number; height?: number } };
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

export async function createSession(token: string): Promise<PickerSession> {
  return jsonOrThrow(await fetch('/api/google/sessions', { method: 'POST', headers: auth(token) }));
}

export async function getSession(token: string, id: string): Promise<PickerSession> {
  return jsonOrThrow(await fetch(`/api/google/sessions/${encodeURIComponent(id)}`, { headers: auth(token) }));
}

export async function deleteSession(token: string, id: string) {
  await fetch(`/api/google/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(token) }).catch(() => undefined);
}

/** Poll until the user has finished picking (or we give up). */
export async function waitForPicks(token: string, session: PickerSession, signal: AbortSignal): Promise<void> {
  const interval = Math.max(2, parseFloat(session.pollingConfig?.pollInterval ?? '3')) * 1000;
  const timeout = Date.now() + Math.min(30 * 60, parseFloat(session.pollingConfig?.timeoutIn ?? '1800')) * 1000;
  while (Date.now() < timeout) {
    if (signal.aborted) throw new Error('Cancelled');
    const s = await getSession(token, session.id);
    if (s.mediaItemsSet) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('Timed out waiting for you to pick photos');
}

export async function listPicked(token: string, sessionId: string): Promise<PickedItem[]> {
  const out: PickedItem[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ sessionId });
    if (pageToken) qs.set('pageToken', pageToken);
    const j = await jsonOrThrow<{ mediaItems?: PickedItem[]; nextPageToken?: string }>(await fetch(`/api/google/media-items?${qs}`, { headers: auth(token) }));
    out.push(...(j.mediaItems ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out.filter((i) => (i.type ?? 'PHOTO') === 'PHOTO' && i.mediaFile?.mimeType?.startsWith('image/'));
}

export async function downloadPicked(token: string, item: PickedItem): Promise<Blob> {
  // "=d" downloads the full-resolution image (with EXIF minus location).
  const url = `${item.mediaFile.baseUrl}=d`;
  const res = await fetch(`/api/google/download?url=${encodeURIComponent(url)}`, { headers: auth(token) });
  if (!res.ok) throw new Error(`download failed (${res.status})`);
  return res.blob();
}
