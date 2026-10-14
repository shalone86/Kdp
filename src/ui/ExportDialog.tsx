import { useState } from 'react';
import { printedPageCount } from '../core/kdp';
import type { Issue } from '../core/preflight';
import { minimumListPrice, printingCostUSD, royaltyRate, royaltyUSD, suggestedListPrice } from '../core/pricing';
import { useStore } from '../state/store';
import { useProject } from './hooks';
import { Modal } from './Modal';

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'photobook';
}

export function ExportDialog({ issues, onClose }: { issues: Issue[]; onClose: () => void }) {
  const project = useProject();
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<'check' | 'price' | 'kdp'>('check');
  const errors = issues.filter((i) => i.level === 'error');
  const pages = printedPageCount(project.pages.length);

  const run = async (kind: 'interior' | 'cover') => {
    setBusy(kind);
    setProgress(0);
    try {
      // pdf-lib is large, so it's only loaded when someone exports.
      const { exportInteriorPdf, exportCoverPdf, downloadBytes } = await import('../render/pdf');
      const fn = kind === 'interior' ? exportInteriorPdf : exportCoverPdf;
      const bytes = await fn(project, (d, t) => setProgress(d / Math.max(1, t)));
      downloadBytes(bytes, `${slug(project.name)}-${kind}.pdf`);
      useStore.getState().showToast(`${kind === 'interior' ? 'Interior' : 'Cover'} PDF downloaded (${(bytes.length / 1e6).toFixed(1)} MB)`);
    } catch (e) {
      console.error(e);
      alert(`Export failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const goTo = (i: Issue) => {
    if (i.where === 'cover') useStore.getState().select({ kind: 'cover' });
    else if (typeof i.where === 'number') useStore.getState().select({ kind: 'page', index: i.where });
    onClose();
  };

  return (
    <Modal title="Check & export" onClose={onClose} wide>
      <div className="tabs">
        <button className={tab === 'check' ? 'on' : ''} onClick={() => setTab('check')}>
          1. Check & download
        </button>
        <button className={tab === 'price' ? 'on' : ''} onClick={() => setTab('price')}>
          2. Price & royalties
        </button>
        <button className={tab === 'kdp' ? 'on' : ''} onClick={() => setTab('kdp')}>
          3. Upload to KDP
        </button>
      </div>

      {tab === 'check' && (
        <>
          {issues.length === 0 ? (
            <p className="ok-banner">✓ Everything looks good for KDP.</p>
          ) : (
            <ul className="issues">
              {issues.map((i, k) => (
                <li key={k} className={i.level}>
                  <span className="lvl">{i.level === 'error' ? '⛔' : i.level === 'warning' ? '⚠️' : 'ℹ️'}</span>
                  <span>{i.message}</span>
                  {i.where != null && (
                    <button className="link" onClick={() => goTo(i)}>
                      Show
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {errors.length > 0 && <p className="note error">Fix the ⛔ items first — KDP will reject the files otherwise. You can still download drafts.</p>}
          <div className="export-buttons">
            <button className="btn primary big" disabled={!!busy || !project.pages.length} onClick={() => run('interior')}>
              {busy === 'interior' ? `Making interior… ${Math.round(progress * 100)}%` : '⬇ Download interior PDF'}
            </button>
            <button className="btn primary big" disabled={!!busy} onClick={() => run('cover')}>
              {busy === 'cover' ? 'Making cover…' : '⬇ Download cover PDF'}
            </button>
          </div>
          <p className="hint">
            The interior is {pages} pages at {project.spec.trimWidth} × {project.spec.trimHeight}″{project.spec.bleed ? ' with bleed' : ''}. Photos are embedded at up to 300 DPI and fonts are embedded, as KDP requires. Big books can take a minute.
          </p>
        </>
      )}

      {tab === 'price' && <Pricing />}
      {tab === 'kdp' && <KdpSteps />}
    </Modal>
  );
}

function Pricing() {
  const project = useProject();
  const pages = printedPageCount(project.pages.length);
  const cost = printingCostUSD(project.spec, pages);
  const [price, setPrice] = useState(() => (cost.available ? suggestedListPrice(cost.cost) : 0));
  if (!cost.available) return <p className="note">{cost.note}</p>;
  const min = minimumListPrice(cost.cost);
  const royalty = royaltyUSD(price, cost.cost);
  return (
    <div className="pricing">
      <p className="muted">Estimates for Amazon.com. KDP shows exact numbers when you set your price.</p>
      <dl className="price-dl">
        <dt>Printing cost per copy</dt>
        <dd>${cost.cost.toFixed(2)}</dd>
        <dt>Lowest price KDP allows</dt>
        <dd>${min.toFixed(2)}</dd>
      </dl>
      <label className="field">
        <span>Your list price (USD)</span>
        <input type="number" step={0.5} min={min} value={price} onChange={(e) => setPrice(Number(e.target.value))} />
      </label>
      <p className={`royalty ${royalty < 0 ? 'neg' : ''}`}>
        You earn <strong>${royalty.toFixed(2)}</strong> per copy ({Math.round(royaltyRate(price) * 100)}% royalty minus printing).
        {price < 9.99 && ' Prices of $9.99 and up earn 60% instead of 50%.'}
      </p>
      <p className="hint">Want to lower the printing cost? Use fewer pages (“Packed” auto-layout), or a size of 6.12″ wide × 9″ tall or smaller, which KDP prints more cheaply. Author copies cost just the printing cost plus shipping.</p>
    </div>
  );
}

function KdpSteps() {
  const project = useProject();
  const s = project.spec;
  const ink = s.ink === 'premium-color' ? 'Premium Color' : s.ink === 'standard-color' ? 'Standard Color' : 'Black & white';
  return (
    <ol className="kdp-steps">
      <li>
        Sign in at <a href="https://kdp.amazon.com" target="_blank" rel="noreferrer">kdp.amazon.com</a> and choose <b>Create → {s.format === 'hardcover' ? 'Hardcover' : 'Paperback'}</b>.
      </li>
      <li>
        <b>Details:</b> enter the title “{project.cover.title || project.name}”{project.cover.author ? ` and author “${project.cover.author}”` : ''}, a description and keywords.
      </li>
      <li>
        <b>Content → ISBN:</b> pick “Get a free KDP ISBN” (easiest).
      </li>
      <li>
        <b>Print options:</b> Ink and paper = <b>{ink} / {s.paper === 'cream' ? 'Cream' : 'White'}</b>; Trim size = <b>{s.trimWidth} × {s.trimHeight} in</b>; Bleed = <b>{s.bleed ? 'Bleed (PDF only)' : 'No bleed'}</b>; Cover finish = Glossy (makes photos pop) or Matte.
      </li>
      <li>
        <b>Manuscript:</b> upload the <b>interior PDF</b>.
      </li>
      <li>
        <b>Book cover:</b> choose “Upload a cover you already have” and upload the <b>cover PDF</b>.
      </li>
      <li>
        Click <b>Launch Previewer</b> and flip through every page. Fix anything flagged, re-export and re-upload.
      </li>
      <li>
        <b>Order a proof copy</b> before publishing — colours on paper differ from screens. Then set your price and publish. 🎉
      </li>
    </ol>
  );
}
