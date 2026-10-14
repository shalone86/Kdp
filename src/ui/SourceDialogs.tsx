import { useEffect, useRef, useState } from 'react';
import { serverConfig } from '../sources/api';
import * as google from '../sources/google';
import * as icloud from '../sources/icloud';
import * as immich from '../sources/immich';
import { importBlobs } from './importFiles';
import { Modal } from './Modal';

// ------------------------------------------------------------------------------------- shared grid

interface GridItem {
  key: string;
  label: string;
  /** Either a URL usable in <img>, or a loader for images that need auth headers. */
  thumb: string | (() => Promise<Blob>);
}

function LazyThumb({ thumb }: { thumb: GridItem['thumb'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState(typeof thumb === 'string' ? thumb : '');
  useEffect(() => {
    if (typeof thumb === 'string' || !ref.current) return;
    let url = '';
    let alive = true;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      thumb()
        .then((b) => {
          url = URL.createObjectURL(b);
          if (alive) setSrc(url);
        })
        .catch(() => undefined);
    });
    io.observe(ref.current);
    return () => {
      alive = false;
      io.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [thumb]);
  return <div ref={ref} className="pick-thumb" style={{ backgroundImage: src ? `url("${src}")` : undefined }} />;
}

function PickGrid({ items, selected, setSelected }: { items: GridItem[]; selected: Set<string>; setSelected: (s: Set<string>) => void }) {
  const all = selected.size === items.length && items.length > 0;
  return (
    <>
      <div className="pick-toolbar">
        <span>
          {selected.size} of {items.length} selected
        </span>
        <button className="link" onClick={() => setSelected(all ? new Set() : new Set(items.map((i) => i.key)))}>
          {all ? 'Select none' : 'Select all'}
        </button>
      </div>
      <div className="pick-grid">
        {items.map((it) => (
          <button
            key={it.key}
            className={`pick-item ${selected.has(it.key) ? 'on' : ''}`}
            title={it.label}
            onClick={() => {
              const s = new Set(selected);
              if (s.has(it.key)) s.delete(it.key);
              else s.add(it.key);
              setSelected(s);
            }}
          >
            <LazyThumb thumb={it.thumb} />
            <span className="pick-check">{selected.has(it.key) ? '✓' : ''}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function NoServer() {
  return (
    <p className="note error">
      This needs the Photobook API server, which isn’t running. Start the app with <code>npm run dev</code> (or <code>npm start</code> after building).
    </p>
  );
}

function useServer() {
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof serverConfig>>>(null);
  useEffect(() => {
    serverConfig().then((c) => {
      setCfg(c);
      setState(c ? 'ok' : 'missing');
    });
  }, []);
  return { state, cfg };
}

// ------------------------------------------------------------------------------------------- Immich

export function ImmichDialog({ onClose }: { onClose: () => void }) {
  const server = useServer();
  const [conn, setConn] = useState<immich.ImmichConn>(() => immich.savedConn() ?? { url: '', key: '' });
  const [user, setUser] = useState<string | null>(null);
  const [albums, setAlbums] = useState<immich.ImmichAlbum[] | null>(null);
  const [assets, setAssets] = useState<immich.ImmichAsset[] | null>(null);
  const [scopeName, setScopeName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conn.url && server.cfg?.immichDefaultUrl) setConn((c) => ({ ...c, url: server.cfg!.immichDefaultUrl! }));
  }, [server.cfg, conn.url]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const me = await immich.whoAmI(conn);
      setUser(me.name || me.email);
      immich.saveConn(conn);
      setAlbums(await immich.listAlbums(conn));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openScope = async (scope: Parameters<typeof immich.listAssets>[1], name: string) => {
    setBusy(true);
    setError(null);
    try {
      const a = await immich.listAssets(conn, scope);
      setAssets(a);
      setScopeName(name);
      setSelected(new Set(a.map((x) => x.id)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    const chosen = (assets ?? []).filter((a) => selected.has(a.id));
    onClose();
    void importBlobs(
      chosen.map((a) => ({ load: () => immich.original(conn, a.id), meta: { name: a.originalFileName, source: 'immich' as const, takenAt: a.takenAt } })),
      'Importing from Immich',
    );
  };

  return (
    <Modal
      title="Import from Immich"
      onClose={onClose}
      wide
      footer={
        assets && (
          <>
            <button className="btn" onClick={() => setAssets(null)}>
              ← Albums
            </button>
            <button className="btn primary" disabled={!selected.size} onClick={doImport}>
              Import {selected.size} photo{selected.size === 1 ? '' : 's'}
            </button>
          </>
        )
      }
    >
      {server.state === 'missing' && <NoServer />}
      {!user && (
        <>
          <p className="muted">
            Connect to your Immich server. Create an API key in Immich under <b>Account Settings → API Keys</b>. Your key is kept in this browser only.
          </p>
          <label className="field">
            <span>Server URL</span>
            <input value={conn.url} placeholder="https://photos.example.com" onChange={(e) => setConn({ ...conn, url: e.target.value })} />
          </label>
          <label className="field">
            <span>API key</span>
            <input type="password" value={conn.key} onChange={(e) => setConn({ ...conn, key: e.target.value })} />
          </label>
          <button className="btn primary" disabled={busy || !conn.url || !conn.key} onClick={connect}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </>
      )}
      {error && <p className="note error">{error}</p>}
      {user && !assets && (
        <>
          <p className="muted">
            Connected as <b>{user}</b>.{' '}
            <button
              className="link"
              onClick={() => {
                immich.saveConn(null);
                setUser(null);
                setAlbums(null);
              }}
            >
              Disconnect
            </button>
          </p>
          <div className="album-list">
            <button className="album-card special" onClick={() => openScope({ favorites: true }, 'Favourites')} disabled={busy}>
              ⭐ <span>Favourites</span>
            </button>
            <button className="album-card special" onClick={() => openScope({ recent: true }, 'Recent photos')} disabled={busy}>
              🕘 <span>Recent photos</span>
            </button>
            {albums?.map((a) => (
              <button key={a.id} className="album-card" onClick={() => openScope({ albumId: a.id }, a.albumName)} disabled={busy}>
                {a.albumThumbnailAssetId && <LazyThumb thumb={() => immich.thumbnail(conn, a.albumThumbnailAssetId!)} />}
                <span>{a.albumName}</span>
                <small>{a.assetCount} items</small>
              </button>
            ))}
          </div>
          {busy && <p className="muted">Loading…</p>}
        </>
      )}
      {assets && (
        <>
          <h3>{scopeName}</h3>
          <PickGrid items={assets.map((a) => ({ key: a.id, label: a.originalFileName, thumb: () => immich.thumbnail(conn, a.id) }))} selected={selected} setSelected={setSelected} />
        </>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------ Google Photos

export function GoogleDialog({ onClose }: { onClose: () => void }) {
  const server = useServer();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'picking' | 'loading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const clientId = server.cfg?.googleClientId;

  useEffect(() => () => abort.current?.abort(), []);

  const signIn = async () => {
    setError(null);
    try {
      await google.loadGis();
      setToken(await google.requestToken(clientId!));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const pick = async () => {
    if (!token) return;
    setError(null);
    // Open the window synchronously (inside the click) so popup blockers allow it.
    const win = window.open('about:blank', 'gphotos-picker', 'width=1000,height=760');
    abort.current = new AbortController();
    try {
      setStatus('picking');
      const session = await google.createSession(token);
      if (win) win.location.href = `${session.pickerUri}/autoclose`;
      else window.open(`${session.pickerUri}/autoclose`, '_blank');
      await google.waitForPicks(token, session, abort.current.signal);
      setStatus('loading');
      const items = await google.listPicked(token, session.id);
      onClose();
      await importBlobs(
        items.map((it) => ({
          load: () => google.downloadPicked(token, it),
          meta: { name: it.mediaFile.filename, source: 'google' as const, takenAt: it.createTime ? Date.parse(it.createTime) : undefined },
        })),
        'Importing from Google Photos',
      );
      void google.deleteSession(token, session.id);
    } catch (e) {
      win?.close();
      setStatus('idle');
      setError((e as Error).message);
    }
  };

  return (
    <Modal title="Google Photos" onClose={onClose}>
      {server.state === 'missing' && <NoServer />}
      {server.state === 'ok' && !clientId && (
        <div className="note">
          <p>
            <b>Google Photos isn’t set up on this server yet.</b> Whoever runs this app needs to create a Google OAuth client ID:
          </p>
          <ol className="small">
            <li>In Google Cloud Console, create a project and enable the <b>Google Photos Picker API</b>.</li>
            <li>Configure the OAuth consent screen, then create an OAuth client ID of type <b>Web application</b> with this site as an authorised JavaScript origin.</li>
            <li>
              Put it in <code>.env</code> as <code>GOOGLE_CLIENT_ID=…</code> and restart.
            </li>
          </ol>
          <p className="small muted">Tip: you can also download photos from photos.google.com (or Google Takeout) and drag them in.</p>
        </div>
      )}
      {clientId && (
        <>
          <p className="muted">Google opens its own photo picker where you choose which photos to share with this app. We only see the photos you pick.</p>
          {!token ? (
            <button className="btn primary big" onClick={signIn}>
              Sign in with Google
            </button>
          ) : (
            <button className="btn primary big" onClick={pick} disabled={status !== 'idle'}>
              {status === 'picking' ? 'Waiting for you to finish picking…' : status === 'loading' ? 'Loading your photos…' : 'Choose photos from Google Photos'}
            </button>
          )}
          {status === 'picking' && <p className="hint">Select photos in the Google window and click “Done”. This window updates automatically.</p>}
        </>
      )}
      {error && <p className="note error">{error}</p>}
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------- iCloud

export function ICloudDialog({ onClose }: { onClose: () => void }) {
  const server = useServer();
  const [link, setLink] = useState('');
  const [album, setAlbum] = useState<Awaited<ReturnType<typeof icloud.loadAlbum>> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = await icloud.loadAlbum(link);
      setAlbum(a);
      setSelected(new Set(a.photos.map((p) => p.guid)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    const chosen = album!.photos.filter((p) => selected.has(p.guid));
    onClose();
    void importBlobs(
      chosen.map((p, i) => ({ load: () => icloud.download(p), meta: { name: `${album!.name} ${i + 1}.jpg`, source: 'icloud' as const, takenAt: p.takenAt } })),
      'Importing from iCloud',
    );
  };

  return (
    <Modal
      title="iCloud Photos"
      onClose={onClose}
      wide={!!album}
      footer={
        album && (
          <button className="btn primary" disabled={!selected.size} onClick={doImport}>
            Import {selected.size} photo{selected.size === 1 ? '' : 's'}
          </button>
        )
      }
    >
      {!album && (
        <>
          <h3>Option 1 — the quickest</h3>
          <ul className="small">
            <li>
              <b>On iPhone/iPad:</b> open this site in Safari, tap <b>＋ Add</b> → <b>Photo Library</b>, and select your photos.
            </li>
            <li>
              <b>On a Mac:</b> select photos in the Photos app and drag them straight onto this window.
            </li>
          </ul>
          <h3>Option 2 — a shared album link</h3>
          <p className="small muted">
            In Photos, open a <b>Shared Album</b> → People/Settings → turn on <b>Public Website</b> → copy the link. Apple doesn’t offer a public iCloud Photos API, so this is the only way to read your library from the web.
          </p>
          {server.state === 'missing' && <NoServer />}
          <label className="field">
            <span>Shared album link</span>
            <input value={link} placeholder="https://www.icloud.com/sharedalbum/#B0aB…" onChange={(e) => setLink(e.target.value)} />
          </label>
          <button className="btn primary" disabled={busy || !link.trim()} onClick={load}>
            {busy ? 'Opening album…' : 'Open album'}
          </button>
          <p className="hint">Shared albums store photos at up to 2048 px on the long side — fine for small photos, but use originals for full-page prints.</p>
        </>
      )}
      {error && <p className="note error">{error}</p>}
      {album && (
        <>
          <h3>
            {album.name} {album.owner && <span className="muted">by {album.owner}</span>}
          </h3>
          <PickGrid items={album.photos.map((p) => ({ key: p.guid, label: p.caption ?? p.guid, thumb: icloud.proxied(p.thumbUrl) }))} selected={selected} setSelected={setSelected} />
        </>
      )}
    </Modal>
  );
}
