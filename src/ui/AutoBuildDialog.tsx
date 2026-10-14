import { useStore } from '../state/store';
import type { Density, LayoutStyle } from '../core/autoLayout';
import { useProject } from './hooks';
import { Modal } from './Modal';

const DENSITIES: { id: Density; name: string; desc: string }[] = [
  { id: 'airy', name: 'Spacious', desc: '1–3 photos per page. Big photos, more pages.' },
  { id: 'balanced', name: 'Balanced', desc: '1–5 photos per page. A good mix.' },
  { id: 'packed', name: 'Packed', desc: 'Up to 9 per page. Fewer pages, lower price.' },
];
const STYLES: { id: LayoutStyle; name: string; desc: string }[] = [
  { id: 'clean', name: 'Clean', desc: 'White borders around every photo.' },
  { id: 'mixed', name: 'Mixed', desc: 'Borders, with some edge-to-edge hero pages.' },
  { id: 'bleed', name: 'Bold', desc: 'Lots of edge-to-edge photos.' },
];

export function AutoBuildDialog({ onClose }: { onClose: () => void }) {
  const project = useProject();
  const opts = useStore((s) => s.autoOptions);
  const { setAutoOptions, autoBuild } = useStore.getState();
  const hasPages = project.pages.length > 0;
  return (
    <Modal
      title="Auto-layout"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!project.photos.length}
            onClick={() => {
              if (hasPages && !confirm('This replaces your current pages (you can undo). Continue?')) return;
              autoBuild();
              onClose();
            }}
          >
            {hasPages ? 'Rebuild my book' : 'Build my book'}
          </button>
        </>
      }
    >
      <p className="muted">We’ll arrange your {project.photos.length} photos into pages, matching tall photos to tall frames and wide photos to wide frames. The book is padded to KDP’s minimum page count if needed.</p>
      <div className="field">
        <span>How many photos per page?</span>
        <div className="option-cards">
          {DENSITIES.map((d) => (
            <button key={d.id} className={`option-card ${opts.density === d.id ? 'on' : ''}`} onClick={() => setAutoOptions({ density: d.id })}>
              <strong>{d.name}</strong>
              <small>{d.desc}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Style</span>
        <div className="option-cards">
          {STYLES.map((d) => (
            <button key={d.id} className={`option-card ${opts.style === d.id ? 'on' : ''}`} onClick={() => setAutoOptions({ style: d.id })}>
              <strong>{d.name}</strong>
              <small>{d.desc}</small>
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={opts.sortByDate} onChange={(e) => setAutoOptions({ sortByDate: e.target.checked })} />
        <span>Sort by date taken</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={opts.titlePage} onChange={(e) => setAutoOptions({ titlePage: e.target.checked })} />
        <span>Start with a title page</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={opts.chapterGapDays > 0} onChange={(e) => setAutoOptions({ chapterGapDays: e.target.checked ? 3 : 0 })} />
        <span>Add chapter pages when there’s a gap of several days between photos (great for yearbooks & trips)</span>
      </label>
    </Modal>
  );
}
