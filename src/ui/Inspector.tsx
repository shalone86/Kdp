import { useMemo } from 'react';
import { COVER_TEMPLATES, coverDisplayList, pageDisplayList, type SlotRef } from '../core/displayList';
import { dpiQuality, placeImage } from '../core/geometry';
import { coverLayout, formatInches, printedPageCount, SPINE_TEXT_MIN_PAGES } from '../core/kdp';
import { getLayout, LAYOUTS, PHOTO_COUNTS, type LayoutTemplate } from '../core/layouts';
import { FONTS } from '../core/text';
import type { FontId, Page } from '../core/types';
import { getSlot, useStore } from '../state/store';
import { usePhotoMap, useProject } from './hooks';

export function Inspector() {
  const selection = useStore((s) => s.selection);
  const slot = useStore((s) => s.selectedSlot);
  return (
    <aside className="inspector">
      {slot && <SlotPanel refSlot={slot} />}
      {selection.kind === 'cover' ? <CoverPanel /> : <PagePanel index={selection.index} />}
    </aside>
  );
}

function SlotPanel({ refSlot }: { refSlot: SlotRef }) {
  const project = useProject();
  const photos = usePhotoMap();
  const s = getSlot(project, refSlot);
  const { updateSlot, removeFromSlot, selectSlot } = useStore.getState();
  const dl = useMemo(() => {
    if (refSlot.target === 'page') {
      const i = project.pages.findIndex((p) => p.id === refSlot.pageId);
      return i >= 0 ? pageDisplayList(project, i) : null;
    }
    return coverDisplayList(project);
  }, [project, refSlot]);
  if (!s) return null;
  const photo = s.photoId ? photos.get(s.photoId) : undefined;
  const item = dl?.items.find((it) => it.kind === 'image' && JSON.stringify(it.ref) === JSON.stringify(refSlot));
  const dpi = photo && item ? placeImage(item.rect, photo, s).dpi : 0;
  const q = dpiQuality(dpi);
  return (
    <section className="panel slot-panel">
      <div className="panel-head">
        <h3>Selected photo</h3>
        <button className="icon-btn" onClick={() => selectSlot(null)} title="Done">
          ✕
        </button>
      </div>
      {photo ? (
        <>
          <p className="muted small ellipsis">{photo.name}</p>
          <p className={`quality ${q}`}>
            {Math.round(dpi)} DPI — {q === 'good' ? 'sharp in print 👍' : q === 'ok' ? 'acceptable (300 is ideal)' : 'too low, will look blurry'}
          </p>
          <label className="field">
            <span>Zoom</span>
            <input type="range" min={1} max={4} step={0.01} value={s.zoom} onChange={(e) => updateSlot(refSlot, { zoom: Number(e.target.value) }, { history: false })} onPointerDown={() => useStore.getState().checkpoint()} />
          </label>
          <p className="hint">Drag the photo on the page to choose what shows. Scroll over it to zoom.</p>
          <div className="btn-row">
            <button className="btn small" onClick={() => updateSlot(refSlot, { zoom: 1, focusX: 0.5, focusY: 0.5 })}>
              Reset crop
            </button>
            <button className="btn small danger" onClick={() => removeFromSlot(refSlot)}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <p className="hint">Empty frame — drag a photo here, or click a photo in the library.</p>
      )}
    </section>
  );
}

function LayoutIcon({ t, aspect }: { t: LayoutTemplate; aspect: number }) {
  const w = 44;
  const h = w / aspect;
  const pad = t.region === 'bleed' ? 0 : 4;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="layout-icon">
      <rect x={0} y={0} width={w} height={h} fill="#fff" stroke="#c9ccd1" />
      {t.frames.map((f, i) => (
        <rect key={i} x={pad + f.x * (w - 2 * pad) + 0.8} y={pad + f.y * (h - 2 * pad) + 0.8} width={Math.max(1, f.w * (w - 2 * pad) - 1.6)} height={Math.max(1, f.h * (h - 2 * pad) - 1.6)} fill="#9aa5b1" rx={0.8} />
      ))}
    </svg>
  );
}

function PagePanel({ index }: { index: number }) {
  const project = useProject();
  const page: Page | undefined = project.pages[index];
  const { updatePage, setPageLayout, shufflePage, duplicatePage, deletePage, insertPage } = useStore.getState();
  if (!page) return <section className="panel"><p className="hint">No page selected.</p></section>;
  const layout = getLayout(page.layoutId);
  const count = layout.frames.length;
  const aspect = project.spec.trimWidth / project.spec.trimHeight;
  const hasCaption = page.caption != null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Page {index + 1}</h3>
        <span className="muted small">{index % 2 === 0 ? 'right-hand page' : 'left-hand page'}</span>
      </div>

      <label className="field">
        <span>Page type</span>
        <select
          value={page.kind}
          onChange={(e) => {
            const kind = e.target.value as Page['kind'];
            updatePage(page.id, (p) => ({
              ...p,
              kind,
              layoutId: kind === 'photos' ? (p.slots.length ? p.layoutId : 'single') : kind === 'title' ? (p.slots.length ? 'title-photo' : 'empty') : 'empty',
              slots: kind === 'photos' ? (p.slots.length ? p.slots : [{ photoId: null, zoom: 1, focusX: 0.5, focusY: 0.5 }]) : kind === 'title' ? p.slots.slice(0, 1) : [],
              heading: p.heading ?? (kind === 'title' ? project.cover.title : kind === 'text' ? 'Chapter' : undefined),
            }));
          }}
        >
          <option value="photos">Photos</option>
          <option value="title">Title page</option>
          <option value="text">Text / chapter page</option>
          <option value="blank">Blank</option>
        </select>
      </label>

      {page.kind === 'photos' && (
        <>
          <div className="field">
            <span>Photos on this page</span>
            <div className="count-row">
              {PHOTO_COUNTS.map((n) => (
                <button key={n} className={`count-btn ${n === count ? 'on' : ''}`} onClick={() => setPageLayout(page.id, LAYOUTS.find((l) => l.frames.length === n && l.id !== 'title-photo')!.id, n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Layout</span>
            <div className="layout-grid">
              {LAYOUTS.filter((l) => l.frames.length === count && l.id !== 'title-photo').map((l) => (
                <button key={l.id} className={`layout-btn ${l.id === page.layoutId ? 'on' : ''}`} title={l.name} onClick={() => setPageLayout(page.id, l.id, l.frames.length)}>
                  <LayoutIcon t={l} aspect={aspect} />
                </button>
              ))}
            </div>
          </div>
          <button className="btn small block" onClick={() => shufflePage(page.id)}>
            🔀 Try another layout
          </button>
          <label className="check">
            <input type="checkbox" checked={hasCaption} onChange={(e) => updatePage(page.id, (p) => ({ ...p, caption: e.target.checked ? '' : undefined }))} />
            <span>Caption</span>
          </label>
          {hasCaption && (
            <label className="field">
              <textarea rows={2} value={page.caption} placeholder="Write a caption…" onChange={(e) => updatePage(page.id, (p) => ({ ...p, caption: e.target.value }))} />
            </label>
          )}
        </>
      )}

      {(page.kind === 'title' || page.kind === 'text') && (
        <>
          <label className="field">
            <span>Heading</span>
            <input value={page.heading ?? ''} onChange={(e) => updatePage(page.id, (p) => ({ ...p, heading: e.target.value }))} />
          </label>
          <label className="field">
            <span>{page.kind === 'title' ? 'Subtitle' : 'Text'}</span>
            <textarea rows={page.kind === 'text' ? 6 : 2} value={page.body ?? ''} onChange={(e) => updatePage(page.id, (p) => ({ ...p, body: e.target.value }))} />
          </label>
          {page.kind === 'title' && <p className="hint">Drop a photo on the page to add one above the title.</p>}
        </>
      )}

      <label className="field">
        <span>Background</span>
        <div className="color-row">
          <input type="color" value={page.background ?? project.theme.pageBackground} onChange={(e) => updatePage(page.id, (p) => ({ ...p, background: e.target.value }))} />
          {page.background && (
            <button className="link" onClick={() => updatePage(page.id, (p) => ({ ...p, background: undefined }))}>
              use book default
            </button>
          )}
        </div>
      </label>

      <div className="btn-row wrap">
        <button className="btn small" onClick={() => insertPage(index + 1, 'photos')}>
          ＋ Page after
        </button>
        <button className="btn small" onClick={() => insertPage(index + 1, 'text')}>
          ＋ Chapter page
        </button>
        <button className="btn small" onClick={() => duplicatePage(index)}>
          Duplicate
        </button>
        <button className="btn small danger" onClick={() => deletePage(index)}>
          Delete page
        </button>
      </div>
    </section>
  );
}

function FontSelect({ value, onChange }: { value: FontId; onChange: (f: FontId) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as FontId)}>
      {(Object.keys(FONTS) as FontId[]).map((f) => (
        <option key={f} value={f}>
          {FONTS[f].label}
        </option>
      ))}
    </select>
  );
}

function CoverPanel() {
  const project = useProject();
  const c = project.cover;
  const { setCover, setCoverTemplate, autoDesignCover } = useStore.getState();
  const pages = printedPageCount(project.pages.length);
  const L = coverLayout(project.spec, pages);
  const swatches = useMemo(() => {
    const cols = project.photos.map((p) => p.avgColor).filter((x): x is string => !!x);
    return [...new Set(['#ffffff', '#111111', '#1f2933', '#f4efe6', ...cols.slice(0, 8)])];
  }, [project.photos]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>Cover</h3>
        <button className="btn small" onClick={autoDesignCover} title="Pick the best photo and matching colours">
          ✨ Auto-design
        </button>
      </div>

      <div className="field">
        <span>Style</span>
        <div className="cover-templates">
          {COVER_TEMPLATES.map((t) => (
            <button key={t.id} className={`tpl-btn ${c.template === t.id ? 'on' : ''}`} onClick={() => setCoverTemplate(t.id)} title={t.description}>
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span>Title</span>
        <input value={c.title} onChange={(e) => setCover({ title: e.target.value })} />
      </label>
      <label className="field">
        <span>Subtitle</span>
        <input value={c.subtitle} onChange={(e) => setCover({ subtitle: e.target.value })} />
      </label>
      <label className="field">
        <span>Author</span>
        <input value={c.author} onChange={(e) => setCover({ author: e.target.value })} />
      </label>
      <label className="field">
        <span>Back cover text</span>
        <textarea rows={4} value={c.backText} placeholder="A few words about this book…" onChange={(e) => setCover({ backText: e.target.value })} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Title font</span>
          <FontSelect value={c.titleFont} onChange={(f) => setCover({ titleFont: f })} />
        </label>
      </div>
      <label className="field">
        <span>Text font</span>
        <FontSelect value={c.bodyFont} onChange={(f) => setCover({ bodyFont: f })} />
      </label>

      <div className="field">
        <span>Colours</span>
        <div className="color-grid">
          <ColorField label="Background" value={c.background} swatches={swatches} onChange={(v) => setCover({ background: v })} />
          <ColorField label="Text" value={c.textColor} swatches={swatches} onChange={(v) => setCover({ textColor: v })} />
          {c.template === 'framed' && <ColorField label="Frame" value={c.accentColor} swatches={swatches} onChange={(v) => setCover({ accentColor: v })} />}
        </div>
      </div>

      <label className={`check ${L.spineTextAllowed ? '' : 'disabled'}`}>
        <input type="checkbox" checked={c.spineText} disabled={!L.spineTextAllowed} onChange={(e) => setCover({ spineText: e.target.checked })} />
        <span>
          Spine text {!L.spineTextAllowed && <em className="muted">(KDP needs {SPINE_TEXT_MIN_PAGES}+ pages — you have {pages})</em>}
        </span>
      </label>

      <p className="hint">Drag photos onto the front or back cover. KDP adds the barcode in the marked box on the back.</p>

      <div className="calc">
        <h4>KDP cover calculator</h4>
        <dl>
          <dt>Full cover</dt>
          <dd>
            {formatInches(L.width)} × {formatInches(L.height)}
          </dd>
          <dt>Spine width</dt>
          <dd>{formatInches(L.spine.w, 4)}</dd>
          <dt>Page count</dt>
          <dd>{pages}</dd>
          <dt>{project.spec.format === 'hardcover' ? 'Wrap' : 'Bleed'}</dt>
          <dd>{formatInches(L.outer)}</dd>
        </dl>
        {L.hardcoverApproximate && <p className="hint">Hardcover spine is approximate — check KDP’s cover calculator before ordering.</p>}
      </div>
    </section>
  );
}

function ColorField({ label, value, swatches, onChange }: { label: string; value: string; swatches: string[]; onChange: (v: string) => void }) {
  return (
    <div className="color-field">
      <label>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} /> {label}
      </label>
      <div className="swatches">
        {swatches.map((s) => (
          <button key={s} className="swatch" style={{ background: s }} title={s} onClick={() => onChange(s)} />
        ))}
      </div>
    </div>
  );
}
