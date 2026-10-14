import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { preflight, summarize } from '../core/preflight';
import { useStore } from '../state/store';
import { AutoBuildDialog } from './AutoBuildDialog';
import { BookSettingsDialog } from './BookSettingsDialog';
import { Canvas } from './Canvas';
import { ExportDialog } from './ExportDialog';
import { hasType, useProject } from './hooks';
import { importFiles } from './importFiles';
import { Inspector } from './Inspector';
import { Library } from './Library';
import { PageStrip } from './PageStrip';
import { PreviewDialog } from './PreviewDialog';
import { GoogleDialog, ICloudDialog, ImmichDialog } from './SourceDialogs';

export type DialogId = 'settings' | 'export' | 'auto' | 'preview' | 'immich' | 'google' | 'icloud' | null;
export const useUi = create<{ dialog: DialogId; open(d: DialogId): void; guides: boolean; toggleGuides(): void }>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  guides: true,
  toggleGuides: () => set((s) => ({ guides: !s.guides })),
}));

export function Editor({ fontsReady }: { fontsReady: boolean }) {
  const project = useProject();
  const dialog = useUi((s) => s.dialog);
  const open = useUi((s) => s.open);
  const importing = useStore((s) => s.importing);
  const issues = useMemo(() => preflight(project), [project]);
  const sum = summarize(issues);

  useKeyboard();

  // Drop files anywhere to add them to the library.
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (e.dataTransfer?.files.length) {
        e.preventDefault();
        void importFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div className="editor">
      <TopBar errors={sum.errors} warnings={sum.warnings} />
      <Library />
      <div
        className="center"
        onDragOver={(e) => {
          if (hasType(e, 'Files')) e.preventDefault();
        }}
      >
        <Canvas fontsReady={fontsReady} />
        <PageStrip fontsReady={fontsReady} />
      </div>
      <Inspector />

      {importing && (
        <div className="import-progress">
          <span>
            {importing.label}… {importing.done}/{importing.total}
          </span>
          <div className="bar">
            <div style={{ width: `${(importing.done / Math.max(1, importing.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {dialog === 'settings' && <BookSettingsDialog onClose={() => open(null)} />}
      {dialog === 'export' && <ExportDialog issues={issues} onClose={() => open(null)} />}
      {dialog === 'auto' && <AutoBuildDialog onClose={() => open(null)} />}
      {dialog === 'preview' && <PreviewDialog fontsReady={fontsReady} onClose={() => open(null)} />}
      {dialog === 'immich' && <ImmichDialog onClose={() => open(null)} />}
      {dialog === 'google' && <GoogleDialog onClose={() => open(null)} />}
      {dialog === 'icloud' && <ICloudDialog onClose={() => open(null)} />}
    </div>
  );
}

function TopBar({ errors, warnings }: { errors: number; warnings: number }) {
  const project = useProject();
  const { rename, undo, redo, closeProject } = useStore.getState();
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const open = useUi((s) => s.open);
  const guides = useUi((s) => s.guides);
  const toggleGuides = useUi((s) => s.toggleGuides);
  const { spec } = project;
  return (
    <header className="topbar">
      <button className="icon-btn" title="All books" onClick={closeProject}>
        ←
      </button>
      <img className="logo" src="/favicon.svg" alt="" />
      <input className="title-input" value={project.name} onChange={(e) => rename(e.target.value)} aria-label="Project name" />
      <button className="chip" onClick={() => open('settings')} title="Book size, paper and style">
        {spec.format === 'hardcover' ? 'Hardcover' : 'Paperback'} · {spec.trimWidth}×{spec.trimHeight}″ · {spec.ink === 'premium-color' ? 'Premium colour' : spec.ink === 'standard-color' ? 'Standard colour' : 'B&W'} · {project.pages.length} pages
      </button>
      <div className="spacer" />
      <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
        ↶
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
        ↷
      </button>
      <button className={`btn ghost ${guides ? 'on' : ''}`} onClick={toggleGuides} title="Show trim, margins and bleed">
        Guides
      </button>
      <button className="btn" onClick={() => open('settings')}>
        ⚙ Book setup
      </button>
      <button className="btn" onClick={() => open('auto')}>
        ✨ Auto-layout
      </button>
      <button className="btn" onClick={() => open('preview')} disabled={!project.pages.length}>
        👁 Preview
      </button>
      <button className="btn primary" onClick={() => open('export')}>
        Check & export {errors ? <span className="badge err">{errors}</span> : warnings ? <span className="badge warn">{warnings}</span> : <span className="badge ok">✓</span>}
      </button>
    </header>
  );
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedSlot) {
        e.preventDefault();
        s.removeFromSlot(s.selectedSlot);
      } else if (e.key === 'Escape') {
        s.selectSlot(null);
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && s.project) {
        const n = s.project.pages.length;
        const cur = s.selection.kind === 'cover' ? -1 : s.selection.index;
        const next = Math.max(-1, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
        s.select(next < 0 ? { kind: 'cover' } : { kind: 'page', index: next });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
