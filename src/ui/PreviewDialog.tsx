import { useEffect, useMemo, useState } from 'react';
import { coverDisplayList, pageDisplayList } from '../core/displayList';
import { coverLayout, printedPageCount } from '../core/kdp';
import { useElementSize, usePhotoMap, useProject } from './hooks';
import { PageView } from './PageView';

/** Read-through preview of the finished book: front cover, then each spread, trimmed as it will be printed. */
export function PreviewDialog({ onClose, fontsReady }: { onClose: () => void; fontsReady: boolean }) {
  const project = useProject();
  const photos = usePhotoMap();
  const n = project.pages.length;
  const spreads = useMemo(() => {
    const s: [number | null, number | null][] = [[null, 0]];
    for (let i = 1; i < n; i += 2) s.push([i, i + 1 < n ? i + 1 : null]);
    return s;
  }, [n]);
  const [pos, setPos] = useState(-1); // -1 = front cover, spreads.length = back cover
  const [ref, size] = useElementSize<HTMLDivElement>();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setPos((p) => Math.min(spreads.length, p + 1));
      if (e.key === 'ArrowLeft') setPos((p) => Math.max(-1, p - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose, spreads.length]);

  const { spec } = project;
  const scale = Math.min((size.width - 40) / (spec.trimWidth * 2), (size.height - 40) / spec.trimHeight) || 1;

  let content: React.ReactNode;
  if (pos === -1 || pos === spreads.length) {
    const dl = coverDisplayList(project);
    const L = coverLayout(spec, printedPageCount(n));
    const panel = pos === -1 ? L.front : L.back;
    content = (
      <div className="pv-clip" style={{ width: panel.w * scale, height: panel.h * scale }}>
        <div style={{ position: 'absolute', left: -panel.x * scale, top: -panel.y * scale }}>
          <PageView dl={dl} scale={scale} photos={photos} fontsReady={fontsReady} />
        </div>
      </div>
    );
  } else {
    const [l, r] = spreads[pos];
    content = (
      <div className="preview-spread">
        {[l, r].map((i, k) => {
          if (i == null) return <div key={k} style={{ width: spec.trimWidth * scale, height: spec.trimHeight * scale }} />;
          const dl = pageDisplayList(project, i);
          const trim = dl.guides.find((g) => g.kind === 'trim')!.rect;
          return (
            <div key={k} className="pv-clip page" style={{ width: trim.w * scale, height: trim.h * scale }}>
              <div style={{ position: 'absolute', left: -trim.x * scale, top: -trim.y * scale }}>
                <PageView dl={dl} scale={scale} photos={photos} fontsReady={fontsReady} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="preview">
      <div className="preview-bar">
        <span>{pos === -1 ? 'Front cover' : pos === spreads.length ? 'Back cover' : `Pages ${spreads[pos].filter((x) => x != null).map((x) => x! + 1).join('–')}`}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setPos(Math.max(-1, pos - 1))} disabled={pos === -1}>
          ← Prev
        </button>
        <button className="btn" onClick={() => setPos(Math.min(spreads.length, pos + 1))} disabled={pos === spreads.length}>
          Next →
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="preview-stage" ref={ref} onClick={() => setPos(Math.min(spreads.length, pos + 1))}>
        {size.width > 0 && content}
      </div>
    </div>
  );
}
