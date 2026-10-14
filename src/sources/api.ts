export interface ServerConfig {
  googleClientId: string | null;
  immichDefaultUrl: string | null;
}

let cfg: Promise<ServerConfig | null> | null = null;

/** Config from the API server, or null when the app runs without it (static hosting). */
export function serverConfig(): Promise<ServerConfig | null> {
  cfg ??= fetch('/api/config')
    .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
    .catch(() => null);
  return cfg;
}

export async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j.error ?? j.message ?? msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Run async tasks with limited concurrency. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
