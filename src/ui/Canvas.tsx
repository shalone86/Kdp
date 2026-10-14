import { useMemo, useRef } from 'react';
import { coverDisplayList, pageDisplayList } from '../core/displayList';
import { coverLayout, formatInches, printedPageCount } from '../core/kdp';
import { useStore } from '../state/store';
import { useUi } from './Editor';
import { useElementSize, usePhotoMap, useProject } from './hooks';
import { importFiles } from './importFiles';
import { PageView } from './PageView';

export function spreadFor(index: number, count: number): [number | null, number | null] {
  if (index === 0) return [null, 0];
  const left = index % 2 === 1 ? index : index - 1;
  return [left, left + 1 < count ? left + 1 : null];
}

export function Canvas({ fontsReady }: { fontsReady: boolean }) {
  const project = useProject();
  const selection = useStore((s) => s.selection);
  const [ref, size] = useElementSize<HTMLDivElement>();

  if (!project.photos.length) return <EmptyState />;
  if (!project.pages.length) return <BuildPrompt />;

  return (
    <div className="canvas" ref={ref} onClick={() => useStore.getState().selectSlot(null)}>
      {size.width > 0 && (selection.kind === 'cover' ? <CoverStage size={size} fontsReady={fontsReady} /> : <SpreadStage index={selection.index} size={size} fontsReady={fontsReady} />)}
    </div>
  );
}

function CoverStage({ size, fontsReady }: { size: { width: number; height: number }; fontsReady: boolean }) {
  const project = useProject();
  const photos = usePhotoMap();
  const guides = useUi((s) => s.guides);
  const dl = useMemo(() => coverDisplayList(project), [project]);
  const L = coverLayout(project.spec, printedPageCount(project.pages.length));
  const scale = Math.min((size.width - 48) / dl.width, (size.height - 90) / dl.height);
  return (
    <div className="stage">
      <div className="sheet">
        <PageView dl={dl} scale={scale} photos={photos} interactive guides={guides} fontsReady={fontsReady} />
      </div>
      <div className="stage-caption">
        Full cover: {formatInches(L.width)} × {formatInches(L.height)} · spine {formatInches(L.spine.w, 4)} for {printedPageCount(project.pages.length)} pages
        {!L.spineTextAllowed && ' · spine text needs 79+ pages'}
      </div>
    </div>
  );
}

function SpreadStage({ index, size, fontsReady }: { index: number; size: { width: number; height: number }; fontsReady: boolean }) {
  const project = useProject();
  const photos = usePhotoMap();
  const guides = useUi((s) => s.guides);
  const n = project.pages.length;
  const i = Math.min(index, n - 1);
  const [l, r] = spreadFor(i, n);
  const dls = useMemo(() => [l, r].map((p) => (p == null ? null : pageDisplayList(project, p))), [project, l, r]);
  const ref = dls.find(Boolean)!;
  const totalW = ref.width * 2;
  const scale = Math.min((size.width - 48) / totalW, (size.height - 90) / ref.height);
  return (
    <div className="stage">
      <div className="spread">
        {dls.map((dl, k) => {
          const pageIndex = k === 0 ? l : r;
          if (!dl || pageIndex == null) return <div key={k} className="sheet ghost" style={{ width: ref.width * scale, height: ref.height * scale }} />;
          return (
            <div
              key={k}
              className={`sheet ${pageIndex === i ? 'current' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                if (pageIndex !== i) useStore.getState().select({ kind: 'page', index: pageIndex });
                else useStore.getState().selectSlot(null);
              }}
            >
              <PageView dl={dl} scale={scale} photos={photos} interactive guides={guides} highlight={guides} fontsReady={fontsReady} />
            </div>
          );
        })}
      </div>
      <div className="stage-caption">
        {l != null && `Page ${l + 1}`}
        {l != null && r != null && ' · '}
        {r != null && `Page ${r + 1}`} of {n}
        {guides && <span className="muted"> — the faded edge is bleed and gets trimmed off; keep text inside the dotted margin.</span>}
      </div>
    </div>
  );
}

function EmptyState() {
  const input = useRef<HTMLInputElement>(null);
  const open = useUi((s) => s.open);
  return (
    <div className="canvas">
      <div className="empty-state">
        <div className="drop-big" onClick={() => input.current?.click()}>
          <div className="drop-icon">🖼️</div>
          <h2>Drop your photos here</h2>
          <p>or click to choose files — JPEG, PNG, HEIC (iPhone) and more</p>
          <input ref={input} type="file" multiple accept="image/*,.heic,.heif" hidden onChange={(e) => e.target.files && importFiles(e.target.files)} />
        </div>
        <div className="or">or bring them in from</div>
        <div className="source-row">
          <button className="source-btn" onClick={() => open('google')}>
            <span>🟢</span> Google Photos
          </button>
          <button className="source-btn" onClick={() => open('immich')}>
            <span>🟣</span> Immich
          </button>
          <button className="source-btn" onClick={() => open('icloud')}>
            <span>☁️</span> iCloud shared album
          </button>
        </div>
        <p className="muted small">Your photos stay in your browser — nothing is uploaded until you download your PDFs.</p>
      </div>
    </div>
  );
}

function BuildPrompt() {
  const project = useProject();
  const open = useUi((s) => s.open);
  const autoBuild = useStore((s) => s.autoBuild);
  return (
    <div className="canvas">
      <div className="empty-state">
        <div className="drop-icon">✨</div>
        <h2>{project.photos.length} photos ready</h2>
        <p>We’ll sort them by date, arrange them into good-looking pages and design a cover. You can change anything afterwards.</p>
        <div className="source-row">
          <button className="btn primary big" onClick={autoBuild}>
            Create my book automatically
          </button>
          <button className="btn big" onClick={() => open('auto')}>
            Choose layout options…
          </button>
        </div>
      </div>
    </div>
  );
}
