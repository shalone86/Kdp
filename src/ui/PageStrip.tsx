import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { coverDisplayList, pageDisplayList, type DisplayList } from '../core/displayList';
import type { Photo } from '../core/types';
import { useStore } from '../state/store';
import { DRAG_PAGE, DRAG_PHOTO, hasType, usePhotoMap, useProject } from './hooks';
import { PageView } from './PageView';

const THUMB_H = 84;

export function PageStrip({ fontsReady }: { fontsReady: boolean }) {
  const project = useProject();
  const photos = usePhotoMap();
  const selection = useStore((s) => s.selection);
  const dls = useMemo(() => project.pages.map((_, i) => pageDisplayList(project, i)), [project]);
  const cover = useMemo(() => coverDisplayList(project), [project]);
  const stripRef = useRef<HTMLDivElement>(null);
  const sel = selection.kind === 'cover' ? -1 : selection.index;

  useEffect(() => {
    stripRef.current?.querySelector('.strip-item.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [sel]);

  if (!project.pages.length) return null;

  // Group into spreads: [cover], [_, 1], [2, 3], ...
  const spreads: (number | null)[][] = [[null, 0]];
  for (let i = 1; i < dls.length; i += 2) spreads.push([i, i + 1 < dls.length ? i + 1 : null]);

  return (
    <div className="strip" ref={stripRef}>
      <div className={`strip-item cover ${sel === -1 ? 'on' : ''}`} onClick={() => useStore.getState().select({ kind: 'cover' })}>
        <Thumb dl={cover} photos={photos} fontsReady={fontsReady} height={THUMB_H} />
        <small>Cover</small>
      </div>
      {spreads.map((pair, k) => (
        <div className="strip-spread" key={k}>
          {pair.map((i, j) =>
            i == null ? (
              <div key={j} className="strip-blank" style={{ width: (dls[0].width / dls[0].height) * THUMB_H }} />
            ) : (
              <StripPage key={dls[i] ? project.pages[i].id : j} index={i} dl={dls[i]} photos={photos} selected={sel === i} fontsReady={fontsReady} />
            ),
          )}
        </div>
      ))}
      <div className="strip-add">
        <button className="btn small" onClick={() => useStore.getState().insertPage(project.pages.length, 'photos')} title="Add a page at the end">
          ＋ Page
        </button>
      </div>
    </div>
  );
}

function StripPage({ index, dl, photos, selected, fontsReady }: { index: number; dl: DisplayList; photos: Map<string, Photo>; selected: boolean; fontsReady: boolean }) {
  const [over, setOver] = useState<'left' | 'right' | 'into' | null>(null);
  const page = useStore((s) => s.project!.pages[index]);
  return (
    <div
      className={`strip-item ${selected ? 'on' : ''} ${over ? 'over-' + over : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_PAGE, String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        if (hasType(e, DRAG_PAGE)) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setOver(e.clientX < r.left + r.width / 2 ? 'left' : 'right');
        } else if (hasType(e, DRAG_PHOTO)) {
          e.preventDefault();
          setOver('into');
        }
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const s = useStore.getState();
        const from = e.dataTransfer.getData(DRAG_PAGE);
        const photo = e.dataTransfer.getData(DRAG_PHOTO);
        if (from !== '') {
          const f = Number(from);
          let to = over === 'right' ? index + 1 : index;
          if (f < to) to -= 1;
          if (f !== to) s.movePage(f, to);
        } else if (photo) {
          s.addPhotoToPage(page.id, photo);
          s.select({ kind: 'page', index });
        }
        setOver(null);
      }}
      onClick={() => useStore.getState().select({ kind: 'page', index })}
      title={`Page ${index + 1} — drag to reorder, drop a photo to add it`}
    >
      <Thumb dl={dl} photos={photos} fontsReady={fontsReady} height={THUMB_H} />
      <small>{index + 1}</small>
    </div>
  );
}

const Thumb = memo(function Thumb({ dl, photos, fontsReady, height }: { dl: DisplayList; photos: Map<string, Photo>; fontsReady: boolean; height: number }) {
  return (
    <div className="strip-thumb">
      <PageView dl={dl} scale={height / dl.height} photos={photos} thumb fontsReady={fontsReady} />
    </div>
  );
});
