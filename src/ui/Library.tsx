import { memo, useMemo, useRef, useState } from 'react';
import { sortPhotos } from '../core/autoLayout';
import type { Photo } from '../core/types';
import { useStore } from '../state/store';
import { useUi } from './Editor';
import { DRAG_PHOTO, usePhotoUrl, useProject, useUsage } from './hooks';
import { importFiles } from './importFiles';

type Filter = 'all' | 'unused';

export function Library() {
  const project = useProject();
  const usage = useUsage();
  const open = useUi((s) => s.open);
  const input = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const photos = useMemo(() => {
    const sorted = sortPhotos(project.photos, true);
    return filter === 'unused' ? sorted.filter((p) => !usage.get(p.id)) : sorted;
  }, [project.photos, filter, usage]);
  const unused = project.photos.filter((p) => !usage.get(p.id)).length;

  const togglePick = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <aside className="library">
      <div className="panel-head">
        <h3>Photos <span className="muted">({project.photos.length})</span></h3>
        <button className="btn small primary" onClick={() => input.current?.click()}>
          ＋ Add
        </button>
        <input ref={input} type="file" multiple accept="image/*,.heic,.heif" hidden onChange={(e) => e.target.files && importFiles(e.target.files)} />
      </div>
      <div className="source-mini">
        <button onClick={() => open('google')} title="Pick photos from Google Photos">Google Photos</button>
        <button onClick={() => open('immich')} title="Import from your Immich server">Immich</button>
        <button onClick={() => open('icloud')} title="Import an iCloud shared album">iCloud</button>
      </div>
      <div className="seg small">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          All
        </button>
        <button className={filter === 'unused' ? 'on' : ''} onClick={() => setFilter('unused')}>
          Not in book ({unused})
        </button>
      </div>
      {picked.size > 0 ? (
        <div className="pick-bar">
          <span>{picked.size} selected</span>
          <button
            className="btn small"
            onClick={() => {
              useStore.getState().appendPhotosToBook([...picked]);
              setPicked(new Set());
            }}
          >
            Add to book
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              if (!confirm(`Remove ${picked.size} photo(s) from this project?`)) return;
              picked.forEach((id) => useStore.getState().removePhoto(id));
              setPicked(new Set());
            }}
          >
            Remove
          </button>
          <button className="link" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      ) : (
        unused > 0 &&
        project.pages.length > 0 && (
          <button className="btn small block" onClick={() => useStore.getState().appendPhotosToBook(project.photos.filter((p) => !usage.get(p.id)).map((p) => p.id))}>
            Add {unused} unused photo{unused > 1 ? 's' : ''} to the end of the book
          </button>
        )
      )}
      <p className="hint">Drag photos onto a page. Click a frame, then click a photo here to put it there.</p>
      <div className="thumb-grid">
        {photos.map((p) => (
          <Thumb key={p.id} photo={p} used={usage.get(p.id) ?? 0} picked={picked.has(p.id)} onPick={() => togglePick(p.id)} />
        ))}
      </div>
    </aside>
  );
}

const Thumb = memo(function Thumb({ photo, used, picked, onPick }: { photo: Photo; used: number; picked: boolean; onPick: () => void }) {
  const url = usePhotoUrl(photo.id, 'thumb');
  const mp = (photo.width * photo.height) / 1e6;
  return (
    <div
      className={`thumb ${used ? 'used' : ''} ${picked ? 'picked' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_PHOTO, photo.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={(e) => {
        const s = useStore.getState();
        if (e.shiftKey || e.metaKey || e.ctrlKey) return onPick();
        if (s.selectedSlot) s.assignPhoto(s.selectedSlot, photo.id);
        else onPick();
      }}
      title={`${photo.name}\n${photo.width}×${photo.height} (${mp.toFixed(1)} MP)${photo.takenAt ? '\n' + new Date(photo.takenAt).toLocaleString() : ''}`}
    >
      {url ? <img src={url} alt={photo.name} draggable={false} /> : <div className="thumb-loading" />}
      {used > 0 && <span className="used-badge">✓{used > 1 ? used : ''}</span>}
      {mp < 2 && <span className="lowres-badge" title="Low resolution — best used small">low res</span>}
      <span className="pick-box">{picked ? '☑' : '☐'}</span>
    </div>
  );
});
